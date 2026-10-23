import type { Vec3 } from '../physics/PhysicsWorld';
import { CUTPURSE } from './cutpurse/tuning';
import { ENEMY_DEFS } from './defs';
import { FOE_DEFS, isFoeKind } from './foes/defs';
import type { FoeDef } from './foes/types';
import { DEFAULT_BAND, bandForRegion, enemyLevel } from './level';
import type { ActorId, AnchorLike, AnchorsPort, GatesPort } from './ports';
import { LEVEL, WORLD_AI } from './tuning';
import type { EnemyDef, LevelBand, SpawnOptions, SpawnerDef } from './types';

export interface SpawnRequest {
  spawnerId: string;
  /** `def.tag ?? def.id`. */
  spawnTag: string;
  slot: number;
  def: EnemyDef | FoeDef;
  /** The spawner slot's anchor id (`memberAnchors[slot]`, else the group anchor); the scarecrow's `scarecrowId`. */
  anchorId?: string;
  /** Ash-pile anchor ids of the spawner (the bloom). */
  piles?: readonly string[];
  feet: Vec3;
  yaw: number;
  level: number;
  patrol: AnchorLike[];
  options: SpawnOptions & { leash: boolean };
  /** `${spawnerId}#${slot}`: the ash pile this member rises from. */
  spentKey: string;
}

export interface SpawnerRegistryDeps {
  anchors: AnchorsPort;
  warn(msg: string): void;
  spawn(req: SpawnRequest): ActorId | null;
  despawn(actorId: ActorId): void;
  /** Flag gates for `{ flag, until }` groups; absent (headless) means every gate counts as open. */
  gates?: GatesPort;
  rng?: () => number;
}

/**
 * How a member left. 'escaped' is a thief that fled and despawned with the loot: its slot is freed (not spent, not
 * gone, no `groupCleared`) and refilled later while the group is live. Only thief kinds escape; the registry treats
 * 'escaped' from any other kind as a plain 'despawned'. 'retired' is a member that left the fight without a mercy (a
 * wyrmling flying off, A6a): its slot is spent like a mercy's, so it never refills, but nothing is paid.
 */
export type MemberEnd = 'died' | 'released' | 'spared' | 'calmed' | 'despawned' | 'escaped' | 'retired';

/** A freed thief slot waiting to be refilled. */
interface PendingRefill {
  spawnerId: string;
  slot: number;
  left: number;
}

export interface SpawnersPersisted {
  spent: string[];
  cleared: string[];
  /** Ash piles whose raised wraith was Released (Blightbloom piles); optional so old saves load. */
  spentPiles?: string[];
  /** Slots of never-respawning groups whose member was killed (a spared or released one is in `spent`). */
  dead?: string[];
  warmthTier: number;
  lockedBlockLevels: Record<string, number>;
}

export class SpawnerRegistry {
  private readonly defs = new Map<string, SpawnerDef>();
  private readonly slots = new Map<string, (ActorId | null)[]>();
  private readonly goneSlots = new Map<string, Set<number>>();
  private readonly firedCleared = new Set<string>();
  private readonly everSpawned = new Set<string>();
  private readonly lastOpts = new Map<string, SpawnOptions>();
  /** Groups that have members placed and have not been despawned or reset since (a refill needs its group live). */
  private readonly live = new Set<string>();
  private pendingRefills: PendingRefill[] = [];
  /** The registered def of a spawner, or undefined. */
  defOf(id: string): SpawnerDef | undefined {
    return this.defs.get(id);
  }

  /** The actor in `leaderSlot` of a group, or null. */
  leaderOf(id: string): ActorId | null {
    const slot = this.defs.get(id)?.leaderSlot;
    return slot === undefined ? null : (this.slots.get(id)?.[slot] ?? null);
  }

  private readonly byActor = new Map<ActorId, { spawnerId: string; slot: number }>();
  private readonly warned = new Set<string>();
  private spent = new Set<string>();
  private cleared = new Set<string>();
  private readonly gateOpen = new Map<string, boolean>();
  private readonly gateOff: Array<() => void> = [];
  private started = false;
  private spentPiles = new Set<string>();
  private dead = new Set<string>();
  private warmthTier = 0;
  private lockedBlockLevels: Record<string, number> = {};
  private readonly rng: () => number;

  constructor(private readonly deps: SpawnerRegistryDeps) {
    this.rng = deps.rng ?? Math.random;
  }

  define(def: SpawnerDef): void {
    if (this.defs.has(def.id)) throw new Error(`SpawnerRegistry: duplicate spawner id '${def.id}'`);
    this.defs.set(def.id, def);
    this.slots.set(def.id, new Array<ActorId | null>(Math.max(0, def.count)).fill(null));
    this.goneSlots.set(def.id, new Set());
  }

  spawnGroup(id: string, opts: SpawnOptions = {}, onlySlot?: number): ActorId[] {
    const def = this.defs.get(id);
    if (!def) {
      this.deps.warn(`spawners: unknown spawner '${id}'`);
      return [];
    }
    const anchor = this.deps.anchors.find(def.anchor);
    if (!anchor) {
      this.warnOnce(`anchor:${id}`, `spawners: spawner '${id}' has no spawn anchor '${def.anchor}'; nothing spawned`);
      return [];
    }
    const enemyDef: EnemyDef | FoeDef | undefined = isFoeKind(def.enemy) ? FOE_DEFS[def.enemy] : ENEMY_DEFS[def.enemy];
    if (!enemyDef) {
      this.warnOnce(`enemy:${id}`, `spawners: spawner '${id}' has unknown enemy '${def.enemy}'`);
      return [];
    }
    // `count` limits this call only: it is not a spawn option for the members, nor remembered for refills.
    const { count, ...memberOpts } = opts;
    if (count !== undefined && (!Number.isInteger(count) || count <= 0)) {
      this.warnOnce(`count:${id}`, `spawners: spawnGroup('${id}') ignored a bad count ${String(count)}; nothing spawned`);
      return [];
    }
    opts = memberOpts;
    if (onlySlot === undefined) this.lastOpts.set(id, opts);
    const band = this.resolveBand(def, opts.tierOffset);
    const patrol = this.resolvePatrol(def);
    const slots = this.slots.get(id)!;
    const gone = this.goneSlots.get(id)!;
    const out: ActorId[] = [];
    for (let slot = 0; slot < slots.length && out.length < (count ?? Infinity); slot++) {
      if (slots[slot] !== null || (onlySlot !== undefined && slot !== onlySlot)) continue;
      const spentKey = `${id}#${slot}`;
      if (this.spent.has(spentKey) || this.dead.has(spentKey)) continue;
      const level = this.levelFor(band);
      const own = def.memberAnchors?.[slot] ? this.deps.anchors.find(def.memberAnchors[slot]) : undefined;
      if (def.memberAnchors?.[slot] && !own) {
        this.warnOnce(`member:${id}#${slot}`, `spawners: spawner '${id}' member ${slot} has no anchor '${def.memberAnchors[slot]}'; using a ring slot`);
      }
      const feet = own ? { ...own.position } : this.slotPosition(anchor, slot, slots.length);
      const actorId = this.deps.spawn({
        spawnerId: id,
        spawnTag: def.tag ?? def.id,
        slot,
        def: memberDef(def, slot) ?? enemyDef,
        feet,
        yaw: own ? own.yaw : anchor.yaw,
        anchorId: own ? own.id : anchor.id,
        piles: def.piles,
        level,
        patrol,
        options: { ...opts, leash: opts.leash ?? def.leash ?? true, guard: opts.guard ?? def.guard, ...(def.peaceful && opts.peaceful === undefined ? { peaceful: true } : {}) },
        spentKey,
      });
      if (actorId === null) continue;
      slots[slot] = actorId;
      gone.delete(slot);
      this.byActor.set(actorId, { spawnerId: id, slot });
      out.push(actorId);
    }
    if (out.length > 0) {
      this.live.add(id);
      this.everSpawned.add(id);
      this.firedCleared.delete(id);
    }
    return out;
  }

  /**
   * A mercy was accepted: the slot is spent now, not when the enemy finally leaves, so a save during the
   * dissolve or the walk-off cannot bring it back hostile (and pay a second mercy). Undone by `unspendMercy`.
   */
  spendMercy(actorId: ActorId): void {
    const rec = this.byActor.get(actorId);
    if (rec && !this.defs.get(rec.spawnerId)?.ephemeral) this.spent.add(`${rec.spawnerId}#${rec.slot}`);
  }

  /** A spared enemy was struck before it left: it is hostile and live again, so its slot is not spent. */
  unspendMercy(actorId: ActorId): void {
    const rec = this.byActor.get(actorId);
    if (rec) this.spent.delete(`${rec.spawnerId}#${rec.slot}`);
  }

  /** Returns true exactly once when the last member of a group dies, is released or is spared. */
  onMemberGone(actorId: ActorId, how: MemberEnd): boolean {
    const rec = this.byActor.get(actorId);
    if (!rec) return false;
    this.byActor.delete(actorId);
    const slots = this.slots.get(rec.spawnerId)!;
    slots[rec.slot] = null;
    const def = this.defs.get(rec.spawnerId)!;
    if (how === 'escaped' && this.isThiefGroup(def)) {
      // The thief got away with the loot: the slot is free again (not spent, not gone), so the group is not cleared and,
      // while it stays live, the slot refills after CUTPURSE.refillSeconds out of the player's sight.
      if (this.live.has(def.id)) this.pendingRefills.push({ spawnerId: def.id, slot: rec.slot, left: CUTPURSE.refillSeconds });
      return false;
    }
    if (how === 'despawned' || how === 'escaped') return false;
    const key = `${rec.spawnerId}#${rec.slot}`;
    // 'retired' (a wyrmling that flew off without a mercy) spends the slot the same way, with no credit.
    if ((how === 'released' || how === 'spared' || how === 'calmed' || how === 'retired') && !def.ephemeral) this.spent.add(key);
    // A member of a never-respawning world group (not a manual lesson group, which replays) that died stays dead across a save, so a group that was
    // partly cleared before a save can still be cleared afterwards.
    if (how === 'died' && def.respawn === 'never' && def.activation !== 'manual' && !def.ephemeral) this.dead.add(key);
    const gone = this.goneSlots.get(rec.spawnerId)!;
    gone.add(rec.slot);
    if (slots.some((s) => s !== null)) return false;
    const allGone =
      def.respawn === 'never' && def.activation !== 'manual'
        ? slots.every((_, i) => gone.has(i) || this.spent.has(`${rec.spawnerId}#${i}`) || this.dead.has(`${rec.spawnerId}#${i}`))
        : gone.size >= slots.length;
    if (!allGone) return false;
    if (this.firedCleared.has(rec.spawnerId)) return false;
    this.firedCleared.add(rec.spawnerId);
    // A group that never respawns stays cleared across reloads, auto groups included.
    if (!def.ephemeral && (def.activation !== 'auto' || def.respawn === 'never')) this.cleared.add(rec.spawnerId);
    return true;
  }

  despawnGroup(id: string): void {
    const slots = this.slots.get(id);
    if (!slots) {
      this.deps.warn(`spawners: unknown spawner '${id}'`);
      return;
    }
    this.live.delete(id);
    this.pendingRefills = this.pendingRefills.filter((p) => p.spawnerId !== id);
    for (let i = 0; i < slots.length; i++) {
      const actorId = slots[i];
      if (actorId === null || actorId === undefined) continue;
      slots[i] = null;
      this.byActor.delete(actorId);
        this.deps.despawn(actorId);
    }
  }

  /** Despawns the group's live members and forgets that it was cleared or any of its slots spent, so `spawnGroup` refills it. */
  reset(id: string): void {
    const slots = this.slots.get(id);
    if (!slots) {
      this.warnOnce(`reset:${id}`, `spawners: unknown spawner '${id}'`);
      return;
    }
    this.despawnGroup(id);
    this.goneSlots.get(id)!.clear();
    this.firedCleared.delete(id);
    this.cleared.delete(id);
    this.live.delete(id);
    for (let i = 0; i < slots.length; i++) {
      this.spent.delete(`${id}#${i}`);
      this.dead.delete(`${id}#${i}`);
    }
  }

  /**
   * Counts down the refills of escaped thieves. A slot refills when its wait is over, its group is still live (not
   * despawned, reset or cleared) and the slot's anchor is not in the player's sight (`canSee(position)` false).
   * Returns the spawned actors.
   */
  tickRefills(dt: number, canSee: (position: Vec3) => boolean = () => false): ActorId[] {
    const out: ActorId[] = [];
    if (!(dt > 0) || this.pendingRefills.length === 0) return out;
    const keep: PendingRefill[] = [];
    for (const p of this.pendingRefills) {
      const def = this.defs.get(p.spawnerId);
      const key = `${p.spawnerId}#${p.slot}`;
      if (!def || !this.live.has(p.spawnerId) || this.cleared.has(p.spawnerId) || this.spent.has(key) || this.dead.has(key)) continue;
      if (this.slots.get(p.spawnerId)?.[p.slot] != null) continue;
      p.left -= dt;
      if (p.left > 0) {
        keep.push(p);
        continue;
      }
      const at = this.slotAnchor(def, p.slot);
      if (at && canSee(at)) {
        keep.push(p);
        continue;
      }
      out.push(...this.spawnGroup(p.spawnerId, this.lastOpts.get(p.spawnerId) ?? {}, p.slot));
    }
    this.pendingRefills = keep;
    return out;
  }

  /** Slots waiting to be refilled after a thief escaped (for tests). */
  pendingRefillSlots(id: string): number[] {
    return this.pendingRefills.filter((p) => p.spawnerId === id).map((p) => p.slot);
  }

  private slotAnchor(def: SpawnerDef, slot: number): Vec3 | null {
    const own = def.memberAnchors?.[slot] ? this.deps.anchors.find(def.memberAnchors[slot]) : undefined;
    return (own ?? this.deps.anchors.find(def.anchor))?.position ?? null;
  }

  private isThiefGroup(def: SpawnerDef): boolean {
    return !isFoeKind(def.enemy) && ENEMY_DEFS[def.enemy]?.thief === true;
  }

  alive(id: string): ActorId[] {
    return (this.slots.get(id) ?? []).filter((a): a is ActorId => a !== null);
  }

  /** Starts the auto groups and the gate groups whose gate is open; later gate changes add or remove groups. */
  startAuto(): ActorId[] {
    this.started = true;
    const out: ActorId[] = [];
    for (const def of this.defs.values()) {
      if (this.cleared.has(def.id)) continue;
      if (def.activation === 'auto' || (isGate(def.activation) && this.gateOpen.get(def.id) !== false)) {
        out.push(...this.spawnGroup(def.id));
      }
    }
    return out;
  }

  /** Watches every gate group's flags through `ctx.gates`; call once after the groups are defined. */
  bindGates(): void {
    const gates = this.deps.gates;
    for (const def of this.defs.values()) {
      const act = def.activation;
      if (!isGate(act)) continue;
      const { flag, until, unlessChoice } = act;
      const keys = [flag, until, unlessChoice?.flag].filter((k): k is string => typeof k === 'string');
      if (keys.length === 0) {
        this.deps.warn(`spawners: gate group '${def.id}' names neither flag nor until; treated as auto`);
        continue;
      }
      if (!gates) continue;
      this.gateOff.push(
        gates.watch(
          (get, str) =>
            (flag === undefined || get(flag)) &&
            (until === undefined || !get(until)) &&
            (unlessChoice === undefined || str(unlessChoice.flag) !== unlessChoice.equals),
          (open) => {
            const was = this.gateOpen.get(def.id);
            this.gateOpen.set(def.id, open);
            if (was === undefined || was === open || !this.started) return;
            if (open && !this.cleared.has(def.id)) this.spawnGroup(def.id);
            else if (!open) this.despawnGroup(def.id);
          },
          keys,
        ),
      );
    }
  }

  /**
   * After a load: gate groups follow their (re-derived) gate. An open one is refilled, a closed one leaves;
   * a cleared one stays gone either way.
   */
  resyncGates(): void {
    if (!this.started) return;
    for (const def of this.defs.values()) {
      if (!isGate(def.activation) || !this.gateOpen.has(def.id)) continue;
      if (this.gateOpen.get(def.id) && !this.cleared.has(def.id)) this.spawnGroup(def.id);
      else if (!this.gateOpen.get(def.id)) this.despawnGroup(def.id);
    }
  }

  /** Spawns the groups that wait for `interiorId` (not cleared, not already there). */
  onInteriorEntered(interiorId: string): ActorId[] {
    const out: ActorId[] = [];
    for (const def of this.defs.values()) {
      const act = def.activation;
      if (typeof act !== 'object' || !('interior' in act) || act.interior !== interiorId || this.cleared.has(def.id)) continue;
      out.push(...this.spawnGroup(def.id));
    }
    return out;
  }

  dispose(): void {
    for (const off of this.gateOff.splice(0)) off();
  }

  onRest(): ActorId[] {
    const out: ActorId[] = [];
    for (const def of this.defs.values()) {
      if (def.respawn !== 'onRest' || !this.everSpawned.has(def.id)) continue;
      out.push(...this.spawnGroup(def.id, this.lastOpts.get(def.id) ?? {}));
    }
    return out;
  }

  /** Live members whose slot the (loaded) save marks spent. */
  liveInSpentSlots(): ActorId[] {
    const out: ActorId[] = [];
    for (const [actorId, rec] of this.byActor) if (this.spent.has(`${rec.spawnerId}#${rec.slot}`)) out.push(actorId);
    return out;
  }

  /** Spawns the quest-activated groups for `questId`; a group with a `flag` waits until `flagOn(flag)` (its quest is active). */
  onQuestStarted(questId: string, flagOn: (flag: string) => boolean = () => true): ActorId[] {
    const out: ActorId[] = [];
    for (const def of this.defs.values()) {
      const act = def.activation;
      if (typeof act !== 'object' || !('quest' in act) || act.quest !== questId || this.cleared.has(def.id)) continue;
      if (act.flag !== undefined && !flagOn(act.flag)) continue;
      out.push(...this.spawnGroup(def.id));
    }
    return out;
  }

  /** Quest ids whose groups wait on `flag`. */
  questsGatedBy(flag: string): string[] {
    const out: string[] = [];
    for (const def of this.defs.values()) {
      const act = def.activation;
      if (typeof act === 'object' && 'quest' in act && act.flag === flag) out.push(act.quest);
    }
    return out;
  }

  /** The quest a group is activated by, if any. */
  questOf(spawnerId: string): string | undefined {
    const act = this.defs.get(spawnerId)?.activation;
    return typeof act === 'object' && 'quest' in act ? act.quest : undefined;
  }

  isPileSpent(pileId: string): boolean {
    return this.spentPiles.has(pileId);
  }

  /** A pile is spent when a wraith raised from it is Released. */
  markPileSpent(pileId: string): void {
    this.spentPiles.add(pileId);
  }

  unmarkPileSpent(pileId: string): void {
    this.spentPiles.delete(pileId);
  }

  // Persistence

  serialize(): SpawnersPersisted {
    const saved = (key: string) => !this.defs.get(key.replace(/#\d+$/, ''))?.ephemeral;
    return {
      spent: [...this.spent].filter(saved),
      cleared: [...this.cleared].filter(saved),
      // Omitted while empty, so saves without a bloom keep their old shape.
      ...(this.spentPiles.size > 0 ? { spentPiles: [...this.spentPiles] } : {}),
      ...(this.dead.size > 0 ? { dead: [...this.dead].filter(saved) } : {}),
      warmthTier: this.warmthTier,
      lockedBlockLevels: { ...this.lockedBlockLevels },
    };
  }

  load(data: unknown): void {
    this.spent = new Set();
    this.cleared = new Set();
    this.spentPiles = new Set();
    this.dead = new Set();
    this.pendingRefills = [];
    this.warmthTier = 0;
    this.lockedBlockLevels = {};
    if (!isRecord(data)) {
      this.deps.warn('spawners: saved data is not an object; keeping defaults');
      return;
    }
    if (Array.isArray(data.spent)) {
      for (const s of data.spent) {
        if (typeof s === 'string' && /^.+#\d+$/.test(s)) this.spent.add(s);
        else this.deps.warn(`spawners: dropped bad spent entry ${JSON.stringify(s)}`);
      }
    } else if (data.spent !== undefined) this.deps.warn('spawners: saved spent is not a list; keeping default');
    if (Array.isArray(data.cleared)) {
      for (const s of data.cleared) {
        if (typeof s === 'string') this.cleared.add(s);
        else this.deps.warn(`spawners: dropped bad cleared entry ${JSON.stringify(s)}`);
      }
    } else if (data.cleared !== undefined) this.deps.warn('spawners: saved cleared is not a list; keeping default');
    if (Array.isArray(data.dead)) {
      for (const d of data.dead) {
        if (typeof d === 'string' && /^.+#\d+$/.test(d)) this.dead.add(d);
        else this.deps.warn(`spawners: dropped bad dead entry ${JSON.stringify(d)}`);
      }
    } else if (data.dead !== undefined) this.deps.warn('spawners: saved dead is not a list; keeping default');
    if (Array.isArray(data.spentPiles)) {
      for (const s of data.spentPiles) {
        if (typeof s === 'string') this.spentPiles.add(s);
        else this.deps.warn(`spawners: dropped bad spentPiles entry ${JSON.stringify(s)}`);
      }
    } else if (data.spentPiles !== undefined) this.deps.warn('spawners: saved spentPiles is not a list; keeping default');
    if (typeof data.warmthTier === 'number' && Number.isFinite(data.warmthTier)) {
      this.warmthTier = clampTier(data.warmthTier);
    } else if (data.warmthTier !== undefined) this.deps.warn('spawners: saved warmthTier is invalid; keeping default');
    if (isRecord(data.lockedBlockLevels)) {
      for (const [k, v] of Object.entries(data.lockedBlockLevels)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          this.lockedBlockLevels[k] = Math.min(LEVEL.cap, Math.max(1, Math.round(v)));
        } else this.deps.warn(`spawners: dropped bad locked level for '${k}'`);
      }
    } else if (data.lockedBlockLevels !== undefined) {
      this.deps.warn('spawners: saved lockedBlockLevels is invalid; keeping default');
    }
    // Groups spawned earlier keep their live members; spent piles and cleared state now follow the save.
    for (const [id, gone] of this.goneSlots) {
      gone.clear();
      this.firedCleared.delete(id);
    }
  }

  setWarmthTier(w: number): void {
    if (typeof w !== 'number' || !Number.isFinite(w)) {
      this.deps.warn('spawners: ignoring non-finite warmth tier');
      return;
    }
    this.warmthTier = clampTier(w);
  }

  lockBlockLevel(blockId: string, level: number): void {
    if (typeof level !== 'number' || !Number.isFinite(level)) {
      this.deps.warn(`spawners: ignoring non-finite locked level for '${blockId}'`);
      return;
    }
    this.lockedBlockLevels[blockId] = Math.min(LEVEL.cap, Math.max(1, Math.round(level)));
  }

  getWarmthTier(): number {
    return this.warmthTier;
  }

  getLockedBlockLevel(blockId: string): number | undefined {
    return this.lockedBlockLevels[blockId];
  }

  isSpent(key: string): boolean {
    return this.spent.has(key);
  }

  isEphemeral(spawnerId: string): boolean {
    return this.defs.get(spawnerId)?.ephemeral === true;
  }

  isCleared(spawnerId: string): boolean {
    return this.cleared.has(spawnerId);
  }

  // Internals

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.deps.warn(msg);
  }

  private resolveBand(def: SpawnerDef, tierOffset: number | undefined): LevelBand {
    let band: LevelBand;
    if (typeof def.band === 'string') {
      const found = bandForRegion(def.band);
      if (!found) {
        this.warnOnce(`region:${def.band}`, `spawners: unknown region band '${def.band}' for '${def.id}'; using default`);
        band = DEFAULT_BAND;
      } else band = found;
    } else band = def.band;
    const off = typeof tierOffset === 'number' && Number.isFinite(tierOffset) ? Math.round(tierOffset) : 0;
    if (tierOffset !== undefined && off === 0 && tierOffset !== 0) {
      this.warnOnce(`offset:${def.id}`, `spawners: ignoring non-finite tierOffset for '${def.id}'`);
    }
    return { min: Math.max(1, band.min + off), max: Math.max(1, band.max + off) };
  }

  private levelFor(band: LevelBand): number {
    try {
      return enemyLevel(band, { roll: this.rng() }, (m) => this.deps.warn(m));
    } catch (e) {
      this.warnOnce(`band:${JSON.stringify(band)}`, `spawners: invalid band ${JSON.stringify(band)}; using default (${String(e)})`);
      return enemyLevel(DEFAULT_BAND);
    }
  }

  private resolvePatrol(def: SpawnerDef): AnchorLike[] {
    const p = def.patrol;
    if (!p) return [];
    if (Array.isArray(p)) {
      const out: AnchorLike[] = [];
      for (const aid of p as readonly string[]) {
        const a = this.deps.anchors.find(aid);
        if (a) out.push(a);
        else this.warnOnce(`wp:${def.id}:${aid}`, `spawners: '${def.id}' patrol waypoint '${aid}' not found; skipped`);
      }
      return out;
    }
    return this.deps.anchors.withTag((p as { tag: string }).tag);
  }

  private slotPosition(anchor: AnchorLike, slot: number, count: number): Vec3 {
    const p = anchor.position;
    if (count <= 1) return { x: p.x, y: p.y, z: p.z };
    const angle = (slot / count) * Math.PI * 2;
    return {
      x: p.x + Math.cos(angle) * WORLD_AI.ringRadius,
      y: p.y,
      z: p.z + Math.sin(angle) * WORLD_AI.ringRadius,
    };
  }
}

function isGate(act: SpawnerDef['activation']): act is { flag?: string; until?: string; unlessChoice?: { flag: string; equals: string } } {
  return typeof act === 'object' && !('quest' in act) && !('interior' in act);
}

/** The def of slot `slot` of a mixed pack (`memberKinds`), or undefined to use the group's `enemy`. */
function memberDef(def: SpawnerDef, slot: number): EnemyDef | undefined {
  const kind = def.memberKinds?.[slot];
  return kind ? ENEMY_DEFS[kind] : undefined;
}

function clampTier(w: number): number {
  return Math.min(8, Math.max(0, Math.round(w)));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The waypoints for pack member `slot`: each member starts at a different waypoint, and members past
 * the waypoint count walk a ring offset of the route, so a pack spreads out instead of bunching.
 */
export function patrolForSlot(points: readonly { x: number; z: number }[], slot: number): { x: number; z: number }[] {
  const n = points.length;
  if (n === 0) return [];
  const k = slot % n;
  const lap = Math.floor(slot / n);
  const angle = ((lap - 1) % 8) * (Math.PI / 4);
  const dx = lap > 0 ? Math.cos(angle) * WORLD_AI.ringRadius : 0;
  const dz = lap > 0 ? Math.sin(angle) * WORLD_AI.ringRadius : 0;
  return [...points.slice(k), ...points.slice(0, k)].map((p) => ({ x: p.x + dx, z: p.z + dz }));
}
