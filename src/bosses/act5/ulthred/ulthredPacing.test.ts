/**
 * D10's length (plan 1.3: the boss beat about 6 min, each later phase about 3 min more): a headless fight on the real brain and the
 * encounter's rules (nine bars, health held at each floor until its bar breaks; phase 1's poise only while the hammer is stuck,
 * heavy x 2 and light x 0.5; phase 2's bars only by a cracked anvil; phase 3's flames lifting damage; the reel after each break and
 * the 2.5 s drop, when nothing lands) against one scripted player per class. The profiles are Vey's (measured in the real game on
 * 2026-11-07: a light's raw poise about 10, a heavy chop's 7.5 to 10), at Cael 35 against Ulthred 38 (the Q3 cap) and Cael 34 /
 * Ulthred 37 (the coordinator's 33-34 Phase I finish). N12's census retunes against the real chain.
 */
import { describe, expect, it } from 'vitest';
import { barFloorHealth } from '../shared/barFloors';
import { HEAVY_POISE_SCALE, LIGHT_POISE_SCALE } from '../shared/heavyHits';
import { UlthredBrain, type UlthredHooks } from './UlthredBrain';
import { FLAMES, ULTHRED, ulthredLevel, ulthredScale } from './tuning';

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
const DEFENDING = 0.35;
/** Seconds to reach an anvil (a platform hop or a Leap) and crack it, once his health sits at the floor. */
const CRACK_SECONDS = 9;
/** Five flames (three companions, Rook, Edric): the fewest any save lights. */
const FLAMES_LIT = 5;

function fight(p: Profile): { seconds: number; phases: number[] } {
  const noop = () => {};
  const hooks: UlthredHooks = { telegraph: noop, slam: noop, sweep: noop, forgefire: noop, chains: noop, stagger: noop, kneel: noop };
  const brain = new UlthredBrain(hooks);
  brain.start();
  const level = ulthredLevel(p.level);
  const max = Math.round(ULTHRED.maxHealth * ulthredScale(level));
  let health = max;
  let poise: number = ULTHRED.maxPoise;
  let bars = 0;
  let heavyT = 0;
  let crackT = 0;
  let drop = -1;
  const phases: number[] = [];
  let phaseStart = 0;
  let phase = 1;
  for (let t = 0; t < 3600; t += TICK) {
    if (drop >= 0) {
      drop += TICK;
      if (drop >= ULTHRED.dropSeconds) {
        drop = -1;
        brain.onDropDone();
      }
      continue;
    }
    brain.tick(TICK, { dist: p.dist });
    const st = brain.state;
    if (st === 'broken' || st === 'drop') continue;
    const floor = barFloorHealth(max, ULTHRED.floors, Math.min(bars, ULTHRED.floors.length - 1));
    const k = p.uptime * (1 - DEFENDING);
    const bonus = phase === 3 ? 1 + FLAMES.bonus * FLAMES_LIT : 1;
    health = Math.max(floor || 1, health - p.dps * bonus * TICK * k);
    // The phase changes on the first hit past its threshold (the third floor sits just above it).
    const next = health / max <= ULTHRED.phases[phase - 1]! ? phase + 1 : phase;
    if (next !== phase && phase < 3) {
      phases.push(t - phaseStart);
      phaseStart = t;
      phase = next;
      brain.setPhase(phase);
      if (phase === 2) {
        brain.onDrop();
        drop = 0;
      }
      continue;
    }
    const atFloor = health <= floor + max * ULTHRED.floorMargin;
    if (phase === 2) {
      if (atFloor) crackT += TICK;
      if (crackT >= CRACK_SECONDS) {
        crackT = 0;
        bars++;
        brain.onBreak();
      }
      continue;
    }
    heavyT += TICK * k;
    let dp = p.lightPoisePerS * LIGHT_POISE_SCALE * TICK * k;
    if (heavyT >= p.heavyEvery) {
      heavyT = 0;
      dp += p.heavyPoise * HEAVY_POISE_SCALE;
    }
    // Phase 1: only a stuck hammer takes poise.
    if (phase === 1 && !brain.stuck) dp = 0;
    poise -= dp;
    if (poise <= 0 && !atFloor) poise = ULTHRED.maxPoise;
    if (poise <= 0) {
      bars++;
      poise = ULTHRED.maxPoise;
      if (bars >= 9) {
        phases.push(t - phaseStart);
        return { seconds: t, phases };
      }
      brain.onBreak();
    }
  }
  return { seconds: Infinity, phases };
}

const PROFILES: Profile[] = [
  { name: 'knight', level: 35, dps: 36, uptime: 0.5, heavyPoise: 9, heavyEvery: 3, lightPoisePerS: 8, dist: 2 },
  { name: 'warden', level: 35, dps: 33, uptime: 0.5, heavyPoise: 11, heavyEvery: 3.5, lightPoisePerS: 8, dist: 2 },
  { name: 'ashblade', level: 35, dps: 38, uptime: 0.5, heavyPoise: 8, heavyEvery: 2.5, lightPoisePerS: 10, dist: 2 },
  { name: 'pathfinder', level: 35, dps: 24, uptime: 0.8, heavyPoise: 13, heavyEvery: 4, lightPoisePerS: 6, dist: 9 },
  { name: 'emberwright', level: 35, dps: 26, uptime: 0.7, heavyPoise: 12, heavyEvery: 4, lightPoisePerS: 6, dist: 8 },
  { name: 'knight at 34', level: 34, dps: 32, uptime: 0.5, heavyPoise: 8, heavyEvery: 3, lightPoisePerS: 8, dist: 2 },
];

describe('Ulthred pacing (D10: the hall 3 to 7 min, each later phase 2 to 4 min, 7 to 12 min in all)', () => {
  it.each(PROFILES.map((p) => [p.name, p] as const))('%s reaches the Heartshard with each phase in its band', (_n, p) => {
    const r = fight(p);
    expect(r.phases).toHaveLength(3);
    expect(r.phases[0]).toBeGreaterThan(180);
    expect(r.phases[0]).toBeLessThan(420);
    for (const s of r.phases.slice(1)) {
      expect(s).toBeGreaterThan(120);
      expect(s).toBeLessThan(240);
    }
    expect(r.seconds).toBeGreaterThan(7 * 60);
    expect(r.seconds).toBeLessThan(12 * 60);
  });

  it('readings for N12', () => {
    const m = (s: number) => (s / 60).toFixed(1);
    expect(PROFILES.map((p) => fight(p)).map((r, i) => `${PROFILES[i]!.name}: ${r.phases.map(m).join(' + ')} = ${m(r.seconds)} min`)).toMatchInlineSnapshot(`
      [
        "knight: 4.5 + 2.9 + 2.8 = 10.1 min",
        "warden: 3.4 + 3.1 + 3.2 = 9.7 min",
        "ashblade: 5.9 + 2.7 + 2.6 = 11.3 min",
        "pathfinder: 3.2 + 2.7 + 2.3 = 8.2 min",
        "emberwright: 3.2 + 2.8 + 2.6 = 8.7 min",
        "knight at 34: 5.1 + 3.0 + 2.9 = 11.0 min",
      ]
    `);
  });
});
