import * as THREE from 'three';
import type { ActorId } from '../actors/Actor';
import type { ActorRegistry } from '../actors/ActorRegistry';
import type { GameEvents } from '../core/events';
import type { GameSystem } from '../core/systems';
import type { Vec3 } from '../physics/PhysicsWorld';

export type TriggerShape =
  | { type: 'sphere'; center: Vec3; radius: number }
  | { type: 'box'; center: Vec3; half: Vec3; yaw?: number };

export interface TriggerDef {
  id: string;
  shape: TriggerShape;
  who?: 'player' | 'any-actor';
  once?: boolean;
}

interface Entry {
  def: TriggerDef;
  inside: Set<ActorId>;
}

const PLAYER = 'player';
const fin = (v: Vec3) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function validate(def: TriggerDef): void {
  if (!def.id) throw new Error('TriggerVolumes: id is required');
  const s = def.shape as TriggerShape | undefined;
  if (!s) throw new Error(`TriggerVolumes: "${def.id}" has no shape`);
  if (s.type === 'sphere') {
    if (!fin(s.center) || !Number.isFinite(s.radius) || s.radius <= 0) throw new Error(`TriggerVolumes: bad sphere for "${def.id}"`);
  } else if (s.type === 'box') {
    if (!fin(s.center) || !fin(s.half) || s.half.x <= 0 || s.half.y <= 0 || s.half.z <= 0 || (s.yaw !== undefined && !Number.isFinite(s.yaw))) {
      throw new Error(`TriggerVolumes: bad box for "${def.id}"`);
    }
  } else {
    throw new Error(`TriggerVolumes: unknown shape for "${def.id}"`);
  }
  if (def.who !== undefined && def.who !== 'player' && def.who !== 'any-actor') throw new Error(`TriggerVolumes: bad "who" for "${def.id}"`);
}

function contains(s: TriggerShape, p: THREE.Vector3Like): boolean {
  const dx = p.x - s.center.x;
  const dy = p.y - s.center.y;
  const dz = p.z - s.center.z;
  if (s.type === 'sphere') return dx * dx + dy * dy + dz * dz <= s.radius * s.radius;
  const yaw = s.yaw ?? 0;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return Math.abs(lx) <= s.half.x && Math.abs(dy) <= s.half.y && Math.abs(lz) <= s.half.z;
}

/** Enter and exit events for actors against spheres and yawed boxes, in the rules phase. */
export class TriggerVolumes implements GameSystem {
  readonly id = 'core.triggers';
  readonly fixedPhase = 'rules' as const;
  readonly order = -100;

  private readonly triggers = new Map<string, Entry>();
  private readonly tmp = new THREE.Vector3();
  private readonly off: () => void;

  constructor(private readonly deps: { actors: ActorRegistry; events: GameEvents }) {
    this.off = deps.events.on('actor.despawned', ({ actorId }) => {
      for (const [id, e] of this.triggers) {
        if (e.inside.delete(actorId)) deps.events.emit('trigger.exit', { triggerId: id, actorId });
      }
    });
  }

  add(def: TriggerDef): () => void {
    validate(def);
    if (this.triggers.has(def.id)) throw new Error(`TriggerVolumes: duplicate trigger "${def.id}"`);
    const entry: Entry = { def, inside: new Set() };
    this.triggers.set(def.id, entry);
    return () => {
      if (this.triggers.get(def.id) === entry) this.triggers.delete(def.id);
    };
  }

  /** True while the actor (default the player) is inside the trigger as of the last update; false for unknown triggers. */
  isInside(triggerId: string, actorId: ActorId = PLAYER): boolean {
    return this.triggers.get(triggerId)?.inside.has(actorId) ?? false;
  }

  fixedUpdate(): void {
    for (const [id, entry] of [...this.triggers]) {
      if (this.triggers.get(id) !== entry) continue;
      const any = entry.def.who === 'any-actor';
      const candidates = any ? [...this.deps.actors.all()] : [this.deps.actors.get(PLAYER)].filter((a) => !!a);
      const now = new Set<ActorId>();
      for (const a of candidates) {
        if (!a || a.dead || !a.root) continue;
        a.worldPosition(this.tmp);
        if (contains(entry.def.shape, this.tmp)) now.add(a.id);
      }
      for (const aid of [...entry.inside]) {
        if (!now.has(aid)) {
          entry.inside.delete(aid);
          this.deps.events.emit('trigger.exit', { triggerId: id, actorId: aid });
        }
      }
      for (const aid of now) {
        if (entry.inside.has(aid)) continue;
        entry.inside.add(aid);
        this.deps.events.emit('trigger.enter', { triggerId: id, actorId: aid });
        if (entry.def.once) {
          this.triggers.delete(id);
          break;
        }
      }
    }
  }

  dispose(): void {
    this.off();
    this.triggers.clear();
  }
}
