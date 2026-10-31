import { describe, expect, it } from 'vitest';
import { MurkjawBrain, type MurkjawHooks } from './MurkjawBrain';
import { MURKJAW, SPEARS } from './tuning';

/**
 * The D05 boss beat is 360 s (plans/embers-act-3.md 7.1): a headless fight on the real brain and the encounter's rules (three
 * phases of one break, the 8 % floor and the phase 2 hold, poise regen after 4 s exposed without a hit, the x1.5 jaw, spears)
 * against two scripted players at the expected level. The players' numbers are readings (plans/act3-K8.md section 4): a blade
 * deals about 22 a second while it is on the jaw (x1.25 there), a ranged kit about 14 a second while he is up; poise follows damage. K16
 * retunes against its real chain.
 */
interface Profile {
  name: string;
  /** Damage a second on a target in reach. */
  dps: number;
  /** Share of the reachable time the player is actually hitting (walking to the beach, aiming, dodging). */
  uptime: number;
  /** Hits reach him only with the jaw on a walkway (a blade) or whenever he is up (ranged). */
  melee: boolean;
  /** Fetches a spear from a rack every this many seconds and throws it the next time he is up (0: never). */
  spearEvery: number;
}

const TICK = 1 / 60;

function fight(p: Profile, seed: number): number {
  let s = seed;
  const rng = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  let poise: number = MURKJAW.maxPoise;
  const hooks: MurkjawHooks = {
    pickPoint: () => Math.floor(rng() * 6),
    bulge: () => {},
    aim: () => {},
    strike: () => {},
    beach: () => {},
    slide: () => {},
    sink: () => {},
    submerged: () => {},
    cancelTelegraph: () => {},
    broken: () => {},
    restorePoise: () => (poise = MURKJAW.maxPoise),
  };
  const brain = new MurkjawBrain(hooks, rng);
  brain.start();
  const max = MURKJAW.maxHealth;
  let health: number = max;
  let phase = 1;
  let breaks = 0;
  let phase1Break = false;
  let phase2Break = false;
  let idle = 0;
  let spear = 0;
  let spearClock = 0;
  for (let t = 0; t < 1800; t += TICK) {
    brain.tick(TICK);
    if (p.spearEvery > 0) {
      spearClock += TICK;
      if (spearClock >= p.spearEvery && spear === 0) {
        spearClock = 0;
        spear = 1;
      }
    }
    let dmg = 0;
    let pz = 0;
    const scale = brain.jawOnWalkway ? MURKJAW.jawScale : 1;
    if (brain.exposed && (p.melee ? brain.jawOnWalkway : true)) {
      dmg += p.dps * p.uptime * TICK * scale;
      pz += p.dps * p.uptime * TICK * scale;
    }
    if (spear > 0 && brain.exposed) {
      spear = 0;
      dmg += SPEARS.damage * scale;
      pz += SPEARS.poise * scale;
    }
    if (dmg > 0) idle = 0;
    else if (brain.exposed) idle += TICK;
    if (idle >= MURKJAW.poiseRegenDelay && brain.state !== 'broken') poise = MURKJAW.maxPoise;
    // The floor (the encounter's rule): 8 % until the last break; above phase 2 until a phase 1 break, above phase 3 until a
    // phase 2 break.
    let min = breaks >= 3 ? 0 : Math.ceil(max * MURKJAW.healthFloor);
    if (!phase1Break) min = Math.max(min, Math.floor(max * MURKJAW.phases[0]) + 1);
    else if (!phase2Break) min = Math.max(min, Math.floor(max * MURKJAW.phases[1]) + 1);
    health = Math.max(Math.min(health, min), health - dmg);
    if (health <= 0) return t;
    while (phase < 3 && health <= max * MURKJAW.phases[phase - 1]) {
      phase++;
      brain.onPhase(phase);
    }
    if (poise > 0 && pz > 0 && brain.exposed) {
      poise = Math.max(0, poise - pz);
      if (poise === 0 && brain.state !== 'broken') {
        breaks++;
        if (phase === 1) phase1Break = true;
        if (phase === 2) phase2Break = true;
        brain.onBreak();
      }
    }
  }
  return Infinity;
}

const PLAYERS: Profile[] = [
  { name: 'blade (Knight, Warden): beached jaw and spears', dps: 22, uptime: 0.6, melee: true, spearEvery: 12 },
  { name: 'ranged (Pathfinder, Emberwright): bolts while he is up, no spears', dps: 14, uptime: 0.7, melee: false, spearEvery: 0 },
];
/** A blade that never touches a rack: slower, but it still finishes (the spears are the intended help, not a requirement). */
const NO_SPEARS: Profile = { name: 'blade without spears (the worst case)', dps: 22, uptime: 0.6, melee: true, spearEvery: 0 };

describe('Murkjaw pacing (D05 boss beat, target 360 s)', () => {
  it.each(PLAYERS)('$name finishes in 4 to 8 minutes', (p) => {
    const runs = [1, 2, 3, 4, 5].map((seed) => fight(p, seed));
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    // The reading K16 retunes against (reported to the Act 3 plan thread).
    console.info(`[murkjaw pacing] ${p.name}: ${(mean / 60).toFixed(1)} min (${runs.map((r) => Math.round(r)).join(', ')} s)`);
    expect(mean).toBeGreaterThan(240);
    expect(mean).toBeLessThan(480);
  });

  it('a blade that ignores the spears still finishes inside 10 minutes', () => {
    const runs = [1, 2, 3, 4, 5].map((seed) => fight(NO_SPEARS, seed));
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    console.info(`[murkjaw pacing] ${NO_SPEARS.name}: ${(mean / 60).toFixed(1)} min (${runs.map((r) => Math.round(r)).join(', ')} s)`);
    expect(mean).toBeLessThan(600);
  });
});
