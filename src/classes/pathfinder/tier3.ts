import * as THREE from 'three';
import type { DamageResult } from '../../actors/DamageResolver';
import type { StatusService } from '../../actors/status';
import { PLAYER } from '../../config/constants';
import type { ActorsLike, Vec3 } from '../../vfx/ports';
import { PF } from './tuning';

/** The bolt strikes of the crossbow: `pathfinder.bolt.<shot>`; the area shot's splash (`.blast`) and the Surge quarrel are not these. */
const BOLT_ATTACK = /^pathfinder\.bolt\.[1-4]$/;

export interface EmberQuarrelPorts {
  playerId(): string;
  active(): boolean;
  /** Looked up at hit time: the status service may be absent. */
  status(): Pick<StatusService, 'apply'> | undefined;
  warn(message: string): void;
  /** The ember trail at the hit; optional. */
  fx?(at: Vec3): void;
  triggered?(): void;
}

/**
 * Ember Quarrel: a crossbow bolt that lands (`outcome` 'hit', health dealt) ignites its target under one fixed status id,
 * so a second bolt refreshes the time and never stacks. Blocked or immune hits, status ticks, splash, the Surge quarrel and
 * every non-bolt attack are left alone.
 */
export function emberQuarrelHandler(ports: EmberQuarrelPorts): (r: DamageResult) => void {
  let warned = false;
  return (r) => {
    if (r.kind !== 'melee' || r.attackerId !== ports.playerId() || r.outcome !== 'hit' || !(r.dealt > 0)) return;
    if (!r.attackId || !BOLT_ATTACK.test(r.attackId) || !ports.active()) return;
    const status = ports.status();
    if (!status) {
      if (!warned) {
        warned = true;
        ports.warn('pathfinder: the status service is absent, Ember Quarrel does not ignite');
      }
      return;
    }
    const ok = status.apply(r.targetId, {
      id: PF.emberQuarrel.statusId,
      kind: 'ignite',
      dps: PF.emberQuarrel.dps,
      seconds: PF.emberQuarrel.seconds,
      sourceId: ports.playerId(),
    });
    if (!ok) return;
    if (r.point) ports.fx?.(r.point);
    ports.triggered?.();
  };
}

/** The slice of the physics world the line-of-sight check reads. */
export interface RayWorld {
  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    exclude?: never,
  ): { distance: number; collider: { parent(): { isFixed(): boolean } | null } } | null;
}

/**
 * Line of sight for the net: only fixed colliders (terrain, walls, doors) block it. Actors move on kinematic bodies, so a
 * big foe or another foe in the line never refuses the shot.
 */
export function terrainBlocked(world: RayWorld, exclude?: unknown): (from: Vec3, to: Vec3) => boolean {
  return (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return false;
    const dir = { x: dx / len, y: dy / len, z: dz / len };
    let start = from;
    let left = len - 1;
    // A moving body in the way is stepped past; the cap keeps a crowd from looping.
    for (let i = 0; i < 6 && left > 0; i++) {
      const hit = world.raycast(start, dir, left, exclude as never);
      if (!hit) return false;
      if (hit.collider.parent()?.isFixed() ?? true) return true;
      const adv = hit.distance + 0.05;
      start = { x: start.x + dir.x * adv, y: start.y + dir.y * adv, z: start.z + dir.z * adv };
      left -= adv;
    }
    return false;
  };
}

export type NetResult = { ok: true } | { ok: false; reason: string };

export interface NetLauncherPorts {
  actors: ActorsLike;
  playerId(): string;
  status(): Pick<StatusService, 'apply'> | undefined;
  /** Where the net leaves (the shooter's chest), and the unit direction it aims (lock-on, camera ray or facing: the crossbow's own aim). */
  origin(out: THREE.Vector3): THREE.Vector3;
  aim(from: Vec3): Vec3;
  lockTarget(): string | null;
  /** True when terrain stands between the two points. */
  blocked?(from: Vec3, to: Vec3): boolean;
  fx?(at: Vec3): void;
  triggered?(): void;
}

/**
 * Net Launcher (active; the abilities service charges the Ember and cooldown on ok): the net roots one foe for
 * `PF.netLauncher.seconds`. It goes through `status.apply` only and never a damage request, not even a zero one, because any
 * player hit marks the enemy struck and revokes the mercy it was about to offer. A second net on a rooted foe refreshes the
 * time to the longer remaining and does not extend it (the status engine's same-id rule).
 */
export class NetLauncher {
  private readonly from = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(private readonly p: NetLauncherPorts) {}

  cast(): NetResult {
    const status = this.p.status();
    if (!status) return { ok: false, reason: 'no-status' };
    const id = this.pick();
    if (id === null) return { ok: false, reason: 'no-target' };
    const ok = status.apply(id, {
      id: PF.netLauncher.statusId,
      kind: 'root',
      seconds: PF.netLauncher.seconds,
      sourceId: this.p.playerId(),
    });
    if (!ok) return { ok: false, reason: 'immune' };
    const a = this.p.actors.get(id);
    if (a) {
      a.worldPosition(this.at);
      this.p.fx?.({ x: this.at.x, y: this.at.y, z: this.at.z });
    }
    this.p.triggered?.();
    return { ok: true };
  }

  /** A hostile the net may fly at: alive, not in a mercy state (spared and calmed foes are leaving), within range. */
  private eligible(id: string): boolean {
    const a = this.p.actors.get(id);
    if (!a || a.dead || a.team !== 'hostile' || !a.hittable) return false;
    const state = (a as { mercyState?: () => string }).mercyState?.() ?? 'none';
    return state === 'none';
  }

  /** The lock-on target when in range, else the foe nearest along the aim ray inside `aimRadius` of it. */
  private pick(): string | null {
    const range = PF.netLauncher.range;
    const m = this.p.origin(this.from);
    const origin = { x: m.x, y: m.y, z: m.z };
    const lock = this.p.lockTarget();
    if (lock !== null) {
      // A lock-on that cannot be netted (dead, in a mercy state, away) is a refusal, never a different target.
      if (!this.eligible(lock)) return null;
      this.p.actors.get(lock)!.worldPosition(this.at);
      this.at.y += PF.netLauncher.chestHeight;
      const d = Math.hypot(this.at.x - origin.x, this.at.y - origin.y, this.at.z - origin.z);
      if (d <= range && !this.p.blocked?.(origin, this.at)) return lock;
      return null;
    }
    const dir = this.p.aim(origin);
    const r2 = PF.netLauncher.aimRadius * PF.netLauncher.aimRadius;
    let best: string | null = null;
    let bestT = Infinity;
    for (const a of this.p.actors.all()) {
      if (a.team !== 'hostile' || !this.eligible(a.id)) continue;
      a.worldPosition(this.at);
      const vx = this.at.x - origin.x;
      const vy = this.at.y + PF.netLauncher.chestHeight - origin.y;
      const vz = this.at.z - origin.z;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t < 0 || t > range || t >= bestT) continue;
      if (vx * vx + vy * vy + vz * vz - t * t > r2) continue;
      if (this.p.blocked) {
        this.at.y += PF.netLauncher.chestHeight;
        if (this.p.blocked(origin, this.at)) continue;
      }
      best = a.id;
      bestT = t;
    }
    return best;
  }
}

/** The slice of the character controller Light Step drives. */
export interface AirJumper {
  airJumps: number;
  airJumpSpeed?: number;
  readonly grounded: boolean;
}

export interface LightStepPorts {
  /** Learned, the Pathfinder and alive. */
  active(): boolean;
  controller(): AirJumper | null;
  /** Simulated feet height at the latest tick. */
  feetY(): number;
  fx?(): void;
  triggered?(): void;
}

/** How far (m/s) a tick's vertical speed may sit from the launch speed, and from plain gravity's, to read as the air jump. */
const LAUNCH_TOLERANCE = 0.4;
const GRAVITY_TOLERANCE = 0.5;

/**
 * Light Step: one air jump at `sqrt(heightScale)` of the ground jump's speed (height goes with speed squared), written onto the
 * controller and reconciled every tick, so a respec, class change, death or load puts `airJumps` and `airJumpSpeed` back at
 * 0 and unset. The controller keeps no event for the jump, so it is read off the feet: an airborne tick whose vertical speed
 * is the launch speed instead of the ballistic one.
 */
export class LightStep {
  private owned: AirJumper | null = null;
  private prevY = NaN;
  private prevVy = 0;
  private prevGrounded = true;
  private readonly speed = Math.sqrt(PF.lightStep.heightScale) * PLAYER.jumpSpeed;

  constructor(private readonly p: LightStepPorts) {}

  tick(dt: number): void {
    const c = this.p.controller();
    if (this.owned && this.owned !== c) this.release();
    if (!c || !this.p.active()) {
      this.release();
      this.forget();
      return;
    }
    if (this.owned !== c) {
      this.owned = c;
    }
    c.airJumps = PF.lightStep.airJumps;
    c.airJumpSpeed = this.speed;
    const y = this.p.feetY();
    if (dt > 0 && Number.isFinite(this.prevY)) {
      const vy = (y - this.prevY) / dt;
      // The tick of the jump moves at the launch speed less one tick of gravity; anything else is a fall or a rise.
      const launched = this.speed - PLAYER.gravity * dt;
      const ballistic = this.prevVy - PLAYER.gravity * dt;
      if (!c.grounded && !this.prevGrounded && Math.abs(vy - launched) < LAUNCH_TOLERANCE && Math.abs(vy - ballistic) > GRAVITY_TOLERANCE) {
        this.p.fx?.();
        this.p.triggered?.();
      }
      this.prevVy = vy;
    }
    this.prevY = y;
    this.prevGrounded = c.grounded;
  }

  /** Death, class change and load: hands the controller back and drops the detection history. */
  reset(): void {
    this.release();
    this.forget();
  }

  private release(): void {
    const c = this.owned;
    if (!c) return;
    this.owned = null;
    c.airJumps = 0;
    c.airJumpSpeed = undefined;
  }

  private forget(): void {
    this.prevY = NaN;
    this.prevVy = 0;
    this.prevGrounded = true;
  }
}
