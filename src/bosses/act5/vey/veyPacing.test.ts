import { describe, expect, it } from 'vitest';
import { barFloorHealth } from '../shared/barFloors';
import { HEAVY_POISE_SCALE, LIGHT_POISE_SCALE } from '../shared/heavyHits';
import { VeyBrain, type VeyHooks } from './VeyBrain';
import { VEY, veyScale } from './tuning';

/**
 * The boss beat is about 6 min (plan 1.3, 360 s): a headless fight on the real brain and the encounter's rules (four bars, each
 * holding his health at its floor until it breaks; heavy hits x 2 poise, light x 0.5; the stagger and the surge after each break,
 * when nothing lands; the Spare window at the fourth) against one scripted player per class. The numbers are readings (Act 4's
 * profiles a step up for tier 4 to 5 gear at 35 to 38): damage a second while in reach, the share of the time in reach, the heavy
 * hit's raw poise and how often it comes, the light hits' raw poise a second. Raw poise is the swing's raw damage (DamageBridge): the
 * real-game run (2026-11-07, Knight 38) read 10 for a light and 7.5 for a heavy chop on a limb, so heavies sit near 9 and the others
 * are scaled to match. N12's census retunes against the real chain.
 */
interface Profile {
  name: string;
  level: number;
  dps: number;
  uptime: number;
  heavyPoise: number;
  heavyEvery: number;
  lightPoisePerS: number;
  dist: number;
}

const TICK = 1 / 60;
/** Share of the time spent defending (blocking or dodging the combo, the ring and the surge). */
const DEFENDING = 0.35;

function fight(p: Profile): { seconds: number; breaks: number } {
  const noop = () => {};
  const hooks: VeyHooks = {
    telegraph: noop,
    strike: () => false,
    shockwave: noop,
    shockTick: noop,
    surgeRoar: noop,
    surgeBurst: noop,
    stagger: noop,
    window: noop,
    rise: noop,
    restorePoise: () => void (poise = VEY.maxPoise),
  };
  const brain = new VeyBrain(hooks);
  brain.start();
  const max = Math.round(VEY.maxHealth * veyScale(p.level));
  let health = max;
  let poise: number = VEY.maxPoise;
  let breaks = 0;
  let heavyT = 0;
  for (let t = 0; t < 1800; t += TICK) {
    brain.tick(TICK, { dist: p.dist });
    const st = brain.state;
    if (st === 'window') return { seconds: t, breaks };
    if (st === 'broken' || st === 'roar' || st === 'surgeTell') continue;
    const k = p.uptime * (1 - DEFENDING);
    health = Math.max(barFloorHealth(max, VEY.floors, breaks), health - p.dps * TICK * k);
    heavyT += TICK * k;
    let dp = p.lightPoisePerS * LIGHT_POISE_SCALE * TICK * k;
    if (heavyT >= p.heavyEvery) {
      heavyT = 0;
      dp += p.heavyPoise * HEAVY_POISE_SCALE;
    }
    // Poise only breaks once his health is held at the bar's floor (a player who breaks him early only shortens the bar's wait).
    poise -= dp;
    if (poise <= 0 && health > barFloorHealth(max, VEY.floors, breaks) + max * VEY.floorMargin) poise = VEY.maxPoise;
    if (poise <= 0) {
      breaks++;
      poise = 0;
      const last = breaks >= VEY.breaksPerPhase;
      brain.onBreak(last);
      if (last) brain.onReleaseWindow(true);
    }
  }
  return { seconds: Infinity, breaks };
}

/** One profile per class at 35 (Vey 38), and the blade at 34 (Vey 37). */
const PROFILES: Profile[] = [
  { name: 'knight', level: 38, dps: 36, uptime: 0.5, heavyPoise: 9, heavyEvery: 3, lightPoisePerS: 8, dist: 2 },
  { name: 'warden', level: 38, dps: 33, uptime: 0.5, heavyPoise: 11, heavyEvery: 3.5, lightPoisePerS: 8, dist: 2 },
  { name: 'ashblade', level: 38, dps: 38, uptime: 0.5, heavyPoise: 8, heavyEvery: 2.5, lightPoisePerS: 10, dist: 2 },
  { name: 'pathfinder', level: 38, dps: 24, uptime: 0.8, heavyPoise: 13, heavyEvery: 4, lightPoisePerS: 6, dist: 9 },
  { name: 'emberwright', level: 38, dps: 26, uptime: 0.7, heavyPoise: 12, heavyEvery: 4, lightPoisePerS: 6, dist: 8 },
  { name: 'knight at 34', level: 37, dps: 32, uptime: 0.5, heavyPoise: 8, heavyEvery: 3, lightPoisePerS: 8, dist: 2 },
];

describe('Vey pacing (the 6 min boss beat)', () => {
  it.each(PROFILES.map((p) => [p.name, p] as const))('%s brings him to the Spare window in 4.5 to 6.5 minutes', (_n, p) => {
    const r = fight(p);
    expect(r.breaks).toBe(VEY.breaksPerPhase);
    expect(r.seconds).toBeGreaterThan(270);
    expect(r.seconds).toBeLessThan(390);
  });

  it('readings for N12', () => {
    expect(PROFILES.map((p) => `${p.name}: ${(fight(p).seconds / 60).toFixed(1)} min`)).toMatchInlineSnapshot(`
      [
        "knight: 5.1 min",
        "warden: 5.5 min",
        "ashblade: 4.7 min",
        "pathfinder: 5.0 min",
        "emberwright: 5.1 min",
        "knight at 34: 5.5 min",
      ]
    `);
  });
});
