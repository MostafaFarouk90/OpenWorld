import { describe, expect, it } from 'vitest';
import { AdaptiveBeatClock } from '../shrine/beat';
import { AFFIXES, AFFIX_IDS, isAffixId, pickAffix } from './affixes';
import { PATTERNS, RhythmRun, patternForTier } from './rhythm';
import { STEP, metronome } from './testkit';

/** Bar starts at step 4 for a run begun at t = 0 (one-beat count-in). */
const at = (step: number, offset = 0) => (4 + step) * STEP + offset;

describe('patterns', () => {
  it('keep strike steps at least 2 apart and inside the bar', () => {
    for (const p of Object.values(PATTERNS)) {
      expect(p.every((s) => s >= 0 && s < 16)).toBe(true);
      for (let i = 1; i < p.length; i++) expect(p[i] - p[i - 1]).toBeGreaterThanOrEqual(2);
    }
    expect(patternForTier(1)).toEqual([0, 4, 8, 12]);
    expect(patternForTier(2)).toHaveLength(5);
    expect(patternForTier(3)).toHaveLength(6);
    expect(patternForTier(9)).toBe(PATTERNS[3]);
  });
});

describe('RhythmRun', () => {
  const perfectRun = (tier: number) => {
    const run = new RhythmRun(metronome(), tier, 0);
    for (const s of run.steps) expect(run.strike(at(s))).toBe('perfect');
    return run;
  };

  it('starts one beat after a start on the beat', () => {
    expect(new RhythmRun(metronome(), 1, 0).start).toBe(4);
    expect(new RhythmRun(metronome(), 1, STEP * 5).start).toBe(12);
  });

  it('judges perfect, good and miss by the window', () => {
    const run = new RhythmRun(metronome(), 1, 0);
    expect(run.strike(at(0, 45))).toBe('perfect');
    expect(run.strike(at(4, -46))).toBe('good');
    expect(run.strike(at(8, 100))).toBe('good');
    // Step 12 is never pressed: a miss once its window closes.
    expect(run.judged(at(12, 99))).toEqual(['perfect', 'good', 'good', null]);
    expect(run.judged(at(12, 101))).toEqual(['perfect', 'good', 'good', 'miss']);
    expect(run.finished(at(12, 99))).toBe(false);
    expect(run.finished(at(12, 101))).toBe(true);
    const r = run.result(at(12, 101));
    expect(r.perfect).toBe(false);
    expect(r.strays).toBe(0);
  });

  it('a perfect run is perfect for every tier', () => {
    for (const tier of [1, 2, 3]) {
      const run = perfectRun(tier);
      const r = run.result(at(15));
      expect(r.perfect).toBe(true);
      expect(r.judged).toHaveLength(PATTERNS[tier as 1 | 2 | 3].length);
    }
  });

  it('keeps adjacent strikes apart: one press claims one step', () => {
    const run = new RhythmRun(metronome(), 3, 0); // steps 0 and 2 are adjacent
    expect(run.strike(at(0, 90))).toBe('good'); // 70 ms before step 2 would be good too, but step 0 is nearer
    expect(run.judged(at(1))).toEqual(['good', null, null, null, null, null]);
    expect(run.strike(at(2, -10))).toBe('perfect');
    // A second press at step 0 is a stray, not a second claim.
    expect(run.strike(at(0, 5))).toBe('stray');
    expect(run.strays).toBe(1);
  });

  it('counts early presses (count-in) and presses off the pattern as strays', () => {
    const run = new RhythmRun(metronome(), 1, 0);
    expect(run.strike(STEP * 2)).toBe('stray'); // count-in
    expect(run.strike(at(2))).toBe('stray'); // between 0 and 4
    for (const s of run.steps) run.strike(at(s));
    const r = run.result(at(14));
    expect(r.judged.every((j) => j === 'perfect')).toBe(true);
    expect(r.strays).toBe(2);
    expect(r.perfect).toBe(false);
  });

  it('a double strike on one step forfeits the perfect run', () => {
    const run = new RhythmRun(metronome(), 1, 0);
    run.strike(at(0));
    expect(run.strike(at(0, 20))).toBe('stray');
    for (const s of run.steps.slice(1)) run.strike(at(s));
    expect(run.result(at(14)).perfect).toBe(false);
  });

  it('is deterministic for the same presses', () => {
    const play = () => {
      const run = new RhythmRun(metronome(), 2, 0);
      return run.steps.map((s, i) => run.strike(at(s, i * 30 - 60)));
    };
    expect(play()).toEqual(play());
  });

  it('follows the music grid when it exists and re-bases when it goes', () => {
    let music: { beatSeconds: number; nextBeatTime: number } | null = { beatSeconds: 60 / 94, nextBeatTime: 1 };
    const clock = new AdaptiveBeatClock({ beat: () => music, toAudioTime: (ms) => ms / 1000, nowMs: () => 0 }, 94, 4);
    expect(clock.source()).toBe('music');
    const run = new RhythmRun(clock, 1, 1000); // grid epoch at 1 s
    const stepSec = 60 / 94 / 4;
    expect(run.start).toBe(4);
    expect(run.strike((1 + 4 * stepSec) * 1000)).toBe('perfect');
    music = null;
    expect(run.strike(5000)).toBe('rebased');
    expect(run.strays).toBe(0);
    expect(run.judged(5000).every((j) => j === null)).toBe(true);
  });

  it('reports the bar position in steps', () => {
    const run = new RhythmRun(metronome(), 1, 0);
    expect(run.position(0)).toBeCloseTo(-4);
    expect(run.position(at(3, STEP / 2 - 1))).toBeCloseTo(3.5, 1);
  });
});

describe('metronome divisions', () => {
  it('counts 16 steps to the 4-beat bar', () => {
    const c = metronome(4);
    expect(c.locate(STEP * 16).index).toBe(16);
  });
});

describe('affixes', () => {
  it('picks the same affix for the same item and level', () => {
    expect(pickAffix('ashplate', 3)).toBe(pickAffix('ashplate', 3));
    expect(isAffixId(pickAffix('x', 1))).toBe(true);
  });
  it('reaches all five affixes', () => {
    const seen = new Set<string>();
    for (const id of ['ashplate', 'practice-sword', 'brigandine', 'ashforged-fangs'])
      for (let l = 1; l <= 5; l++) seen.add(pickAffix(id, l));
    expect([...seen].sort()).toEqual([...AFFIX_IDS].sort());
  });
  it('marks only Gleam and Hearth as data-only', () => {
    expect(Object.values(AFFIXES).filter((a) => !a.wired).map((a) => a.id).sort()).toEqual(['gleam', 'hearth']);
    expect(isAffixId('nope')).toBe(false);
  });
});
