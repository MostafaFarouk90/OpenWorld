import { describe, expect, it } from 'vitest';
import { EormenBrain, type EormenHooks } from './EormenBrain';
import { EORMEN, eormenScale } from './tuning';

/**
 * The boss beat is about 6 min (the Act 3 standard, plans/embers-act-3.md 7.1): a headless fight on the real brain and the
 * encounter's rules (three phases of one bar each, the bar breaks only at the Last Gong inside the window after a toll, each phase
 * held above its threshold until its bar, the 8 % floor, the early toll at the floor, three husks to put down each phase) against
 * scripted players. The players' numbers are readings (the Bellows-Engine's profiles, a little up for the Waste's gear): how much
 * they deal a second while in reach, the share of the time Eormen is in their reach (he drifts to keep 6 to 10 m), the walk to the
 * gong, and the seconds the husks take each phase. L13 retunes against its real chain.
 */
interface Profile {
  name: string;
  /** Eormen's level (35, or 32 for a player at 29 under the P + 3 cap); his health scales with it. */
  level: number;
  dps: number;
  uptime: number;
  /** Seconds from wherever they fight to the gong. */
  gongWalk: number;
  /** Seconds the three husks of a phase take (no boss damage meanwhile). */
  husks: number;
  dist: number;
}

const TICK = 1 / 60;
/** Share of the time spent defending (dodging the blades and the toll ring, blocking the swipe). */
const DEFENDING = 0.35;

function fight(p: Profile): number {
  const noop = () => {};
  let opened = 0;
  const hooks: EormenHooks = {
    telegraph: noop,
    cancelTelegraph: noop,
    blades: noop,
    toll: noop,
    swipe: noop,
    windowOpen: () => void opened++,
    windowClose: noop,
    staggerStart: noop,
    staggerEnd: noop,
  };
  const brain = new EormenBrain(hooks);
  brain.start();
  const max = Math.round(EORMEN.maxHealth * eormenScale(p.level));
  let health = max;
  let phase = 1;
  const broken = [false, false, false];
  let husks = p.husks;
  let walked = 0;
  let floored = false;
  for (let t = 0; t < 1800; t += TICK) {
    brain.tick(TICK, { dist: p.dist });
    if (husks > 0) {
      husks -= TICK;
      continue;
    }
    let k = phase;
    while (k <= 3 && broken[k - 1]) k++;
    const hold = k <= 3 ? (EORMEN.phases[k - 1] !== undefined ? Math.floor(max * EORMEN.phases[k - 1]) + 1 : Math.ceil(max * EORMEN.healthFloor)) : 0;
    // At the floor with this phase's bar whole: walk to the gong, wait there for the window, strike.
    if (!broken[phase - 1] && health <= hold) {
      if (!floored) {
        floored = true;
        brain.onFloor();
      }
      walked += TICK;
      if (walked >= p.gongWalk && brain.windowOpen && brain.strikeGong() === 'break') {
        broken[phase - 1] = true;
        brain.onBreak();
        walked = 0;
        floored = false;
      }
      continue;
    }
    let dealt = p.dps * TICK * p.uptime * (1 - DEFENDING);
    dealt = Math.min(dealt, Math.max(0, health - hold));
    health -= dealt;
    if (phase < 3 && health <= max * EORMEN.phases[phase - 1]) {
      phase++;
      brain.onPhase(phase);
      husks = p.husks;
    }
    if (health <= 0) return t;
  }
  return Infinity;
}

/** At 35 (a full-play player near 34), and at 32 (a player at 29: weaker kit, about 12 % less damage). */
const PROFILES: Profile[] = [
  { name: 'blade at 35', level: 35, dps: 30, uptime: 0.5, gongWalk: 5, husks: 15, dist: 3 },
  { name: 'ranged at 35', level: 35, dps: 19, uptime: 0.8, gongWalk: 6, husks: 18, dist: 9 },
  { name: 'caster at 35', level: 35, dps: 21, uptime: 0.7, gongWalk: 6, husks: 16, dist: 8 },
  { name: 'blade at 32', level: 32, dps: 26, uptime: 0.5, gongWalk: 5, husks: 15, dist: 3 },
  { name: 'ranged at 32', level: 32, dps: 17, uptime: 0.8, gongWalk: 6, husks: 18, dist: 9 },
  { name: 'caster at 32', level: 32, dps: 18, uptime: 0.7, gongWalk: 6, husks: 16, dist: 8 },
];

describe('Eormen pacing (the 6 min boss beat)', () => {
  it.each(PROFILES.map((p) => [p.name, p] as const))('%s finishes him in 4.5 to 6 minutes', (_n, p) => {
    const t = fight(p);
    expect(t).toBeGreaterThan(270);
    expect(t).toBeLessThan(360);
  });

  it('readings for L13', () => {
    const minutes = PROFILES.map((p) => `${p.name}: ${(fight(p) / 60).toFixed(1)} min`);
    expect(minutes).toMatchInlineSnapshot(`
      [
        "blade at 35: 5.7 min",
        "ranged at 35: 5.8 min",
        "caster at 35: 5.8 min",
        "blade at 32: 5.7 min",
        "ranged at 32: 5.4 min",
        "caster at 32: 5.8 min",
      ]
    `);
  });
});
