import { describe, expect, it } from 'vitest';
import { SkarlBrain, type SkarlHooks } from './SkarlBrain';
import { LEVER, SKARL } from './tuning';

/**
 * The D06 boss beat is 360 s (plans/embers-act-3.md 7.1): a headless fight on the real brain and the encounter's rules (three
 * phases of one break, each phase held until its break, the 8 % floor, x1.25 while he kneels, poise regen after 4 s without a
 * hit, the lever's 20 s wait) against scripted players at the expected level (27). The players' numbers are readings
 * (plans/act3-K8-pr2.md 3.3): how much they deal a second while in reach, the share of the time a kiting crossbowman is in
 * their reach, the share spent defending (`DEFENDING`), and the walk to the lever. Poise follows damage at `poisePerDamage`. K16 retunes against its real chain.
 */
interface Profile {
  name: string;
  dps: number;
  /** Share of the time he is in reach (a blade chases a kiting duellist; a bow or spell reaches him most of the time). */
  uptime: number;
  /** Seconds to reach the lever when a break is wanted (0: never uses it, poise only). */
  leverWalk: number;
  poisePerDamage: number;
}

const TICK = 1 / 60;
/** Share of the fight spent defending, not attacking: holding a block for each bolt (one every 2.2 s), dodging the drake's dives. */
const DEFENDING = 0.35;

function fight(p: Profile): number {
  let poise: number = SKARL.maxPoise;
  const hooks: SkarlHooks = {
    telegraph: () => {},
    cancelTelegraph: () => {},
    loose: () => {},
    kick: () => {},
    broken: () => {},
    restorePoise: () => (poise = SKARL.maxPoise),
  };
  const brain = new SkarlBrain(hooks);
  brain.start();
  const max = SKARL.maxHealth;
  let health: number = max;
  let phase = 1;
  let breaks = 0;
  let idle = 0;
  let lever = 0;
  let walk = 0;
  let window = -1;
  for (let t = 0; t < 1800; t += TICK) {
    brain.tick(TICK, { dist: 14, onPostLane: false });
    lever = Math.max(0, lever - TICK);
    const kneeling = brain.state === 'broken';
    if (window >= 0) {
      // The player lets the Spare window lapse, then finishes him.
      window += TICK;
      if (window < SKARL.releaseWindowSeconds) continue;
      if (window - TICK < SKARL.releaseWindowSeconds) brain.onReleaseWindow(false);
    }
    const breakWanted = breaks < phase && p.leverWalk > 0 && !kneeling && window < 0;
    if (breakWanted && lever <= 0) {
      walk += TICK;
      if (walk >= p.leverWalk) {
        walk = 0;
        lever = LEVER.cooldown;
        poise = 0;
      }
    }
    const walking = walk > 0;
    let dealt = walking ? 0 : p.dps * TICK * (kneeling ? SKARL.brokenScale : p.uptime * (1 - DEFENDING));
    // Phase holds and the floor.
    const hold = breaks < 1 ? max * SKARL.phases[0] : breaks < 2 ? max * SKARL.phases[1] : breaks < 3 ? max * SKARL.healthFloor : 0;
    dealt = Math.min(dealt, Math.max(0, health - Math.floor(hold) - (hold > 0 ? 1 : 0)));
    health -= dealt;
    if (dealt > 0 && !kneeling) {
      poise -= dealt * p.poisePerDamage;
      idle = 0;
    } else idle += TICK;
    if (idle >= SKARL.poiseRegenDelay) poise = SKARL.maxPoise;
    if (poise <= 0 && !kneeling && window < 0) {
      breaks++;
      brain.onBreak();
      poise = SKARL.maxPoise;
      if (breaks >= 3) {
        window = 0;
        brain.onReleaseWindow(true);
      }
    }
    if (phase === 1 && health < max * SKARL.phases[0]) (phase = 2), brain.onPhase(2);
    if (phase === 2 && health < max * SKARL.phases[1]) (phase = 3), brain.onPhase(3);
    if (health <= 0) return t;
  }
  return Infinity;
}

const PROFILES: Profile[] = [
  { name: 'blade using the lever', dps: 24, uptime: 0.4, leverWalk: 6, poisePerDamage: 0.35 },
  { name: 'ranged using the lever', dps: 15, uptime: 0.75, leverWalk: 8, poisePerDamage: 0.25 },
  { name: 'caster using the lever', dps: 17, uptime: 0.65, leverWalk: 8, poisePerDamage: 0.2 },
];

describe('Skarl pacing (the 360 s D06 boss beat)', () => {
  it.each(PROFILES.map((p) => [p.name, p] as const))('%s finishes him in 4 to 8 minutes', (_n, p) => {
    const t = fight(p);
    expect(t).toBeGreaterThan(240);
    expect(t).toBeLessThan(480);
  });

  it('a blade that never touches the lever still finishes inside 10 minutes (poise breaks count)', () => {
    expect(fight({ name: 'blade, poise only', dps: 24, uptime: 0.4, leverWalk: 0, poisePerDamage: 0.35 })).toBeLessThan(600);
  });

  it('readings for K16', () => {
    const minutes = PROFILES.map((p) => `${p.name}: ${(fight(p) / 60).toFixed(1)} min`);
    expect(minutes).toEqual(['blade using the lever: 5.2 min', 'ranged using the lever: 4.6 min', 'caster using the lever: 4.7 min']);
  });
});
