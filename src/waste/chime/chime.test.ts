import { describe, expect, it } from 'vitest';
import { AdaptiveBeatClock } from '../../shrine/beat';
import { ChimePuzzle, stepMsAt, type ChimePorts } from './chimePuzzle';
import { ChimeRun } from './chimeRun';
import { CHIME_PHRASES, CHIME_TUNING as T } from './phrases';

const STEP = stepMsAt();
const metronome = () => new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => 0 }, T.bpm, T.divisions);
/** A phrase begun at t = 0 has its bar start at step 4 (one-beat count-in). */
const at = (step: number, offset = 0) => (4 + step) * STEP + offset;

describe('chime phrases', () => {
  it('are 4, 5 and 6 strikes on pillars 1 to 6 and keys 1 to 4, valid RhythmRun steps', () => {
    expect(CHIME_PHRASES.map((p) => p.steps.length)).toEqual([4, 5, 6]);
    for (const p of CHIME_PHRASES) {
      expect(p.pillars).toHaveLength(p.steps.length);
      expect(p.keys).toHaveLength(p.steps.length);
      for (const n of p.pillars) expect(n >= 1 && n <= 6).toBe(true);
      for (const k of p.keys) expect(k >= 1 && k <= 4).toBe(true);
      expect(() => new ChimeRun(metronome(), p, 0, { stepMs: STEP })).not.toThrow();
    }
  });
  it('keep the wide window under half the closest gap, so one press never claims a neighbour', () => {
    for (const p of CHIME_PHRASES) {
      const gap = Math.min(...p.steps.slice(1).map((s, i) => s - p.steps[i]!));
      expect(T.wideGoodMs).toBeLessThan((gap * STEP) / 2);
    }
  });
});

describe('ChimeRun', () => {
  const ph = CHIME_PHRASES[0]!;
  it('judges the right key on time as perfect or good', () => {
    const run = new ChimeRun(metronome(), ph, 0, { stepMs: STEP });
    expect(run.strike(at(0), ph.keys[0]!)).toBe('perfect');
    expect(run.strike(at(4, 80), ph.keys[1]!)).toBe('good');
  });
  it('counts the wrong key in the window as a miss for that step, not a stray', () => {
    const run = new ChimeRun(metronome(), ph, 0, { stepMs: STEP });
    expect(run.strike(at(8), 4)).toBe('wrong');
    expect(run.strays).toBe(0);
    expect(run.judged(at(8))[2]).toBe('miss');
    // The step is claimed: a second press on it, now with the right key, is a stray.
    expect(run.strike(at(8, 10), ph.keys[2]!)).toBe('stray');
  });
  it('counts a press off the pattern as a stray and a late press past the window as a miss', () => {
    const run = new ChimeRun(metronome(), ph, 0, { stepMs: STEP });
    expect(run.strike(at(2), 1)).toBe('stray');
    expect(run.strike(at(0, 101), ph.keys[0]!)).toBe('stray');
    expect(run.judged(at(0, 101))[0]).toBe('miss');
  });
  it('a clean run is perfect', () => {
    const run = new ChimeRun(metronome(), ph, 0, { stepMs: STEP });
    ph.steps.forEach((s, k) => run.strike(at(s), ph.keys[k]!));
    expect(run.finished(at(15))).toBe(true);
    expect(run.result(at(15)).perfect).toBe(true);
  });
});

function rig(phrase = 0, fails = 0) {
  const s = { t: 0, phrase, fails, toasts: [] as string[], solved: 0 };
  const ports: ChimePorts = {
    now: () => s.t,
    makeClock: () => new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => s.t }, T.bpm, T.divisions),
    phrase: () => s.phrase,
    setPhrase: (n) => void (s.phrase = n),
    fails: () => s.fails,
    setFails: (n) => void (s.fails = n),
    toast: (k) => void s.toasts.push(k),
    solved: () => void s.solved++,
  };
  return { s, puzzle: new ChimePuzzle(ports) };
}

/** Starts the phrase at s.t and plays it; `wrongAt` strikes that strike with a wrong key. */
function play(r: ReturnType<typeof rig>, opts: { wrongAt?: number; skip?: number } = {}) {
  const { s, puzzle } = r;
  const t0 = s.t;
  expect(puzzle.press(1, t0)).toBe('started');
  const ph = CHIME_PHRASES[s.phrase]!;
  ph.steps.forEach((st, k) => {
    if (opts.skip === k) return;
    s.t = t0 + at(st);
    const key = opts.wrongAt === k ? (ph.keys[k]! % 4) + 1 : ph.keys[k]!;
    puzzle.press(key, s.t);
  });
  s.t = t0 + at(16);
  puzzle.update(s.t);
}
/** Lets a replay finish. */
const wait = (r: ReturnType<typeof rig>) => {
  r.s.t += 21 * STEP;
  r.puzzle.update(r.s.t);
  expect(r.puzzle.replaying).toBe(false);
};

describe('ChimePuzzle', () => {
  it('three phrases struck in order light the shrine exactly once', () => {
    const r = rig();
    for (let n = 0; n < 3; n++) {
      play(r);
      expect(r.s.phrase).toBe(n + 1);
    }
    expect(r.s.solved).toBe(1);
    expect(r.puzzle.done).toBe(true);
    expect(r.puzzle.press(1)).toBe('done');
    r.puzzle.update(r.s.t + 10_000);
    expect(r.s.solved).toBe(1);
    expect(r.s.toasts.filter((k) => k === 'waste.chime.solved')).toHaveLength(1);
  });

  it('a fail replays the plaque, ignores presses while it rings, and keeps the phrase', () => {
    const r = rig();
    play(r, { wrongAt: 1 });
    expect(r.s.phrase).toBe(0);
    expect(r.s.fails).toBe(1);
    expect(r.puzzle.replaying).toBe(true);
    expect(r.s.toasts.at(-1)).toBe('waste.chime.falter');
    expect(r.puzzle.view()?.mode).toBe('replay');
    expect(r.puzzle.view()?.hum).toBe(false);
    expect(r.puzzle.press(1)).toBe('busy');
    // The replay rings the phrase's first pillar at its step.
    const g = r.puzzle.glow(r.s.t + at(0));
    expect(g[CHIME_PHRASES[0]!.pillars[0]! - 1]).toBeGreaterThan(0.5);
    wait(r);
    play(r);
    expect(r.s.phrase).toBe(1);
    expect(r.s.fails).toBe(0);
  });

  it('after two fails the plaque hums and the next run shows the lead light a beat early', () => {
    const r = rig();
    play(r, { skip: 0 });
    wait(r);
    play(r, { skip: 0 });
    expect(r.s.toasts.at(-1)).toBe('waste.chime.hum');
    expect(r.puzzle.view()?.hum).toBe(true);
    wait(r);
    const t0 = r.s.t;
    expect(r.puzzle.press(1, t0)).toBe('started');
    expect(r.puzzle.view(t0)?.lesson).toBe(true);
    const first = CHIME_PHRASES[0]!.pillars[0]! - 1;
    // A beat (four steps) before the first strike its pillar is lit; without the lesson it would not be.
    expect(r.puzzle.glow(t0 + at(-3.5))[first]).toBe(0.5);
    const plain = rig();
    plain.puzzle.press(1, 0);
    expect(plain.puzzle.glow(at(-3.5))[first]).toBe(0);
    expect(plain.puzzle.glow(at(-0.5))[first]).toBe(0.5);
  });

  it('widens after three fails and strikes the phrase for the player after five', () => {
    const r = rig(1, 3);
    expect(r.puzzle.press(1, 0)).toBe('started');
    expect(r.puzzle.view(0)?.wide).toBe(true);
    // 140 ms late is a hit in the wide window (a miss in the normal one)...
    const ph = CHIME_PHRASES[1]!;
    expect(r.puzzle.press(ph.keys[0]!, at(0, 140))).toBe('good');
    // ...and on the 2-apart pair (steps 4 and 6) a late press still claims its own step, leaving the next one free.
    expect(r.puzzle.press(ph.keys[1]!, at(4, 150))).toBe('good');
    expect(r.puzzle.press(ph.keys[2]!, at(6))).toBe('perfect');
    expect(r.puzzle.view(at(6))?.judged.slice(0, 3)).toEqual(['good', 'good', 'perfect']);
    r.puzzle.reset();
    const a = rig(1, 5);
    a.puzzle.press(1, 0);
    a.s.t = at(16);
    a.puzzle.update(a.s.t);
    expect(a.s.phrase).toBe(2);
    expect(a.s.fails).toBe(0);
    expect(a.s.toasts.at(-1)).toBe('waste.chime.assisted');
  });

  it('a load mid-phrase restarts that phrase; a load after phrase two resumes at phrase three', () => {
    const r = rig();
    play(r);
    play(r);
    expect(r.s.phrase).toBe(2);
    r.puzzle.press(1, r.s.t);
    expect(r.puzzle.running).toBe(true);
    r.puzzle.reset(); // save.loaded
    expect(r.puzzle.running).toBe(false);
    // A fresh puzzle over the same persisted counts (a new session) starts at phrase three.
    const again = rig(2, 0);
    expect(again.puzzle.press(1, 0)).toBe('started');
    expect(again.puzzle.view(0)?.phrase).toBe(2);
    expect(again.s.toasts).toEqual(['waste.chime.phrase.3']);
  });

  it('too many strays fail a phrase even when every strike lands', () => {
    const r = rig();
    const t0 = r.s.t;
    r.puzzle.press(1, t0);
    for (let i = 0; i < T.straysAllowed + 1; i++) r.puzzle.press(1, t0 + at(-3 + i * 0.5));
    const ph = CHIME_PHRASES[0]!;
    ph.steps.forEach((st, k) => r.puzzle.press(ph.keys[k]!, t0 + at(st)));
    r.puzzle.update(t0 + at(16));
    expect(r.s.fails).toBe(1);
  });
});
