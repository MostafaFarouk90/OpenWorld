import type { Vec3 } from '../physics/PhysicsWorld';
import { ENEMY_DEFS } from './defs';
import { DEFAULT_BAND, bandForRegion, enemyLevel } from './level';
import type { ActorId, AnchorLike, AnchorsPort } from './ports';
import { LEVEL, WORLD_AI } from './tuning';
import type { EnemyDef, LevelBand, SpawnOptions, SpawnerDef } from './types';

export interface SpawnRequest {
  spawnerId: string;
  /** `def.tag ?? def.id`. */
  spawnTag: string;
  slot: number;
  def: EnemyDef;
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
  rng?: () => number;
}

export type MemberEnd = 'died' | 'released' | 'spared' | 'despawned';

export interface SpawnersPersisted {
  spent: string[];
  cleared: string[];
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
    const enemyDef = ENEMY_DEFS[def.enemy];
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
        level,
        patrol,
        options: { ...opts, leash: opts.leash ?? def.leash ?? true },
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

  /** Returns true exactly once when the last member of a group dies, is released or is spared. */
  onMemberGone(actorId: ActorId, how: MemberEnd): boolean {
    const rec = this.byActor.get(actorId);
    if (!rec) return false;
    this.byActor.delete(actorId);
    const slots = this.slots.get(rec.spawnerId)!;
    slots[rec.slot] = null;
    if (how === 'despawned') return false;
    if (how === 'released') this.spent.add(`${rec.spawnerId}#${rec.slot}`);
    const gone = this.goneSlots.get(rec.spawnerId)!;
    gone.add(rec.slot);
    if (gone.size < slots.length || slots.some((s) => s !== null)) return false;
    if (this.firedCleared.has(rec.spawnerId)) return false;
    this.firedCleared.add(rec.spawnerId);
    const def = this.defs.get(rec.spawnerId)!;
    if (def.activation !== 'auto') this.cleared.add(rec.spawnerId);
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

  alive(id: string): ActorId[] {
    return (this.slots.get(id) ?? []).filter((a): a is ActorId => a !== null);
  }

  startAuto(): ActorId[] {
    const out: ActorId[] = [];
    for (const def of this.defs.values()) {
      if (def.activation === 'auto' && !this.cleared.has(def.id)) out.push(...this.spawnGroup(def.id));
    }
    return out;
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

  onQuestStarted(questId: string): ActorId[] {
    const out: ActorId[] = [];
    for (const def of this.defs.values()) {
      if (typeof def.activation === 'object' && def.activation.quest === questId && !this.cleared.has(def.id)) {
        out.push(...this.spawnGroup(def.id));
      }
    }
    return out;
  }

  // Persistence

  serialize(): SpawnersPersisted {
    return {
      spent: [...this.spent],
      cleared: [...this.cleared],
      warmthTier: this.warmthTier,
      lockedBlockLevels: { ...this.lockedBlockLevels },
    };
  }

  load(data: unknown): void {
    this.spent = new Set();
    this.cleared = new Set();
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
