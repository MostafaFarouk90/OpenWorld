import type RAPIER from '@dimforge/rapier3d';

export interface PlatformPath {
  /**
   * At least two stops. The platform visits them in order and, after the last, loops back to the first. v0.9: a spinning
   * platform (`spin`) does not travel; it needs one stop, its rest position (where a save on it reappears).
   */
  readonly stops: readonly { x: number; y: number; z: number }[];
  /** Travel speed in m/s, > 0. */
  speed: number;
  /** Seconds spent standing at every stop (including the start, stop 0), >= 0. */
  wait: number;
  /**
   * v0.9 item 7b (the Anvil's turning floor, plans/act5-N0-spike.md): turns the platform about `pivot` (a vertical axis)
   * at `degPerS` (positive turns about +Y). Posed directly each tick (no Rapier ride); the player on it is carried round
   * by `carryAt`, jumps included (PLATFORM_AIR_CARRY_S). `pauseWhileStood`: the accepted fallback as a switch (the
   * platform stops while the player stands on it); off by default.
   */
  spin?: PlatformSpin;
}

export interface PlatformSpin {
  pivot: { x: number; y: number; z: number };
  degPerS: number;
  pauseWhileStood?: boolean;
}

/** The carry of one tick for the player's feet: a translation, the turn's yaw step (radians), and whether it holds in the air. */
export interface PlatformCarry {
  x: number;
  y: number;
  z: number;
  /** Radians about +Y this tick (0 for a translating platform); the player (and the camera without lock-on) turn by it. */
  yaw: number;
  /** v0.9: a turning platform's carry continues while the player is airborne (PLATFORM_AIR_CARRY_S). */
  air?: boolean;
}

/** A render pose (`renderPose`): the platform between its last two ticks. */
export interface PlatformPose {
  x: number;
  y: number;
  z: number;
  /** Radians about +Y. */
  yaw: number;
}

/** v0.9: an airborne player keeps the turning carry of the platform they left until they land, or for this long. */
export const PLATFORM_AIR_CARRY_S = 1.5;

export interface PlatformPorts {
  /** Called once each time a platform reaches stop `stop` (not for the starting stop). */
  onArrived?(id: string, stop: number): void;
  /** After each register and undo: how many platforms are registered (the core wires the player's carry only while any are). */
  onCountChanged?(count: number): void;
  /** True while platforms must hold still (a save loading: the load target is a platform's last stop). */
  paused?(): boolean;
}

interface SpinState {
  pivot: { x: number; y: number; z: number };
  omega: number;
  pauseWhileStood: boolean;
  /** The body's translation at angle 0 (its rest stop). */
  origin: { x: number; y: number; z: number };
  angle: number;
  /** Radians turned on the last step. */
  step: number;
  /** A carry was read for it since the last step (the player stood on it). */
  stood: boolean;
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
  spin?: SpinState;
  /** The pose before the last step (renderPose interpolates from it). */
  prev: PlatformPose;
}

const yawQuat = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

/** Turns (x, z) about (px, pz) by `a` radians about +Y (three's convention: (x, z) -> (x cos + z sin, -x sin + z cos)). */
function turnXZ(x: number, z: number, px: number, pz: number, a: number): { x: number; z: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - px;
  const dz = z - pz;
  return { x: px + dx * c + dz * s, z: pz - dx * s + dz * c };
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
    const spin = path?.spin;
    if (!path || !Array.isArray(path.stops) || path.stops.length < (spin ? 1 : 2)) {
      throw new Error(`Platforms: "${id}" needs at least ${spin ? 'one stop' : 'two stops'}`);
    }
    if (spin && (![spin.pivot?.x, spin.pivot?.y, spin.pivot?.z, spin.degPerS].every(Number.isFinite))) {
      throw new Error(`Platforms: "${id}" has a non-finite spin`);
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
      prev: { x: t.x, y: t.y, z: t.z, yaw: 0 },
      ...(spin
        ? {
            spin: {
              pivot: { ...spin.pivot },
              omega: (spin.degPerS * Math.PI) / 180,
              pauseWhileStood: spin.pauseWhileStood === true,
              origin: { x: t.x, y: t.y, z: t.z },
              angle: 0,
              step: 0,
              stood: false,
            },
          }
        : {}),
    };
    this.entries.set(id, entry);
    this.byBody.set(body.handle, entry);
    const saved = this.pending[id];
    if (saved !== undefined) {
      delete this.pending[id];
      this.applyStop(entry, saved);
    }
    this.ports.onCountChanged?.(this.entries.size);
    return () => {
      if (this.entries.get(id) !== entry) return;
      this.entries.delete(id);
      this.byBody.delete(body.handle);
      this.ports.onCountChanged?.(this.entries.size);
    };
  }

  get count(): number {
    return this.entries.size;
  }

  fixedUpdate(dt: number): void {
    if (this.entries.size === 0 || this.ports.paused?.()) {
      for (const e of this.entries.values()) {
        e.delta = { x: 0, y: 0, z: 0 };
        e.prev = this.poseOf(e);
        if (e.spin) e.spin.step = 0;
      }
      return;
    }
    for (const e of this.entries.values()) this.step(e, dt);
  }

  /** The last stop the platform reached (0 at start); undefined for an unknown id. */
  lastStop(id: string): number | undefined {
    return this.entries.get(id)?.lastStop;
  }

  /**
   * v0.9 item 7b: this tick's carry for feet at `feet` on the platform owning this collider: the translation step (with a
   * turning platform's exact rotation step about its pivot for that point) and the turn's yaw step. Null when the collider
   * is no platform's. Reading it marks a turning platform as stood on (`pauseWhileStood`).
   */
  carryAt(target: RAPIER.Collider | RAPIER.RigidBody, feet: { x: number; y: number; z: number }): PlatformCarry | null {
    const e = this.entryOf(target);
    if (!e) return null;
    if (!e.spin) return { ...e.delta, yaw: 0 };
    e.spin.stood = true;
    const a = e.spin.step;
    if (a === 0 || ![feet.x, feet.z].every(Number.isFinite)) return { x: 0, y: 0, z: 0, yaw: 0, air: true };
    const q = turnXZ(feet.x, feet.z, e.spin.pivot.x, e.spin.pivot.z, a);
    return { x: q.x - feet.x, y: 0, z: q.z - feet.z, yaw: a, air: true };
  }

  /** v0.9: the platform's pose between its last two ticks (`alpha` from the game loop), for N3's meshes; null when unknown. */
  renderPose(id: string, alpha: number): PlatformPose | null {
    const e = this.entries.get(id);
    if (!e) return null;
    const k = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
    const now = this.poseOf(e);
    const p = e.prev;
    return { x: p.x + (now.x - p.x) * k, y: p.y + (now.y - p.y) * k, z: p.z + (now.z - p.z) * k, yaw: p.yaw + (now.yaw - p.yaw) * k };
  }

  /** v0.9: a turning platform's angle now (radians), or undefined for an unknown or translating one. */
  angle(id: string): number | undefined {
    return this.entries.get(id)?.spin?.angle;
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
   * v0.9: a turning platform answers its rest stop (stops[0], where its body stands at angle 0), so its body origin
   * should sit under walkable floor.
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

  /**
   * v0.9 (N3's arena kit): sets a turning platform's rate in degrees a second; 0 holds it still (its carry is 0 from the
   * next step) and the angle is kept, so a later rate turns on from where it stopped. False for an unknown id, a platform
   * that does not spin, or a non-finite rate.
   */
  setSpinRate(id: string, degPerS: number): boolean {
    const sp = this.entries.get(id)?.spin;
    if (!sp || !Number.isFinite(degPerS)) return false;
    sp.omega = (degPerS * Math.PI) / 180;
    return true;
  }

  /** v0.9: a turning platform back at angle 0 at its rest stop (an arena reset); its rate is kept. False if it does not spin. */
  resetSpin(id: string): boolean {
    const e = this.entries.get(id);
    if (!e?.spin) return false;
    this.applyStop(e, 0);
    return true;
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
    if (e.spin) {
      // A turning platform loads at its rest pose (angle 0): the saved player reappears on its rest stop.
      e.spin.angle = 0;
      e.spin.step = 0;
      e.spin.origin = { x: s.x, y: s.y, z: s.z };
      e.body.setRotation(yawQuat(0), true);
    }
    e.body.setTranslation(s, true);
    e.body.setNextKinematicTranslation(s);
    e.prev = this.poseOf(e);
  }

  private poseOf(e: Entry): PlatformPose {
    return { x: e.pos.x, y: e.pos.y, z: e.pos.z, yaw: e.spin?.angle ?? 0 };
  }

  /** v0.9: a turning platform is posed directly (rotation and translation about the pivot), so its velocity stays zero. */
  private stepSpin(e: Entry, sp: SpinState, dt: number): void {
    const held = sp.pauseWhileStood && sp.stood;
    sp.stood = false;
    sp.step = held ? 0 : sp.omega * dt;
    sp.angle += sp.step;
    const q = turnXZ(sp.origin.x, sp.origin.z, sp.pivot.x, sp.pivot.z, sp.angle);
    const from = { ...e.pos };
    e.pos = { x: q.x, y: sp.origin.y, z: q.z };
    e.delta = { x: e.pos.x - from.x, y: 0, z: e.pos.z - from.z };
    const rot = yawQuat(sp.angle);
    e.body.setRotation(rot, true);
    e.body.setTranslation(e.pos, true);
    // Next pose = this pose: the body's velocity stays zero, so Rapier's own ride (at the centre of mass) adds nothing.
    e.body.setNextKinematicRotation(rot);
    e.body.setNextKinematicTranslation(e.pos);
  }

  private step(e: Entry, dt: number): void {
    e.prev = this.poseOf(e);
    if (e.spin) {
      this.stepSpin(e, e.spin, dt);
      return;
    }
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
