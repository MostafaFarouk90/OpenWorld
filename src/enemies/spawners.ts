import type { Vec3 } from '../physics/PhysicsWorld';
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

export type MemberEnd = 'died' | 'released' | 'spared' | 'despawned';

export interface SpawnersPersisted {
  spent: string[];
  cleared: string[];
  /** Ash piles whose raised wraith was Released (Blightbloom piles); optional so old saves load. */
  spentPiles?: string[];
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
  private readonly byActor = new Map<ActorId, { spawnerId: string; slot: number }>();
  private readonly warned = new Set<string>();
  private spent = new Set<string>();
  private cleared = new Set<string>();
  private readonly gateOpen = new Map<string, boolean>();
  private readonly gateOff: Array<() => void> = [];
  private started = false;
  private spentPiles = new Set<string>();
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

  spawnGroup(id: string, opts: SpawnOptions = {}): ActorId[] {
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
    this.lastOpts.set(id, opts);
    const band = this.resolveBand(def, opts.tierOffset);
    const patrol = this.resolvePatrol(def);
    const slots = this.slots.get(id)!;
    const gone = this.goneSlots.get(id)!;
    const out: ActorId[] = [];
    for (let slot = 0; slot < slots.length; slot++) {
      if (slots[slot] !== null) continue;
      const spentKey = `${id}#${slot}`;
      if (this.spent.has(spentKey)) continue;
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
        def: enemyDef,
        feet,
        yaw: own ? own.yaw : anchor.yaw,
        anchorId: own ? own.id : anchor.id,
        piles: def.piles,
        level,
        patrol,
        options: { ...opts, leash: opts.leash ?? def.leash ?? true, guard: opts.guard ?? def.guard },
        spentKey,
      });
      if (actorId === null) continue;
      slots[slot] = actorId;
      gone.delete(slot);
      this.byActor.set(actorId, { spawnerId: id, slot });
      out.push(actorId);
    }
    if (out.length > 0) {
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
    if (rec) this.spent.add(`${rec.spawnerId}#${rec.slot}`);
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
    if (how === 'despawned') return false;
    const def = this.defs.get(rec.spawnerId)!;
    if ((how === 'released' || how === 'spared') && !def.ephemeral) this.spent.add(`${rec.spawnerId}#${rec.slot}`);
    const gone = this.goneSlots.get(rec.spawnerId)!;
    gone.add(rec.slot);
    if (gone.size < slots.length || slots.some((s) => s !== null)) return false;
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
    for (let i = 0; i < slots.length; i++) this.spent.delete(`${id}#${i}`);
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
      const { flag, until } = act;
      const keys = [flag, until].filter((k): k is string => typeof k === 'string');
      if (keys.length === 0) {
        this.deps.warn(`spawners: gate group '${def.id}' names neither flag nor until; treated as auto`);
        continue;
      }
      if (!gates) continue;
      this.gateOff.push(
        gates.watch(
          (get) => (flag === undefined || get(flag)) && (until === undefined || !get(until)),
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

  // Persistence

  serialize(): SpawnersPersisted {
    const saved = (key: string) => !this.defs.get(key.replace(/#\d+$/, ''))?.ephemeral;
    return {
      spent: [...this.spent].filter(saved),
      cleared: [...this.cleared].filter(saved),
      // Omitted while empty, so saves without a bloom keep their old shape.
      ...(this.spentPiles.size > 0 ? { spentPiles: [...this.spentPiles] } : {}),
      warmthTier: this.warmthTier,
      lockedBlockLevels: { ...this.lockedBlockLevels },
    };
  }

  load(data: unknown): void {
    this.spent = new Set();
    this.cleared = new Set();
    this.spentPiles = new Set();
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

function isGate(act: SpawnerDef['activation']): act is { flag?: string; until?: string } {
  return typeof act === 'object' && !('quest' in act) && !('interior' in act);
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
