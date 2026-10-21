import type RAPIER from '@dimforge/rapier3d';

export interface PlatformPath {
  /** At least two stops. The platform visits them in order and, after the last, loops back to the first. */
  readonly stops: readonly { x: number; y: number; z: number }[];
  /** Travel speed in m/s, > 0. */
  speed: number;
  /** Seconds spent standing at every stop (including the start, stop 0), >= 0. */
  wait: number;
}

export interface PlatformPorts {
  /** Called once each time a platform reaches stop `stop` (not for the starting stop). */
  onArrived?(id: string, stop: number): void;
}

interface Entry {
  id: string;
  body: RAPIER.RigidBody;
  path: PlatformPath;
  pos: { x: number; y: number; z: number };
  target: number;
  lastStop: number;
  waitLeft: number;
  delta: { x: number; y: number; z: number };
}

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * Core-side service for kinematic moving platforms. Each registered body (kinematicPositionBased) starts at
 * stop 0, waits `wait` seconds, then travels to stop 1, 2, ... and loops back to stop 0 (a loop, not a
 * ping-pong). Step it once per fixed tick BEFORE the physics step: it queues each body's next translation
 * and records the frame delta that CharacterController adds to a player standing on it.
 */
export class Platforms {
  private readonly entries = new Map<string, Entry>();
  private readonly byBody = new Map<number, Entry>();
  private pending: Record<string, number> = {};

  constructor(private readonly ports: PlatformPorts = {}) {}

  register(id: string, body: RAPIER.RigidBody, path: PlatformPath): () => void {
    if (this.entries.has(id)) throw new Error(`Platforms: "${id}" is already registered`);
    if (!path || !Array.isArray(path.stops) || path.stops.length < 2) {
      throw new Error(`Platforms: "${id}" needs at least two stops`);
    }
    for (const s of path.stops) {
      if (![s.x, s.y, s.z].every(Number.isFinite)) throw new Error(`Platforms: "${id}" has a non-finite stop`);
    }
    if (!(path.speed > 0) || !Number.isFinite(path.speed)) throw new Error(`Platforms: "${id}" needs speed > 0`);
    if (!(path.wait >= 0) || !Number.isFinite(path.wait)) throw new Error(`Platforms: "${id}" needs wait >= 0`);
    const t = body.translation();
    const entry: Entry = {
      id,
      body,
      path,
      pos: { x: t.x, y: t.y, z: t.z },
      target: 1,
      lastStop: 0,
      waitLeft: path.wait,
      delta: { x: 0, y: 0, z: 0 },
    };
    this.entries.set(id, entry);
    this.byBody.set(body.handle, entry);
    const saved = this.pending[id];
    if (saved !== undefined) {
      delete this.pending[id];
      this.applyStop(entry, saved);
    }
    return () => {
      if (this.entries.get(id) !== entry) return;
      this.entries.delete(id);
      this.byBody.delete(body.handle);
    };
  }

  fixedUpdate(dt: number): void {
    for (const e of this.entries.values()) this.step(e, dt);
  }

  /** The last stop the platform reached (0 at start); undefined for an unknown id. */
  lastStop(id: string): number | undefined {
    return this.entries.get(id)?.lastStop;
  }

  /** Frame translation of the platform that owns this collider (or is this body); zero otherwise. */
  delta(target: RAPIER.Collider | RAPIER.RigidBody): { x: number; y: number; z: number } {
    const e = this.entryOf(target);
    return e ? e.delta : ZERO;
  }

  isPlatformCollider(collider: RAPIER.Collider): boolean {
    return this.entryOf(collider) !== undefined;
  }

  /** Id of the platform owning this collider, if any. */
  idOf(collider: RAPIER.Collider): string | undefined {
    return this.entryOf(collider)?.id;
  }

  /**
   * Where a player saved on platform `id` should reappear: its last stop's x/z and the top of its colliders at
   * that stop (stop y plus the highest collider top relative to the body). Null for an unknown id.
   */
  standingPoint(id: string): { x: number; y: number; z: number } | null {
    const e = this.entries.get(id);
    if (!e) return null;
    const stop = e.path.stops[e.lastStop]!;
    let top = 0;
    for (let i = 0; i < e.body.numColliders(); i++) {
      const c = e.body.collider(i);
      if (!c) continue;
      const half = (c as unknown as { halfExtents?: () => { y: number } }).halfExtents?.();
      if (half) top = Math.max(top, (c.translationWrtParent()?.y ?? 0) + half.y);
    }
    return { x: stop.x, y: stop.y + top, z: stop.z };
  }

  serialize(): Record<string, number> {
    const out: Record<string, number> = { ...this.pending };
    for (const e of this.entries.values()) out[e.id] = e.lastStop;
    return out;
  }

  load(data: unknown): void {
    this.pending = {};
    if (typeof data !== 'object' || data === null) return;
    for (const [id, stop] of Object.entries(data as Record<string, unknown>)) {
      if (typeof stop !== 'number' || !Number.isInteger(stop) || stop < 0) continue;
      const e = this.entries.get(id);
      if (e) this.applyStop(e, stop);
      else this.pending[id] = stop;
    }
  }

  private entryOf(target: RAPIER.Collider | RAPIER.RigidBody): Entry | undefined {
    const body = 'parent' in target && typeof target.parent === 'function' ? target.parent() : (target as RAPIER.RigidBody);
    return body ? this.byBody.get(body.handle) : undefined;
  }

  private applyStop(e: Entry, stop: number): void {
    const n = e.path.stops.length;
    const s = e.path.stops[Math.min(stop, n - 1)]!;
    e.lastStop = Math.min(stop, n - 1);
    e.target = (e.lastStop + 1) % n;
    e.waitLeft = e.path.wait;
    e.pos = { x: s.x, y: s.y, z: s.z };
    e.delta = { x: 0, y: 0, z: 0 };
    e.body.setTranslation(s, true);
    e.body.setNextKinematicTranslation(s);
  }

  private step(e: Entry, dt: number): void {
    const from = { ...e.pos };
    if (e.waitLeft > 0) {
      e.waitLeft -= dt;
    } else {
      const to = e.path.stops[e.target]!;
      const dx = to.x - e.pos.x;
      const dy = to.y - e.pos.y;
      const dz = to.z - e.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const move = e.path.speed * dt;
      if (dist <= move) {
        e.pos = { x: to.x, y: to.y, z: to.z };
        e.lastStop = e.target;
        e.target = (e.target + 1) % e.path.stops.length;
        e.waitLeft = e.path.wait;
        this.update(e, from);
        this.ports.onArrived?.(e.id, e.lastStop);
        return;
      }
      const k = move / dist;
      e.pos = { x: e.pos.x + dx * k, y: e.pos.y + dy * k, z: e.pos.z + dz * k };
    }
    this.update(e, from);
  }

  private update(e: Entry, from: { x: number; y: number; z: number }): void {
    e.delta = { x: e.pos.x - from.x, y: e.pos.y - from.y, z: e.pos.z - from.z };
    e.body.setNextKinematicTranslation(e.pos);
  }
}

declare module '../core/Services' {
  interface GameServices {
    platforms: Platforms;
  }
}
