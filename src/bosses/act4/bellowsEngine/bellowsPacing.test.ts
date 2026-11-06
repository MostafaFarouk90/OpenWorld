import { describe, expect, it } from 'vitest';
import { BellowsBrain, type BellowsHooks } from './BellowsBrain';
import { BELLOWS, VENT } from './tuning';

/**
 * The boss beat is about 6 min (the Act 3 standard, plans/embers-act-3.md 7.1): a headless fight on the real brain and the
 * encounter's rules (three phases of one bar each, the bar breaks only at the live valve, each phase held above its threshold
 * until its bar, the 8 % floor, x 1.5 while vented, immune while sealed for the volleys) against scripted players at 31. The
 * players' numbers are readings (the Skarl profiles a little up for Act 4 gear): how much they deal a second while in reach, the
 * share of the time the engine is in their reach, the walk to the live valve, and where they stand (a blade close in, a bow at
 * jet range). L13 retunes against its real chain.
 */
interface Profile {
  name: string;
  dps: number;
  uptime: number;
  /** Seconds to reach the live valve. */
  valveWalk: number;
  /** Where they stand (metres from the engine's centre), for the brain's attack choice. */
  dist: number;
}

const TICK = 1 / 60;
/** Share of the time spent defending (blocking punches, dodging the jet and the coal rings). */
const DEFENDING = 0.35;

function fight(p: Profile): number {
  const noop = () => {};
  const hooks: BellowsHooks = {
    telegraph: noop,
    cancelTelegraph: noop,
    punch: noop,
    jetStart: noop,
    jetTick: noop,
    jetEnd: noop,
    coal: noop,
    ventStart: noop,
    ventEnd: noop,
    sealStart: noop,
    sealEnd: noop,
  };
  const brain = new BellowsBrain(hooks);
  brain.start();
  const max = BELLOWS.maxHealth;
  let health = max;
  let phase = 1;
  const broken = [false, false, false];
  let walk = 0;
  for (let t = 0; t < 1800; t += TICK) {
    brain.tick(TICK, { dist: p.dist });
    // The player walks to the live valve whenever this phase's bar is whole and the engine can take it.
    if (!broken[phase - 1] && brain.canBreak) {
      walk += TICK;
      if (walk >= p.valveWalk) {
        walk = 0;
        broken[phase - 1] = true;
        brain.onBreak();
      }
      continue;
    }
    if (brain.sealed) continue;
    let dealt = p.dps * TICK * p.uptime * (1 - DEFENDING) * (brain.vented ? VENT.damageScale : 1);
    let hold = 0;
    let k = phase;
    while (k <= 3 && broken[k - 1]) k++;
    if (k <= 3) hold = BELLOWS.phases[k - 1] !== undefined ? Math.floor(max * BELLOWS.phases[k - 1]) + 1 : Math.ceil(max * BELLOWS.healthFloor);
    dealt = Math.min(dealt, Math.max(0, health - hold));
    health -= dealt;
    if (phase === 1 && health <= max * BELLOWS.phases[0]) (phase = 2), brain.onPhase(2);
    if (phase === 2 && health <= max * BELLOWS.phases[1]) (phase = 3), brain.onPhase(3);
    if (health <= 0) return t;
  }
  return Infinity;
}

const PROFILES: Profile[] = [
  { name: 'blade', dps: 27, uptime: 0.5, valveWalk: 7, dist: 4 },
  { name: 'ranged', dps: 17, uptime: 0.8, valveWalk: 9, dist: 14 },
  { name: 'caster', dps: 19, uptime: 0.7, valveWalk: 9, dist: 10 },
];

describe('Bellows-Engine pacing (the 6 min boss beat)', () => {
  it.each(PROFILES.map((p) => [p.name, p] as const))('%s finishes it in 4 to 7 minutes', (_n, p) => {
    const t = fight(p);
    expect(t).toBeGreaterThan(240);
    expect(t).toBeLessThan(420);
  });

  it('readings for L13', () => {
    const minutes = PROFILES.map((p) => `${p.name}: ${(fight(p) / 60).toFixed(1)} min`);
    expect(minutes).toMatchInlineSnapshot(`
      [
        "blade: 4.5 min",
        "ranged: 4.6 min",
        "caster: 4.7 min",
      ]
    `);
  });
});
