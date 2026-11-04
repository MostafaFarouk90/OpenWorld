import { describe, expect, it } from 'vitest';
import { MurkjawBrain, type MurkjawHooks } from './MurkjawBrain';
import { CYCLE, MURKJAW, type MurkjawAttack } from './tuning';

const TICK = 1 / 60;

function rig(rng: () => number = () => 0.5) {
  const log: string[] = [];
  let next = 0;
  const hooks: MurkjawHooks = {
    pickPoint: (a) => {
      log.push(`pick:${a}`);
      return next++ % 6;
    },
    bulge: (p, a, s, lead) => log.push(`bulge:${p}:${a}:${s}:${lead}`),
    aim: (s) => log.push(`aim:${s}`),
    strike: (a, s) => log.push(`strike:${a}:${s}`),
    beach: () => log.push('beach'),
    slide: () => log.push('slide'),
    sink: () => log.push('sink'),
    submerged: () => log.push('submerged'),
    cancelTelegraph: (s) => log.push(`cancel:${s}`),
    broken: () => log.push('broken'),
    restorePoise: () => log.push('poise'),
  };
  const brain = new MurkjawBrain(hooks, rng);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) brain.tick(TICK);
  };
  const until = (cond: () => boolean, max = 60) => {
    for (let i = 0; i < max / TICK && !cond(); i++) brain.tick(TICK);
    return cond();
  };
  const attacks = () => log.filter((l) => l.startsWith('strike:')).map((l) => l.split(':')[1] as MurkjawAttack);
  return { brain, log, run, until, attacks };
}

describe('MurkjawBrain', () => {
  it('idles until started, then submerges', () => {
    const { brain, run } = rig();
    run(5);
    expect(brain.state).toBe('idle');
    brain.start();
    expect(brain.state).toBe('submerged');
    expect(brain.exposed).toBe(false);
  });

  it('every attack is telegraphed by a 1.0 s bulge, and the bite and lunge aim 0.25 s before the strike', () => {
    const { brain, log, until } = rig();
    brain.start();
    expect(until(() => brain.state === 'bulge')).toBe(true);
    const bulge = log.find((l) => l.startsWith('bulge:'))!;
    expect(bulge.endsWith(`:${CYCLE.bulgeSeconds}`)).toBe(true);
    let t = 0;
    while (brain.state === 'bulge') {
      brain.tick(TICK);
      t += TICK;
    }
    expect(t).toBeCloseTo(CYCLE.bulgeSeconds, 1);
    expect(brain.state).toBe('strike');
    const attack = brain.attack;
    if (attack !== 'wave') expect(log.some((l) => l.startsWith('aim:'))).toBe(true);
    else expect(log.some((l) => l.startsWith('aim:'))).toBe(false);
  });

  it('phase 1 strikes at least one lunge in every three attacks, for any shuffle', () => {
    for (const r of [0, 0.2, 0.5, 0.8, 0.999]) {
      let seed = r;
      const { brain, until, attacks } = rig(() => (seed = (seed * 9301 + 0.49297) % 1));
      brain.start();
      until(() => attacks().length >= 15, 400);
      const a = attacks();
      for (let i = 0; i + 2 < a.length; i++) expect(a.slice(i, i + 3)).toContain('lunge');
      expect(new Set(a)).toEqual(new Set(['bite', 'wave', 'lunge']));
    }
  });

  it('a lunge beaches him for 2.5 s with his jaw on the walkway, then he slides back and sinks', () => {
    const { brain, log, until, run } = rig(() => 0.99);
    brain.start();
    expect(until(() => brain.state === 'beached', 120)).toBe(true);
    expect(brain.jawOnWalkway).toBe(true);
    expect(brain.exposed).toBe(true);
    expect(log).toContain('beach');
    run(CYCLE.beachedSeconds - 0.05);
    expect(brain.state).toBe('beached');
    run(0.1);
    expect(brain.state).toBe('sliding');
    expect(brain.jawOnWalkway).toBe(false);
    run(CYCLE.slideSeconds + 0.05);
    expect(brain.state).toBe('sinking');
    run(CYCLE.sinkSeconds + 0.05);
    expect(brain.state).toBe('submerged');
    expect(brain.exposed).toBe(false);
  });

  it('a bite leaves him up for the phase surfaced time; a wave strike is not exposed', () => {
    const { brain, until } = rig();
    brain.start();
    expect(until(() => brain.state === 'strike' && brain.attack === 'wave', 200)).toBe(true);
    expect(brain.exposed).toBe(false);
    expect(until(() => brain.state === 'strike' && brain.attack === 'bite', 200)).toBe(true);
    expect(brain.exposed).toBe(true);
    expect(until(() => brain.state === 'surfaced')).toBe(true);
    let t = 0;
    while (brain.state === 'surfaced') {
      brain.tick(TICK);
      t += TICK;
    }
    expect(t).toBeCloseTo(CYCLE.surfacedSeconds[0], 1);
  });

  it('a break beaches him stunned for breakSeconds from any live state, cancelling a bulge', () => {
    const { brain, log, until, run } = rig();
    brain.start();
    expect(until(() => brain.state === 'bulge')).toBe(true);
    expect(brain.onBreak()).toBe(true);
    expect(log.some((l) => l.startsWith('cancel:'))).toBe(true);
    expect(brain.state).toBe('broken');
    expect(brain.jawOnWalkway).toBe(true);
    run(MURKJAW.breakSeconds - 0.05);
    expect(brain.state).toBe('broken');
    run(0.1);
    expect(log).toContain('poise');
    expect(brain.state).toBe('sliding');
  });

  it('a break while idle or dying changes nothing', () => {
    const { brain } = rig();
    expect(brain.onBreak()).toBe(false);
    brain.start();
    brain.onDefeated();
    expect(brain.onBreak()).toBe(false);
    expect(brain.state).toBe('dying');
  });

  it('phase 2 adds a second lunge to the bag; phase 3 chains a bite from the wave spot', () => {
    const { brain, log, until, attacks } = rig(() => 0.3);
    brain.start();
    brain.onPhase(3);
    expect(brain.phase).toBe(3);
    expect(until(() => attacks().includes('wave'), 200)).toBe(true);
    const i = attacks().indexOf('wave');
    expect(until(() => attacks().length > i + 1, 30)).toBe(true);
    expect(attacks()[i + 1]).toBe('bite');
    // The chained bite does not pick a new point: nothing is picked between the wave's strike and the bite's.
    const seq = log.filter((l) => l.startsWith('strike:') || l.startsWith('pick:'));
    const w = seq.findIndex((l) => l.startsWith('strike:wave'));
    expect(seq[w + 1]?.startsWith('strike:bite')).toBe(true);
    // Phase 3 submerged time is shorter.
    expect(CYCLE.submergedSeconds[2]).toBeLessThan(CYCLE.submergedSeconds[0]);
  });

  it('phases never regress; onDefeated cancels a bulge and stops everything; bad dt is ignored', () => {
    const { brain, log, until, run } = rig();
    brain.start();
    brain.onPhase(2);
    brain.onPhase(1);
    expect(brain.phase).toBe(2);
    brain.tick(NaN);
    brain.tick(-1);
    expect(until(() => brain.state === 'bulge')).toBe(true);
    brain.onDefeated();
    expect(log.filter((l) => l.startsWith('cancel:'))).toHaveLength(1);
    const n = log.length;
    run(20);
    expect(log.length).toBe(n);
    expect(brain.exposed).toBe(false);
  });

  it('phase 2 brings more lunges: the bag holds two of four', () => {
    const count = (phase: number) => {
      const r = rig(() => 0.3);
      r.brain.start();
      if (phase > 1) r.brain.onPhase(phase);
      expect(r.until(() => r.attacks().length >= 24, 600)).toBe(true);
      return r.attacks().slice(0, 24).filter((a) => a === 'lunge').length;
    };
    const p1 = count(1);
    const p2 = count(2);
    expect(p1).toBeGreaterThanOrEqual(8);
    expect(p2).toBeGreaterThanOrEqual(12);
    expect(p2).toBeGreaterThan(p1);
  });
});
