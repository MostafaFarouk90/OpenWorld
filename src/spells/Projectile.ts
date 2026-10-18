import * as THREE from 'three';
import type { ActorId, ActorLike, ActorsLike, Vec3 } from '../vfx/ports';
import { ACTOR_HIT, PROJECTILE } from './tuning';

export interface ProjectileHost {
  actors: ActorsLike;
  heightAt?(x: number, z: number): number;
  /** Static colliders: nearest hit along the ray within maxDist. */
  rayCast?(origin: Vec3, dir: Vec3, maxDist: number): { point: Vec3 } | null;
}

export type ProjectileHit =
  | { kind: 'actor'; actorId: ActorId; point: Vec3 }
  | { kind: 'terrain'; point: Vec3 }
  | { kind: 'expired'; point: Vec3 };

export interface LaunchOptions {
  casterId: ActorId;
  origin: Vec3;
  direction: Vec3;
  speed: number;
  lifetime: number;
  radius: number;
  onHit(result: ProjectileHit): void;
}

interface Slot {
  live: boolean;
  seq: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  speed: number;
  remaining: number;
  radius: number;
  casterId: ActorId;
  casterTeam: ActorLike['team'];
  onHit: ((r: ProjectileHit) => void) | null;
}

const pos = new THREE.Vector3();

function friendly(casterTeam: ActorLike['team'], target: ActorLike['team']): boolean {
  const casterSide = casterTeam === 'player' || casterTeam === 'ally';
  if (casterSide) return target === 'player' || target === 'ally';
  if (casterTeam === 'hostile') return target === 'hostile' || target === 'neutral';
  return true; // neutral casters hit nothing
}

/** Pooled projectiles with sub-stepped sweeps, so nothing tunnels through an actor. */
export class ProjectileSystem {
  private readonly slots: Slot[];
  private seq = 0;
  private live = 0;

  constructor(private readonly host: ProjectileHost, capacity: number = PROJECTILE.defaultCapacity) {
    const n = Math.max(1, Math.floor(capacity));
    this.slots = Array.from({ length: n }, () => ({
      live: false, seq: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, speed: 0, remaining: 0, radius: 0,
      casterId: '', casterTeam: 'player' as ActorLike['team'], onHit: null,
    }));
  }

  get liveCount(): number {
    return this.live;
  }

  launch(o: LaunchOptions): boolean {
    const { origin: p, direction: d } = o;
    const finite = [p.x, p.y, p.z, d.x, d.y, d.z, o.speed, o.lifetime, o.radius].every(Number.isFinite);
    if (!finite || !(o.speed > 0) || !(o.lifetime > 0) || o.radius < 0 || typeof o.onHit !== 'function') return false;
    const len = Math.hypot(d.x, d.y, d.z);
    if (!(len > 1e-9)) return false;

    let slot = this.slots.find((s) => !s.live);
    if (!slot) {
      slot = this.slots.reduce((a, b) => (b.seq < a.seq ? b : a));
      this.finish(slot, { kind: 'expired', point: { x: slot.x, y: slot.y, z: slot.z } });
    }
    slot.live = true;
    slot.seq = ++this.seq;
    slot.x = p.x; slot.y = p.y; slot.z = p.z;
    slot.dx = d.x / len; slot.dy = d.y / len; slot.dz = d.z / len;
    slot.speed = o.speed;
    slot.remaining = o.lifetime;
    slot.radius = o.radius;
    slot.casterId = o.casterId;
    slot.casterTeam = this.host.actors.get(o.casterId)?.team ?? 'player';
    slot.onHit = o.onHit;
    this.live++;
    return true;
  }

  update(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    // Oldest first so callbacks see a stable order.
    const order = this.slots.filter((s) => s.live).sort((a, b) => a.seq - b.seq);
    for (const s of order) if (s.live) this.step(s, dt);
  }

  /** Expires every live projectile (each onHit called once with 'expired'). */
  clear(): void {
    for (const s of this.slots) if (s.live) this.finish(s, { kind: 'expired', point: { x: s.x, y: s.y, z: s.z } });
  }

  private finish(s: Slot, result: ProjectileHit): void {
    const cb = s.onHit;
    s.live = false;
    s.onHit = null;
    this.live--;
    cb?.(result);
  }

  private step(s: Slot, dt: number): void {
    const moveTime = Math.min(dt, s.remaining);
    const dist = s.speed * moveTime;
    const sub = Math.max(s.radius, PROJECTILE.minSubStep);
    const n = Math.max(1, Math.ceil(dist / sub));
    const ox = s.x, oy = s.y, oz = s.z;

    // Static collider hit along the whole segment bounds the sweep.
    let rayDist = Infinity;
    let rayPoint: Vec3 | null = null;
    if (this.host.rayCast && dist > 0) {
      const hit = this.host.rayCast({ x: ox, y: oy, z: oz }, { x: s.dx, y: s.dy, z: s.dz }, dist);
      if (hit) {
        rayPoint = hit.point;
        rayDist = Math.hypot(hit.point.x - ox, hit.point.y - oy, hit.point.z - oz);
      }
    }

    for (let i = 1; i <= n; i++) {
      const t = (dist * i) / n;
      if (t > rayDist) break;
      const x = ox + s.dx * t, y = oy + s.dy * t, z = oz + s.dz * t;
      const actor = this.actorAt(s, x, y, z);
      if (actor) {
        s.x = x; s.y = y; s.z = z;
        this.finish(s, { kind: 'actor', actorId: actor.id, point: { x, y, z } });
        return;
      }
      const ground = this.host.heightAt?.(x, z);
      if (ground !== undefined && Number.isFinite(ground) && y < ground) {
        s.x = x; s.y = ground; s.z = z;
        this.finish(s, { kind: 'terrain', point: { x, y: ground, z } });
        return;
      }
    }
    if (rayPoint) {
      s.x = rayPoint.x; s.y = rayPoint.y; s.z = rayPoint.z;
      this.finish(s, { kind: 'terrain', point: { ...rayPoint } });
      return;
    }
    s.x = ox + s.dx * dist; s.y = oy + s.dy * dist; s.z = oz + s.dz * dist;
    s.remaining -= moveTime;
    if (s.remaining <= 1e-9) this.finish(s, { kind: 'expired', point: { x: s.x, y: s.y, z: s.z } });
  }

  /** Nearest valid actor whose cylinder the projectile sphere overlaps at this sample. */
  private actorAt(s: Slot, x: number, y: number, z: number): ActorLike | null {
    let best: ActorLike | null = null;
    let bestD = Infinity;
    for (const a of this.host.actors.all()) {
      if (a.id === s.casterId || a.dead || !a.hittable || friendly(s.casterTeam, a.team)) continue;
      a.worldPosition(pos);
      const d = Math.hypot(pos.x - x, pos.z - z);
      if (d > ACTOR_HIT.radius + s.radius) continue;
      if (y < pos.y - s.radius || y > pos.y + ACTOR_HIT.height + s.radius) continue;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }
}
