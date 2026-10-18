import { AI } from '../../enemies/tuning';
import { CALM, type GuardAlert, IDLE_PLAYER, type PlayerStealthState, detectTick } from '../detection';
import type { P3 } from '../perceptionPort';
import { STEALTH } from '../tuning';

/** A solid box seen from above (walls, shelves) with its height; sight rays below the top are blocked. */
export interface SolidBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

/** Line of sight blocked by any box the ray crosses below its top (slab test in 3D). */
export function boxLineOfSight(boxes: readonly SolidBox[]): (from: P3, to: P3) => boolean {
  return (from, to) => {
    for (const b of boxes) {
      let t0 = 0;
      let t1 = 1;
      const axes: [number, number, number, number][] = [
        [from.x, to.x - from.x, b.minX, b.maxX],
        [from.y, to.y - from.y, -1e9, b.top],
        [from.z, to.z - from.z, b.minZ, b.maxZ],
      ];
      let hit = true;
      for (const [o, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-12) {
          if (o < lo || o > hi) hit = false;
          continue;
        }
        let a = (lo - o) / d;
        let c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) hit = false;
      }
      if (hit) return false;
    }
    return true;
  };
}

/**
 * A guard on a closed patrol loop, as the runtime walks it (Enemy.think: walk speed, arrive within AI.waypointRadius,
 * wait AI.waypointWaitSeconds). Facing follows travel; while waiting it keeps the last heading. `phase` shifts the
 * start along the loop in seconds (the sweep that keeps the scripted route from being tick-perfect).
 */
export class KinematicPatrol {
  feet: P3;
  yaw: number;
  private target = 1;
  private wait = 0;

  constructor(
    readonly route: readonly P3[],
    readonly speed: number,
    phase = 0,
  ) {
    this.feet = { ...route[0] };
    const n = route[1 % route.length];
    this.yaw = Math.atan2(-(n.x - this.feet.x), -(n.z - this.feet.z));
    if (phase < 0) {
      // Negative phase: start that long into the first wait (the guard leaves later).
      this.wait = Math.min(-phase, AI.waypointWaitSeconds);
    } else for (let t = 0; t < phase; t += 1 / 60) this.step(1 / 60);
  }

  step(dt: number): void {
    if (this.route.length < 2) return;
    if (this.wait > 0) {
      this.wait = Math.max(0, this.wait - dt);
      return;
    }
    const t = this.route[this.target];
    const dx = t.x - this.feet.x;
    const dz = t.z - this.feet.z;
    const d = Math.hypot(dx, dz);
    if (d <= AI.waypointRadius) {
      this.target = (this.target + 1) % this.route.length;
      this.wait = AI.waypointWaitSeconds;
      return;
    }
    const s = Math.min(d, this.speed * dt);
    this.feet = { x: this.feet.x + (dx / d) * s, y: this.feet.y, z: this.feet.z + (dz / d) * s };
    this.yaw = Math.atan2(-dx, -dz);
  }
}

/** One step of the player's script: walk (or sneak) to a point, or wait in place (optionally hidden). */
export type ScriptStep = { to: P3; sneak: boolean } | { wait: number; sneak: boolean; hidden?: boolean };

export interface RouteRun {
  noticed: number;
  caught: number;
  maxAwareness: number;
  seconds: number;
}

const SNEAK_SPEED = 4.5 * STEALTH.sneakSpeedScale;
const WALK_SPEED = 4.5;

/** Runs a scripted player through guards on a fixed 1/60 tick; counts noticed (awareness 1) and caught events. */
export function runScript(start: P3, script: readonly ScriptStep[], guards: KinematicPatrol[], los: (a: P3, b: P3) => boolean, upright = false): RouteRun {
  const dt = 1 / 60;
  const feet = { ...start };
  const state = guards.map(() => ({ awareness: 0, alert: CALM as GuardAlert, spotted: false }));
  let noticed = 0;
  let caught = 0;
  let maxAwareness = 0;
  let t = 0;
  const tick = (player: PlayerStealthState) => {
    guards.forEach((g, i) => {
      g.step(dt);
      const r = detectTick(g, feet, player, state[i], dt, los);
      state[i].awareness = r.awareness;
      state[i].alert = r.alert;
      if (r.awareness >= 1 && !state[i].spotted) noticed++;
      state[i].spotted = r.awareness >= 1;
      if (r.caught) caught++;
      maxAwareness = Math.max(maxAwareness, r.awareness);
    });
    t += dt;
  };
  for (const step of script) {
    const sneak = step.sneak && !upright;
    if ('to' in step) {
      const speed = sneak ? SNEAK_SPEED : WALK_SPEED;
      for (let guard = 0; guard < 100000; guard++) {
        const dx = step.to.x - feet.x;
        const dz = step.to.z - feet.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-3) break;
        const s = Math.min(d, speed * dt);
        feet.x += (dx / d) * s;
        feet.z += (dz / d) * s;
        tick({ ...IDLE_PLAYER, sneaking: sneak, moving: true });
      }
    } else {
      const n = Math.round(step.wait / dt);
      for (let i = 0; i < n; i++) tick({ ...IDLE_PLAYER, sneaking: sneak || !!step.hidden, hidden: !!step.hidden && !upright, moving: false });
    }
  }
  return { noticed, caught, maxAwareness, seconds: t };
}
