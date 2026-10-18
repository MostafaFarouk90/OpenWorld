import { LOCK_ON } from './tuning';
import type { Team } from './types';

/** One potential lock-on target, sampled by the caller from its actor list. */
export interface Candidate {
  id: string;
  x: number;
  z: number;
  y?: number;
  team: Team;
  dead: boolean;
}

/** Per-tick snapshot the model reads. Yaw 0 looks down -Z; forward is (-sin yaw, -cos yaw). */
export interface LockView {
  tick: number;
  playerX: number;
  playerZ: number;
  cameraYaw: number;
  playerDead: boolean;
  candidates: readonly Candidate[];
  hasSight(id: string): boolean;
}

export type ReleaseReason = 'dead' | 'gone' | 'team' | 'far' | 'lostSight' | 'playerDead';

export type UpdateResult = { released: ReleaseReason } | { reacquired: string } | null;

/** Angles closer than this count as equal, so the nearest candidate wins float ties. */
const EPS = 1e-9;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Lock-on target selection: pure state machine, no rendering. Candidates are living hostiles inside range, the
 * camera cone and line of sight; the best is the smallest angle from the camera forward, then the nearest.
 */
export class LockOnModel {
  private id: string | null = null;
  private lostSight = 0;
  private lastSwapTick = -Infinity;
  private mouse: { dx: number; tick: number }[] = [];

  get target(): string | null {
    return this.id;
  }

  /** Unlocks if locked, else locks the best candidate. No candidate leaves the state unchanged. */
  toggle(view: LockView): { changed: boolean; target: string | null } {
    if (this.id !== null) {
      this.clear();
      return { changed: true, target: null };
    }
    const best = this.pick(view);
    if (!best) return { changed: false, target: null };
    this.lock(best.id);
    return { changed: true, target: best.id };
  }

  /** Moves the lock to the nearest candidate on the given screen side (-1 left, +1 right). */
  swap(dir: -1 | 1, view: LockView): boolean {
    if (this.id === null) return false;
    if (view.tick - this.lastSwapTick < LOCK_ON.swapCooldownTicks) return false;
    const current = view.candidates.find((c) => c.id === this.id);
    if (!current) return false;
    const base = this.bearing(current, view);
    let best: Candidate | null = null;
    let bestDiff = Infinity;
    let bestDist = Infinity;
    for (const c of this.filter(view)) {
      if (c.id === this.id) continue;
      const diff = wrap(this.bearing(c, view) - base);
      if (diff * dir <= 0) continue;
      const abs = Math.abs(diff);
      const dist = Math.hypot(c.x - view.playerX, c.z - view.playerZ);
      if (abs < bestDiff - EPS || (Math.abs(abs - bestDiff) <= EPS && dist < bestDist)) {
        best = c;
        bestDiff = abs;
        bestDist = dist;
      }
    }
    if (!best) return false;
    this.lock(best.id);
    this.lastSwapTick = view.tick;
    return true;
  }

  /** Per fixed tick: validates the lock. Returns the release reason, a re-acquired id, or null if unchanged. */
  update(view: LockView): UpdateResult {
    if (this.id === null) return null;
    if (view.playerDead) return this.release('playerDead');
    const t = view.candidates.find((c) => c.id === this.id);
    if (!t) return this.release('gone');
    if (t.dead) {
      let best: Candidate | null = null;
      let bestDist = Infinity;
      for (const c of this.filter(view, LOCK_ON.reacquireRange)) {
        if (c.id === t.id) continue;
        const d = Math.hypot(c.x - view.playerX, c.z - view.playerZ);
        if (d < bestDist) {
          best = c;
          bestDist = d;
        }
      }
      if (!best) return this.release('dead');
      this.lock(best.id);
      return { reacquired: best.id };
    }
    if (t.team !== 'hostile') return this.release('team');
    if (Math.hypot(t.x - view.playerX, t.z - view.playerZ) > LOCK_ON.releaseRange) return this.release('far');
    if (view.hasSight(t.id)) {
      this.lostSight = 0;
    } else if (++this.lostSight >= LOCK_ON.lostSightTicks) {
      return this.release('lostSight');
    }
    return null;
  }

  /**
   * Accumulates horizontal mouse pixels (positive = right). Returns +1/-1 once the signed sum inside the
   * swap window reaches the threshold, then resets; otherwise 0.
   */
  pushMouse(dx: number, tick: number): -1 | 0 | 1 {
    this.mouse = this.mouse.filter((e) => tick - e.tick <= LOCK_ON.swapWindowTicks);
    if (dx !== 0) this.mouse.push({ dx, tick });
    const sum = this.mouse.reduce((s, e) => s + e.dx, 0);
    if (Math.abs(sum) < LOCK_ON.swapMousePixels) return 0;
    this.mouse = [];
    return sum > 0 ? 1 : -1;
  }

  private lock(id: string): void {
    this.id = id;
    this.lostSight = 0;
  }

  private clear(): void {
    this.id = null;
    this.lostSight = 0;
  }

  private release(reason: ReleaseReason): { released: ReleaseReason } {
    this.clear();
    return { released: reason };
  }

  /** Signed angle of `c` from the camera forward as seen from the player; positive is screen-right. */
  private bearing(c: Candidate, view: LockView): number {
    const dx = c.x - view.playerX;
    const dz = c.z - view.playerZ;
    const fx = -Math.sin(view.cameraYaw);
    const fz = -Math.cos(view.cameraYaw);
    const rx = Math.cos(view.cameraYaw);
    const rz = -Math.sin(view.cameraYaw);
    return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  }

  private filter(view: LockView, range: number = LOCK_ON.range): Candidate[] {
    return view.candidates.filter((c) => {
      if (c.dead || c.team !== 'hostile') return false;
      if (Math.hypot(c.x - view.playerX, c.z - view.playerZ) > range) return false;
      if (Math.abs(this.bearing(c, view)) > LOCK_ON.coneHalfAngle) return false;
      return view.hasSight(c.id);
    });
  }

  private pick(view: LockView): Candidate | null {
    let best: Candidate | null = null;
    let bestAngle = Infinity;
    let bestDist = Infinity;
    for (const c of this.filter(view)) {
      const a = Math.abs(this.bearing(c, view));
      const d = Math.hypot(c.x - view.playerX, c.z - view.playerZ);
      if (a < bestAngle - EPS || (Math.abs(a - bestAngle) <= EPS && d < bestDist)) {
        best = c;
        bestAngle = a;
        bestDist = d;
      }
    }
    return best;
  }
}
