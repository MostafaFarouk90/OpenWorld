import { describe, expect, it } from 'vitest';
import { VeyBrain, type VeyHooks } from './VeyBrain';
import { COMBO, RHYTHM, SHOCKWAVE, SURGE } from './tuning';

function recorder(parryThird = false) {
  const log: string[] = [];
  const hooks: VeyHooks = {
    telegraph: (m, _s, lead) => void log.push(`tell:${m.attackId}:${lead}`),
    strike: (i) => (log.push(`strike:${i}`), parryThird && i === COMBO.parryIndex),
    shockwave: () => void log.push('shock'),
    shockTick: () => {},
    surgeRoar: () => void log.push('roar'),
    surgeBurst: () => void log.push('burst'),
    stagger: () => void log.push('stagger'),
    window: () => void log.push('window'),
    rise: () => void log.push('rise'),
    restorePoise: () => void log.push('poise'),
  };
  return { log, brain: new VeyBrain(hooks) };
}
const run = (b: VeyBrain, s: number, dist = 2) => {
  for (let i = 0; i < Math.round(s * 60); i++) b.tick(1 / 60, { dist });
};

describe('VeyBrain', () => {
  it('a combo is three hits, each after a 0.5 s glow; the third ends in a recover', () => {
    const { log, brain } = recorder();
    brain.start();
    run(brain, RHYTHM.first + 3 * (0.5 + COMBO.between) + 0.1);
    expect(log.filter((l) => l.startsWith('tell:vey.combo')).map((l) => l.split(':')[2])).toEqual(['0.5', '0.5', '0.5']);
    expect(log.filter((l) => l.startsWith('strike'))).toEqual(['strike:0', 'strike:1', 'strike:2']);
    expect(brain.state).toBe('recover');
  });
  it('a parried third hit leaves him open, then he fights on', () => {
    const { brain } = recorder(true);
    brain.start();
    run(brain, RHYTHM.first + 3 * (0.5 + COMBO.between) + 0.05);
    expect(brain.state).toBe('parried');
    run(brain, COMBO.parriedSeconds + 0.05);
    expect(brain.state).toBe('idle');
  });
  it('the third attack is a shockwave with a 1.0 s ring; standing off also draws one', () => {
    const { log, brain } = recorder();
    brain.start();
    run(brain, 12);
    expect(log.some((l) => l === `tell:${SHOCKWAVE.attackId}:1`)).toBe(true);
    const far = recorder();
    far.brain.start();
    run(far.brain, SHOCKWAVE.standOffSeconds + 0.5, 9);
    expect(far.log).toContain(`tell:${SHOCKWAVE.attackId}:1`);
  });
  it('a break staggers him, then the surge (roar, tell, 6 m burst) and 3 s of faster combos', () => {
    const { log, brain } = recorder();
    brain.start();
    run(brain, 0.5);
    brain.onBreak(false);
    expect(brain.state).toBe('broken');
    run(brain, RHYTHM.breakSeconds + 0.02);
    expect(brain.state).toBe('roar');
    expect(brain.invulnerable).toBe(true);
    run(brain, SURGE.roarSeconds + SURGE.windup + 0.05);
    expect(log).toContain('burst');
    expect(brain.fastLeft).toBeGreaterThan(2.5);
  });
  it('the last break opens the window (no surge); a lapsed window and he rises', () => {
    const { log, brain } = recorder();
    brain.start();
    brain.onBreak(true);
    brain.onReleaseWindow(true);
    expect(brain.state).toBe('window');
    run(brain, 6);
    expect(log).not.toContain('roar');
    brain.onReleaseWindow(false);
    expect(log).toContain('rise');
    expect(brain.state).toBe('idle');
  });
  it('edge: an outcome is terminal; ticks and breaks after it do nothing', () => {
    const { log, brain } = recorder();
    brain.start();
    brain.onOutcome('spared');
    const n = log.length;
    brain.onBreak(false);
    run(brain, 3);
    expect(brain.state).toBe('spared');
    expect(log.length).toBe(n);
  });
});
