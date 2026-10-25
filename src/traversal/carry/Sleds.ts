// The supply sled (design 15 item 79, plan 2.7 R15; K7 PR 1): dragged at 60% speed with no sprint or attacks, dropped
// on a direct hit, persisted where it lies, and tracked by the carry reset. K13 places R15's three sleds on K4's routes
// through `carry.addSled`; the objective (delivered at the cache) is K13's.
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import { SLED_TUNING } from '../../movement/types';
import type { CarryResets, CarryRoute } from './CarryResets';

export const SLED_SOURCE = 'traversal.sled';
/** The sled trails this far behind the player's feet. */
export const SLED_TRAIL = 2.2;
/** Actions locked while hauling (the dodge stays, so a hawk stoop can be dodged). */
export const SLED_LOCKS = [
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'surge', 'surgeLeap',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'mount', 'lockOn',
] as const;

export interface SledDef {
  /** `sled.<name>` (K4's carry route id). */
  id: string;
  route: CarryRoute;
  /** Where it first stands; its route's first checkpoint by default. */
  start?: Vec3Like;
}

export interface SledPorts {
  feet(): Vec3Like;
  yaw(): number;
  groundAt(x: number, z: number, fromY: number): number;
  addModifier(source: string, mod: MoveModifier): () => void;
  show(id: string, p: Vec3Like, yaw: number): void;
  hide(id: string): void;
  emit(type: 'sled.taken' | 'sled.dropped', p: { id: string }): void;
}

interface Sled {
  def: SledDef;
  pos: Vec3Like;
  yaw: number;
  /** True once it moved from its start (only those are saved). */
  moved: boolean;
  untrack: () => void;
}

export interface SledSave {
  sleds: Record<string, { x: number; y: number; z: number }>;
}

export class Sleds {
  private readonly sleds = new Map<string, Sled>();
  private heldId: string | null = null;
  private modOff: (() => void) | null = null;
  /** Saved positions for sleds not added yet (a load before K13's content sets up). */
  private loaded = new Map<string, Vec3Like>();

  constructor(
    private readonly ports: SledPorts,
    private readonly resets: CarryResets,
  ) {}

  add(def: SledDef): () => void {
    if (this.sleds.has(def.id)) throw new Error(`carry: duplicate sled id "${def.id}"`);
    const start = def.start ?? def.route.checkpoints[0];
    const saved = this.loaded.get(def.id);
    const pos = saved ? { ...saved } : { x: start.x, y: start.y, z: start.z };
    const sled: Sled = { def, pos, yaw: 0, moved: !!saved, untrack: () => {} };
    this.sleds.set(def.id, sled);
    sled.untrack = this.resets.track({
      route: def.route,
      position: () => sled.pos,
      place: (p) => {
        if (this.heldId === def.id) this.drop();
        sled.pos = { x: p.x, y: p.y, z: p.z };
        sled.moved = true;
        this.ports.show(def.id, sled.pos, sled.yaw);
      },
      held: () => this.heldId === def.id,
    });
    this.ports.show(def.id, sled.pos, sled.yaw);
    return () => {
      if (this.sleds.get(def.id) !== sled) return;
      if (this.heldId === def.id) this.drop();
      sled.untrack();
      this.sleds.delete(def.id);
      this.ports.hide(def.id);
    };
  }

  get held(): string | null {
    return this.heldId;
  }

  position(id: string): Vec3Like | null {
    const s = this.sleds.get(id);
    return s ? { ...s.pos } : null;
  }

  ids(): string[] {
    return [...this.sleds.keys()];
  }

  /** Takes the traces of `id` (one sled at a time). */
  take(id: string): boolean {
    if (this.heldId || !this.sleds.has(id) || this.resets.pendingTarget(id)) return false;
    this.heldId = id;
    this.modOff = this.ports.addModifier(SLED_SOURCE, { speedScale: SLED_TUNING.speedScale, noSprint: true, lockActions: SLED_LOCKS });
    this.ports.emit('sled.taken', { id });
    return true;
  }

  /** Lets go of the held sled where it is. */
  drop(): void {
    const id = this.heldId;
    if (!id) return;
    this.heldId = null;
    this.modOff?.();
    this.modOff = null;
    this.ports.emit('sled.dropped', { id });
  }

  /** A direct hit on the player (never a cold or Burn tick, review B3): the sled waits where it fell. */
  onDirectHit(): void {
    this.drop();
  }

  /** `save.loaded`: nothing is held after a load; positions come from `load`. */
  reset(): void {
    this.heldId = null;
    this.modOff?.();
    this.modOff = null;
  }

  fixedUpdate(): void {
    const id = this.heldId;
    if (!id) return;
    const s = this.sleds.get(id)!;
    const f = this.ports.feet();
    const yaw = this.ports.yaw();
    // Behind the player: yaw 0 faces -Z, so behind is +Z rotated by yaw.
    const x = f.x + Math.sin(yaw) * SLED_TRAIL;
    const z = f.z + Math.cos(yaw) * SLED_TRAIL;
    s.pos = { x, y: this.ports.groundAt(x, z, f.y + 2), z };
    s.yaw = yaw;
    s.moved = true;
    this.ports.show(id, s.pos, yaw);
  }

  serialize(): SledSave {
    const sleds: SledSave['sleds'] = {};
    for (const [id, s] of this.sleds) {
      if (!s.moved) continue;
      // A save during a reset's fade stores the checkpoint the sled is going to.
      const p = this.resets.pendingTarget(id) ?? s.pos;
      sleds[id] = { x: p.x, y: p.y, z: p.z };
    }
    // Sleds whose content has not set up yet keep their saved place.
    for (const [id, p] of this.loaded) if (!this.sleds.has(id)) sleds[id] = { x: p.x, y: p.y, z: p.z };
    return { sleds };
  }

  load(data: unknown): void {
    this.reset();
    this.loaded = new Map();
    // A sled the save does not list never moved: it stands at its start (an old save without the key reads the same).
    for (const [id, s] of this.sleds) {
      const start = s.def.start ?? s.def.route.checkpoints[0];
      s.pos = { x: start.x, y: start.y, z: start.z };
      s.moved = false;
      this.ports.show(id, s.pos, s.yaw);
    }
    const raw = (data as Partial<SledSave> | null)?.sleds;
    if (!raw || typeof raw !== 'object') return;
    for (const [id, p] of Object.entries(raw)) {
      if (!p || ![p.x, p.y, p.z].every((n) => Number.isFinite(n))) continue;
      this.loaded.set(id, { x: p.x, y: p.y, z: p.z });
      const s = this.sleds.get(id);
      if (s) {
        s.pos = { x: p.x, y: p.y, z: p.z };
        s.moved = true;
        this.ports.show(id, s.pos, s.yaw);
      }
    }
  }
}
