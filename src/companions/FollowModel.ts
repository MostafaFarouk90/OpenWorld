// The companion's follow step as a pure model: a breadcrumb trail of the player's feet, a rest slot behind the
// player, gait with hysteresis, and the decisions that ask for a teleport-behind. No three.js, no game context:
// the caller supplies the ground and applies the pose (plans/slice-2-tobb.md sections 4 and 13).
import { COMPANION_TUNING } from './tuning';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Gait = 'idle' | 'walk' | 'run' | 'sprint';
export type TeleportReason = 'far' | 'unsupported' | 'jump' | 'stuck' | 'requested';

export interface FollowInput {
  dt: number;
  player: Vec3;
  /** 0 faces -Z; forward is (-sin yaw, -cos yaw). */
  playerYaw: number;
  /** Ground height near `(x, z)` with `yHint` the caller's current height; null when there is no usable ground. */
  groundAt(x: number, z: number, yHint: number): number | null;
  /** Stand still and face the player (talking to him). */
  hold?: boolean;
  /** Indoors: the next waypoint from `from` towards `to` on the nav grid, or null to use the trail. */
  steer?(from: Vec3, to: { x: number; z: number }): { x: number; z: number } | null;
}

export interface FollowStep {
  gait: Gait;
  /** Set when the caller should place him behind the player (the model does not move him then). */
  teleport: TeleportReason | null;
}

export type FollowTuning = typeof COMPANION_TUNING;

const finite = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
/** Smoothed player speed (m/s) above which the player counts as moving. */
const PLAYER_MOVING = 1;
const dist3d = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dist2d = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The yaw that faces along (dx, dz) in the engine convention (yaw 0 faces -Z). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** A point `back` metres behind the facing and `side` metres to its right (negative is left). */
export function behind(feet: Vec3, yaw: number, back: number, side = 0): { x: number; z: number } {
  // Forward (-sin, -cos); right (cos, -sin).
  return {
    x: feet.x + Math.sin(yaw) * back + Math.cos(yaw) * side,
    z: feet.z + Math.cos(yaw) * back - Math.sin(yaw) * side,
  };
}

/** Fixed-size ring of the player's recent feet, one point per `spacing` metres travelled. */
export class Trail {
  private readonly pts: Vec3[] = [];

  constructor(
    private readonly cap: number,
    private readonly spacing: number,
  ) {}

  get length(): number {
    return this.pts.length;
  }

  /** Oldest first. */
  points(): readonly Vec3[] {
    return this.pts;
  }

  newest(): Vec3 | undefined {
    return this.pts[this.pts.length - 1];
  }

  push(p: Vec3): void {
    if (!finite(p)) return;
    const last = this.newest();
    if (last && dist2d(last, p) < this.spacing) return;
    this.pts.push({ x: p.x, y: p.y, z: p.z });
    if (this.pts.length > this.cap) this.pts.shift();
  }

  clear(): void {
    this.pts.length = 0;
  }

  /**
   * Pure pursuit: the point `lookAhead` metres further along the trail than the trail point nearest `from`,
   * or null when `from` is more than `lostDistance` from every point.
   */
  pursue(from: { x: number; z: number }, lookAhead: number, lostDistance: number): Vec3 | null {
    if (this.pts.length === 0) return null;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.pts.length; i++) {
      const d = dist2d(this.pts[i], from);
      // Ties go to the newer point, so he never walks back along the trail.
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > lostDistance) return null;
    let left = lookAhead;
    for (let i = best; i < this.pts.length - 1; i++) {
      const seg = dist2d(this.pts[i], this.pts[i + 1]);
      if (seg >= left) {
        const t = left / seg;
        const a = this.pts[i];
        const b = this.pts[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      }
      left -= seg;
    }
    return { ...this.pts[this.pts.length - 1] };
  }
}

/** The follow state of one companion. Positions are feet. */
export class FollowModel {
  readonly pos: Vec3;
  yaw: number;
  gait: Gait = 'idle';
  /** Current ground speed, m/s. */
  speed = 0;
  readonly trail: Trail;
  private lastPlayer: Vec3 | null = null;
  /** Smoothed player ground speed, m/s. */
  private playerSpeed = 0;
  /** Which side of the player the slot sits on: 1 right, -1 left. */
  private side = 1;
  private settled = true;
  private stuckClock = 0;
  private stuckFrom: Vec3 | null = null;
  private pending: TeleportReason | null = null;

  constructor(
    start: Vec3,
    yaw = 0,
    private readonly tuning: FollowTuning = COMPANION_TUNING,
  ) {
    this.pos = { ...start };
    this.yaw = yaw;
    this.trail = new Trail(tuning.trailPoints, tuning.trailSpacing);
  }

  /** Asks for a teleport-behind on the next step (fast travel, respawn, doors, loads). */
  requestTeleport(): void {
    this.pending = 'requested';
  }

  /** Puts him at `p` (a resolved teleport or a load), clears the trail, the stuck clock and the player history. */
  place(p: Vec3, yaw: number): void {
    if (!finite(p) || !Number.isFinite(yaw)) return;
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.pos.z = p.z;
    this.yaw = wrapAngle(yaw);
    this.gait = 'idle';
    this.speed = 0;
    this.settled = true;
    this.pending = null;
    // The jump that caused the teleport must not count twice.
    this.lastPlayer = null;
    this.trail.clear();
    this.resetStuck();
  }

  step(input: FollowInput): FollowStep {
    const t = this.tuning;
    const { dt, player } = input;
    if (!(dt > 0) || !finite(player) || !Number.isFinite(input.playerYaw)) return { gait: this.gait, teleport: null };

    const moved = this.lastPlayer ? dist3d(this.lastPlayer, player) : 0;
    const jumped = this.lastPlayer !== null && moved >= t.jumpDistance;
    if (this.lastPlayer && !jumped) {
      // Smoothed over about a quarter of a second.
      const k = Math.min(1, dt / 0.25);
      this.playerSpeed += (dist2d(this.lastPlayer, player) / dt - this.playerSpeed) * k;
    }
    this.lastPlayer = { ...player };
    if (jumped) {
      this.trail.clear();
      return this.teleport('jump');
    }
    if (this.pending) return this.teleport(this.pending);
    this.trail.push(player);

    if (dist3d(this.pos, player) > t.teleportDistance) return this.teleport('far');
    if (input.groundAt(this.pos.x, this.pos.z, this.pos.y) === null) return this.teleport('unsupported');

    if (input.hold) return this.stand(player, dt);

    const toPlayer = dist2d(this.pos, player);
    const target = this.pickTarget(player, input.playerYaw, toPlayer, input);
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    // Hysteresis: once settled he stays put until the slot is clearly away.
    const resume = t.arriveRadius + t.resumeMargin;
    // While the player moves he keeps pace on the slot instead of stopping on it each time he reaches it.
    const playerMoving = this.playerSpeed > PLAYER_MOVING;
    if (!playerMoving && (d <= t.arriveRadius || (this.settled && d <= resume))) return this.stand(player, dt);
    this.settled = false;
    if (d < 1e-4) {
      this.speed = this.playerSpeed;
      this.gait = this.nextGait(this.speed);
      return { gait: this.gait, teleport: null };
    }

    // Distance still to cover beyond the slot, so speed matches the player's near the slot and closes the gap further out.
    const gap = toPlayer <= t.directRadius ? d : toPlayer - t.slotBack;
    const want = Math.min(t.sprintSpeed, Math.max(t.walkSpeed * 0.5, this.playerSpeed + gap * t.catchUpGain));
    this.speed = want;
    this.gait = this.nextGait(want);
    const stepLen = Math.min(d, want * dt);
    const nx = this.pos.x + (dx / d) * stepLen;
    const nz = this.pos.z + (dz / d) * stepLen;
    const ny = input.groundAt(nx, nz, this.pos.y);
    if (ny === null) return this.teleport('unsupported');
    this.pos.x = nx;
    this.pos.z = nz;
    this.pos.y = ny;
    this.turnTo(yawToward(dx, dz), dt);

    if (this.trackStuck(toPlayer, dt)) return this.teleport('stuck');
    return { gait: this.gait, teleport: null };
  }

  private stand(player: Vec3, dt: number): FollowStep {
    this.gait = 'idle';
    this.speed = 0;
    this.settled = true;
    this.resetStuck();
    this.turnTo(yawToward(player.x - this.pos.x, player.z - this.pos.z), dt);
    return { gait: this.gait, teleport: null };
  }

  private teleport(reason: TeleportReason): FollowStep {
    this.pending = null;
    this.gait = 'idle';
    this.speed = 0;
    this.resetStuck();
    return { gait: this.gait, teleport: reason };
  }

  private pickTarget(player: Vec3, playerYaw: number, toPlayer: number, input: FollowInput): { x: number; z: number } {
    const t = this.tuning;
    const goal = toPlayer <= t.directRadius ? this.slot(player, playerYaw, input) : null;
    if (input.steer) {
      const s = input.steer(this.pos, goal ?? player);
      if (s) return s;
    }
    if (goal) return goal;
    return this.trail.pursue(this.pos, t.lookAhead, t.trailLostDistance) ?? player;
  }

  /** The rest slot; switches side only when the other side's ground is clearly nearer the player's height. */
  private slot(player: Vec3, yaw: number, input: FollowInput): { x: number; z: number } {
    const t = this.tuning;
    const here = behind(player, yaw, t.slotBack, t.slotSide * this.side);
    const there = behind(player, yaw, t.slotBack, -t.slotSide * this.side);
    const gh = input.groundAt(here.x, here.z, player.y);
    const gt = input.groundAt(there.x, there.z, player.y);
    const errHere = gh === null ? Infinity : Math.abs(gh - player.y);
    const errThere = gt === null ? Infinity : Math.abs(gt - player.y);
    if (errThere + 0.5 < errHere) {
      this.side = -this.side;
      return there;
    }
    return here;
  }

  /** Gait from speed, with `gaitHysteresis` m/s around each edge. */
  private nextGait(speed: number): Gait {
    const t = this.tuning;
    const h = t.gaitHysteresis;
    // Edges sit just above walk and run speed, so matching a sprinting player (7.5) reads clearly as sprint.
    const walkTop = t.walkSpeed + 0.5;
    const runTop = t.runSpeed + 0.5;
    const g = this.gait;
    if (g === 'sprint') return speed >= runTop - h ? 'sprint' : speed >= walkTop - h ? 'run' : 'walk';
    if (g === 'run') return speed > runTop + h ? 'sprint' : speed >= walkTop - h ? 'run' : 'walk';
    return speed > runTop + h ? 'sprint' : speed > walkTop + h ? 'run' : 'walk';
  }

  private turnTo(target: number, dt: number): void {
    const diff = wrapAngle(target - this.yaw);
    const maxTurn = this.tuning.turnRate * dt;
    this.yaw = wrapAngle(this.yaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }

  /**
   * True when he himself moved under `stuckProgress` metres in `stuckSeconds` while more than `stuckMinDistance`
   * from the player (he has no collider, so this only catches ground that keeps refusing him).
   */
  private trackStuck(toPlayer: number, dt: number): boolean {
    const t = this.tuning;
    if (toPlayer <= t.stuckMinDistance) {
      this.resetStuck();
      return false;
    }
    if (this.stuckFrom === null) {
      this.stuckFrom = { ...this.pos };
      this.stuckClock = 0;
      return false;
    }
    this.stuckClock += dt;
    if (dist3d(this.stuckFrom, this.pos) >= t.stuckProgress) {
      this.stuckFrom = { ...this.pos };
      this.stuckClock = 0;
      return false;
    }
    return this.stuckClock >= t.stuckSeconds;
  }

  private resetStuck(): void {
    this.stuckFrom = null;
    this.stuckClock = 0;
  }
}
