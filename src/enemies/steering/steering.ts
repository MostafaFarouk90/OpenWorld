import { STEERING } from '../tuning';

/**
 * Pure enemy steering (no Rapier, no Three): seek with arrive, separation, three feelers, a cliff
 * probe on the heightfield and stuck detection. Obstacles come in through `castFeeler`.
 *
 * Yaw convention (matches the player, src/characters/Player.ts: facing = axis-angle about +Y of
 * atan2(-moveX, -moveZ)): yaw 0 faces -Z, yaw +PI/2 faces -X; forward = (-sin(yaw), -cos(yaw)).
 */

export interface SteeringInput {
  position: { x: number; y: number; z: number };
  /** Target point, or null for "stay". */
  desired: { x: number; z: number } | null;
  /** Full speed in m/s (slowed inside the slow radius). */
  speed: number;
  neighbours: { x: number; z: number }[];
  heightAt(x: number, z: number): number;
  /** Distance to the first obstacle along `dir` (unit, horizontal) within `length`, or null. */
  castFeeler(origin: { x: number; y: number; z: number }, dir: { x: number; z: number }, length: number): number | null;
  dt: number;
}

export interface SteeringOutput {
  /** World velocity in m/s. */
  move: { x: number; z: number };
  stuck: boolean;
  giveUp: boolean;
}

/** Height above the feet at which feelers start (above the step height so the ground is not hit). */
export const FEELER_HEIGHT = 0.6;

const DEG = Math.PI / 180;
const EPS = 1e-6;

/** Yaw (radians) that faces from `from` towards `to` on the XZ plane; 0 when they coincide. */
export function yawTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(-dx, -dz);
}

/** Unit forward vector of a yaw (inverse of `yawTo`). */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  else if (r <= -Math.PI) r += twoPi;
  return r;
}

/** Turns `currentYaw` towards `targetYaw` by at most `maxStep` radians along the shortest arc; result wrapped to (-PI, PI]. */
export function turnToward(currentYaw: number, targetYaw: number, maxStep: number): number {
  if (![currentYaw, targetYaw, maxStep].every(Number.isFinite)) return Number.isFinite(currentYaw) ? currentYaw : 0;
  const diff = wrapAngle(targetYaw - currentYaw);
  const step = Math.max(0, maxStep);
  if (Math.abs(diff) <= step) return wrapAngle(targetYaw);
  return wrapAngle(currentYaw + Math.sign(diff) * step);
}

function rotate(x: number, z: number, angle: number): { x: number; z: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - z * s, z: x * s + z * c };
}

export class Steering {
  private lastPos: { x: number; z: number } | null = null;
  private lastMove = { x: 0, z: 0 };
  private stuckRun = 0;
  private stuckTotal = 0;
  private sideStepTimer = 0;
  /** +1 or -1: which perpendicular the next/current side step uses. */
  private sideStepSide = 1;
  private followSide = 0;
  private followHold = 0;
  private gaveUp = false;

  reset(): void {
    this.lastPos = null;
    this.lastMove = { x: 0, z: 0 };
    this.stuckRun = 0;
    this.stuckTotal = 0;
    this.sideStepTimer = 0;
    this.sideStepSide = 1;
    this.followSide = 0;
    this.followHold = 0;
    this.gaveUp = false;
  }

  step(input: SteeringInput): SteeringOutput {
    const { position: p, desired, speed, dt } = input;
    const zero: SteeringOutput = { move: { x: 0, z: 0 }, stuck: false, giveUp: false };
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.z) ||
      !Number.isFinite(speed) ||
      !Number.isFinite(dt) ||
      dt <= 0 ||
      (desired && (!Number.isFinite(desired.x) || !Number.isFinite(desired.z)))
    ) {
      return zero;
    }

    this.updateStuck(p, dt);

    const toX = desired ? desired.x - p.x : 0;
    const toZ = desired ? desired.z - p.z : 0;
    const dist = Math.hypot(toX, toZ);
    if (!desired || speed <= 0 || dist < STEERING.arriveRadius || dist < EPS) {
      this.stand(p);
      return zero;
    }
    const dirX = toX / dist;
    const dirZ = toZ / dist;

    let speedNow = speed;
    if (dist < STEERING.slowRadius) speedNow *= Math.max(0.25, dist / STEERING.slowRadius);

    let heading: { x: number; z: number };
    if (this.sideStepTimer > 0) {
      this.sideStepTimer = Math.max(0, this.sideStepTimer - dt);
      heading = { x: -dirZ * this.sideStepSide, z: dirX * this.sideStepSide };
    } else {
      if (this.stuckRun >= STEERING.stuckSeconds - EPS) {
        this.sideStepTimer = STEERING.sideStepSeconds;
        this.sideStepSide = -this.sideStepSide;
        this.stuckRun = 0;
        heading = { x: -dirZ * this.sideStepSide, z: dirX * this.sideStepSide };
        this.sideStepTimer = Math.max(0, this.sideStepTimer - dt);
      } else {
        heading = this.avoid(p, dirX, dirZ, input);
      }
    }

    // Separation.
    let sepX = 0;
    let sepZ = 0;
    for (const n of input.neighbours) {
      if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.z)) continue;
      const ox = p.x - n.x;
      const oz = p.z - n.z;
      const d = Math.hypot(ox, oz);
      if (d >= STEERING.separationRadius) continue;
      const w = 1 - d / STEERING.separationRadius;
      if (d < EPS) {
        sepX += -dirZ * w;
        sepZ += dirX * w;
      } else {
        sepX += (ox / d) * w;
        sepZ += (oz / d) * w;
      }
    }
    let hx = heading.x + sepX * STEERING.separationWeight;
    let hz = heading.z + sepZ * STEERING.separationWeight;
    const hl = Math.hypot(hx, hz);
    if (hl < EPS) {
      hx = heading.x;
      hz = heading.z;
    } else {
      hx /= hl;
      hz /= hl;
    }

    // Cliff and slope probe; try sliding along the edge when refused.
    let final: { x: number; z: number } | null = { x: hx, z: hz };
    if (!this.allowed(p, final, input.heightAt)) {
      const a = { x: -hz, z: hx };
      const b = { x: hz, z: -hx };
      const okA = this.allowed(p, a, input.heightAt);
      const okB = this.allowed(p, b, input.heightAt);
      const dotA = a.x * dirX + a.z * dirZ;
      const dotB = b.x * dirX + b.z * dirZ;
      if (okA && okB) final = dotA >= dotB ? a : b;
      else if (okA) final = a;
      else if (okB) final = b;
      else final = null;
    }

    const move = final ? { x: final.x * speedNow, z: final.z * speedNow } : { x: 0, z: 0 };
    this.lastMove = move;
    this.lastPos = { x: p.x, z: p.z };
    return { move, stuck: this.sideStepTimer > 0, giveUp: this.checkGiveUp() };
  }

  /** Called when no move is wanted: forget progress tracking but keep nothing pending. */
  private stand(p: { x: number; z: number }): void {
    this.lastPos = { x: p.x, z: p.z };
    this.lastMove = { x: 0, z: 0 };
    this.stuckRun = 0;
    this.stuckTotal = 0;
    this.sideStepTimer = 0;
  }

  private updateStuck(p: { x: number; z: number }, dt: number): void {
    const wanted = Math.hypot(this.lastMove.x, this.lastMove.z) * dt;
    if (!this.lastPos || wanted < EPS) return;
    const actual = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    if (actual < STEERING.stuckProgress * wanted) {
      this.stuckRun += dt;
      this.stuckTotal += dt;
      return;
    }
    this.stuckRun = 0;
    // Moving freely again (and not in the middle of a side step) clears the give-up clock.
    if (this.sideStepTimer <= 0) this.stuckTotal = 0;
  }

  private checkGiveUp(): boolean {
    if (this.gaveUp) return false;
    if (this.stuckTotal >= STEERING.giveUpSeconds - 1e-4) {
      this.gaveUp = true;
      return true;
    }
    return false;
  }

  /** Feelers: returns the heading, turned away from obstacles ahead. */
  private avoid(
    p: { x: number; y: number; z: number },
    dirX: number,
    dirZ: number,
    input: SteeringInput,
  ): { x: number; z: number } {
    const origin = { x: p.x, y: p.y + FEELER_HEIGHT, z: p.z };
    const len = STEERING.feelerLength;
    const a = STEERING.feelerDegrees * DEG;
    const fwd = input.castFeeler(origin, { x: dirX, z: dirZ }, len);
    const l = input.castFeeler(origin, rotate(dirX, dirZ, a), len);
    const r = input.castFeeler(origin, rotate(dirX, dirZ, -a), len);

    if (fwd !== null) {
      // Pick the clearer side once and keep it while the wall is ahead, so the agent follows it.
      if (this.followSide === 0) {
        const clearL = l ?? Infinity;
        const clearR = r ?? Infinity;
        this.followSide = clearR > clearL + 0.05 ? -1 : 1;
      }
      this.followHold = 0.5;
      const urgency = 1 - Math.min(1, Math.max(0, (fwd - 0.3) / (len - 0.3)));
      // Two or more hits give the wall's tangent; follow it, nudged away from the wall.
      const dl = rotate(dirX, dirZ, a);
      const dr = rotate(dirX, dirZ, -a);
      const pts: { x: number; z: number }[] = [];
      if (l !== null) pts.push({ x: dl.x * l, z: dl.z * l });
      if (r !== null) pts.push({ x: dr.x * r, z: dr.z * r });
      if (pts.length < 2) pts.push({ x: dirX * fwd, z: dirZ * fwd });
      if (pts.length >= 2) {
        let tx = pts[0].x - pts[1].x;
        let tz = pts[0].z - pts[1].z;
        const tl = Math.hypot(tx, tz);
        if (tl > 1e-3) {
          tx /= tl;
          tz /= tl;
          // Orient along the followed side: perpendicular of the desired direction is (-dirZ, dirX).
          if ((tx * -dirZ + tz * dirX) * this.followSide < 0) {
            tx = -tx;
            tz = -tz;
          }
          // Away from the wall: the normal that opposes the desired direction.
          let nx = tz;
          let nz = -tx;
          if (nx * dirX + nz * dirZ > 0) {
            nx = -nx;
            nz = -nz;
          }
          const k = 0.6 * urgency;
          const hx = tx + nx * k;
          const hz = tz + nz * k;
          const hl = Math.hypot(hx, hz);
          return { x: hx / hl, z: hz / hl };
        }
      }
      return rotate(dirX, dirZ, this.followSide * (a + (90 * DEG - a) * urgency));
    }
    this.followHold = Math.max(0, this.followHold - input.dt);
    if (this.followHold <= 0) this.followSide = 0;
    if (l !== null && r === null) return rotate(dirX, dirZ, -20 * DEG * (1 - l / len));
    if (r !== null && l === null) return rotate(dirX, dirZ, 20 * DEG * (1 - r / len));
    return { x: dirX, z: dirZ };
  }

  private allowed(
    p: { x: number; z: number },
    dir: { x: number; z: number },
    heightAt: (x: number, z: number) => number,
  ): boolean {
    const d = STEERING.probeDistance;
    const h0 = heightAt(p.x, p.z);
    const h1 = heightAt(p.x + dir.x * d, p.z + dir.z * d);
    const dh = h1 - h0;
    if (!Number.isFinite(dh)) return true;
    if (-dh > STEERING.maxDrop) return false;
    return Math.atan(Math.abs(dh) / d) <= STEERING.maxSlopeDegrees * DEG;
  }
}
