import { PLAYER } from '../config/constants';
import { LEAP } from '../spells/tuning';
import { Stamina } from '../player/Stamina';
import { Courier } from './Courier';
import { type P3, Polyline, type RouteNode, horizontal, playerPath } from './route';
import { CHASE } from './tuning';

const DT = 1 / 60;
/** Seconds in the air for a jump from feet height y0 landing at y1 at the given launch speed (NaN if unreachable). */
export function airtime(vy: number, gravity: number, y0: number, y1: number): number {
  const disc = vy * vy + 2 * gravity * (y0 - y1);
  return disc < 0 ? NaN : (vy + Math.sqrt(disc)) / gravity;
}

/** The horizontal reach of a plain jump at a run speed, from one roof height to another. */
export function jumpReach(speed: number, y0: number, y1: number): number {
  const t = airtime(PLAYER.jumpSpeed, PLAYER.gravity, y0, y1);
  return Number.isFinite(t) ? speed * t : 0;
}

/** Seconds a Leap spends in the air on flat ground (ballistic with the Leap's apex). */
export const LEAP_SECONDS = (2 * Math.sqrt(2 * PLAYER.gravity * LEAP.apex)) / PLAYER.gravity;

function staminaPool(max: number): Stamina {
  const actor = {
    stamina: max,
    maxStamina: max,
    spendStamina(n: number) {
      if (actor.stamina < n) return false;
      actor.stamina -= n;
      return true;
    },
    restoreStamina(n: number) {
      actor.stamina = Math.min(actor.maxStamina, actor.stamina + n);
    },
  };
  return new Stamina(actor, () => false);
}

/**
 * Average speed of a runner who sprints whenever the stamina rules allow, over `seconds` on open ground
 * (derived from `STAMINA` through the real `Stamina` rules, never hard-coded).
 */
export function sustainableSpeed(maxStamina: number, seconds = 120): number {
  const st = staminaPool(maxStamina);
  let d = 0;
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const sprint = !st.exhausted && st.current > 0;
    st.tick({ blocking: false, sprinting: sprint });
    d += (sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * DT;
  }
  return d / seconds;
}

export interface ParOptions {
  /** Lowest class stamina (Emberwright 80). */
  maxStamina: number;
  /** Cross detour gaps with the Leap when it is off cooldown. */
  useLeap: boolean;
  /** Never sprints (the walker that must fail). */
  neverSprint?: boolean;
  /** Seconds before `'timer'`; default 600 (only a safety cap). */
  timer?: number;
}

export interface ParResult {
  outcome: 'caught' | 'lost';
  reason?: 'timer' | 'distance' | 'stuck';
  seconds: number;
  maxGap: number;
  leaps: number;
  /** Length of the line the runner took (m). */
  pathLength: number;
}

/**
 * The par runner (plans/slice-2-stealth-chase.md section 12): runs the player's line with the real stamina rules,
 * plain jumps whose reach depends on the current speed, optional Leaps (4 s cooldown) across detour gaps, and a
 * small cost per vault, against the real `Courier`. Applies the chase's caught and lost rules.
 */
export function runPar(nodes: readonly RouteNode[], opts: ParOptions): ParResult {
  const path = playerPath(nodes, opts.useLeap);
  const line = new Polyline(path.map((p) => p.position));
  const courier = new Courier(nodes);
  const st = staminaPool(opts.maxStamina);
  const timer = opts.timer ?? 600;
  const pos: P3 = { x: 0, y: 0, z: 0 };
  line.sampleAt(0, pos);

  let s = 0;
  let t = 0;
  let wait = 0;
  let airborne = 0;
  let airSpeed = 0;
  let leapReadyAt = 0;
  let leaps = 0;
  let farFor = 0;
  let maxGap = 0;
  let nextPoint = 1;
  let stuckFor = 0;

  while (t < timer) {
    const gap = Math.hypot(courier.position.x - pos.x, courier.position.y - pos.y, courier.position.z - pos.z);
    maxGap = Math.max(maxGap, gap);
    if (gap <= CHASE.catchRadius) {
      return { outcome: 'caught', seconds: t, maxGap, leaps, pathLength: line.length };
    }
    farFor = gap > CHASE.loseGap ? farFor + DT : 0;
    if (farFor >= CHASE.loseSeconds - 1e-9) return { outcome: 'lost', reason: 'distance', seconds: t, maxGap, leaps, pathLength: line.length };

    const canSprint = !opts.neverSprint && !st.exhausted && st.current > 0;
    let speed = 0;
    let sprinting = false;
    if (airborne > 0) {
      airborne -= DT;
      speed = airSpeed;
    } else if (wait > 0) {
      wait -= DT;
    } else {
      speed = canSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      sprinting = canSprint;
      // Take-off: at a path point that starts a gap segment (a plain jump, or the Leap across a detour gap).
      const at = path[nextPoint - 1];
      const nodeIdx = at?.node ?? -1;
      const node = nodeIdx >= 0 ? nodes[nodeIdx] : undefined;
      if (node && node.kind === 'gap' && !(node.detour && !opts.useLeap) && Math.abs(s - line.cum[nextPoint - 1]) < 1e-6) {
        const to = path[nextPoint].position;
        const width = horizontal(node.position, to);
        if (node.detour) {
          // Only reached when useLeap: the line goes straight across.
          if (width > LEAP.distance + 1e-6) return { outcome: 'lost', reason: 'stuck', seconds: t, maxGap, leaps, pathLength: line.length };
          if (t < leapReadyAt) {
            wait = leapReadyAt - t;
            speed = 0;
          } else {
            airborne = LEAP_SECONDS;
            airSpeed = width / LEAP_SECONDS;
            leapReadyAt = t + LEAP.cooldownSeconds;
            leaps++;
            speed = airSpeed;
          }
        } else if (jumpReach(speed, node.position.y, to.y) + 1e-6 >= width) {
          airborne = airtime(PLAYER.jumpSpeed, PLAYER.gravity, node.position.y, to.y);
          airSpeed = width / airborne;
          speed = airSpeed;
        } else {
          // Too slow to clear it: stand and recover, then sprint the jump. A runner who can never sprint is stuck.
          speed = 0;
          stuckFor += DT;
          if (stuckFor > 30) return { outcome: 'lost', reason: 'stuck', seconds: t, maxGap, leaps, pathLength: line.length };
        }
      }
    }
    st.tick({ blocking: false, sprinting: sprinting && speed > 0 });

    const before = s;
    s = Math.min(line.length, s + speed * DT);
    // Crossing into the next path point: vault cost and gap take-off checks happen exactly at the point.
    while (nextPoint < path.length && s >= line.cum[nextPoint] - 1e-9 && before < line.cum[nextPoint] + 1e-9) {
      s = line.cum[nextPoint];
      const n = path[nextPoint].node >= 0 ? nodes[path[nextPoint].node] : undefined;
      if (n?.kind === 'vault') wait = CHASE.playerVaultSeconds;
      airborne = 0;
      nextPoint++;
      if (n?.kind === 'gap') break;
    }
    line.sampleAt(s, pos);
    courier.step(DT, Math.hypot(courier.position.x - pos.x, courier.position.y - pos.y, courier.position.z - pos.z));
    t += DT;
  }
  return { outcome: 'lost', reason: 'timer', seconds: t, maxGap, leaps, pathLength: line.length };
}

/** The chase timer for a route: par (no Leap, lowest stamina) times the margin, rounded up to whole seconds. */
export function timerFor(nodes: readonly RouteNode[], minStamina: number): number {
  const par = runPar(nodes, { maxStamina: minStamina, useLeap: false });
  if (par.outcome !== 'caught') return NaN;
  return Math.ceil(par.seconds * CHASE.timerOverPar);
}
