import { describe, expect, it, vi } from 'vitest';
import { AdaptiveBeatClock, type BeatClock, type BeatInfoLike } from './beat';
import { Wardstones } from './wardstones';

const BEAT = 60000 / 92;

/** A scripted clock: a grid at t = k * BEAT with switchable source and generation. */
function fakeClock(): BeatClock & { src: 'music' | 'metronome'; gen: number } {
  const c = {
    src: 'metronome' as 'music' | 'metronome',
    gen: 0,
    source: () => c.src,
    generation: () => c.gen,
    locate: (t: number) => {
      const index = Math.ceil(t / BEAT - 0.5);
      return { index, errorMs: t - index * BEAT };
    },
    passedIndex: (t: number, w: number) => Math.floor((t - w) / BEAT),
  };
  return c;
}

function make(opts: { struck?: number[]; stones?: number[] } = {}) {
  const clock = fakeClock();
  const struck = new Set(opts.struck ?? []);
  const log = { struck: [] as [number, number][], missed: [] as [number, string][], complete: 0, done: 0, sounds: [] as string[] };
  const player = { x: 0, z: 0, yaw: 0 };
  const stones = (opts.stones ?? [1, 2, 3, 4, 5]).map((i) => ({ index: i, x: (i - 1) * 100, z: -2 }));
  const w = new Wardstones({
    clock,
    stones: () => stones,
    player: () => player,
    isStruck: (i) => struck.has(i),
    setStruck: (i, on) => (on ? struck.add(i) : struck.delete(i)),
    setAllDone: () => void log.done++,
    emitStruck: (i, e) => log.struck.push([i, e]),
    emitMissed: (i, r) => log.missed.push([i, r]),
    emitComplete: () => void log.complete++,
    play: (k) => log.sounds.push(k),
  });
  const at = (stone: number) => {
    player.x = (stone - 1) * 100;
  };
  return { w, clock, struck, log, player, at };
}

/** Three on-beat strikes on the stone the player stands at. */
function phrase(t: ReturnType<typeof make>, from: number, err = 0) {
  let last = 'none';
  for (let k = 0; k < 3; k++) last = t.w.strike((from + k) * BEAT + err);
  return last;
}

describe('Wardstones', () => {
  it('completes a stone with three strikes on consecutive beats and plays the stone notes', () => {
    const t = make();
    t.at(1);
    expect(phrase(t, 10)).toBe('complete');
    expect(t.log.struck).toEqual([[1, 0]]);
    expect(t.log.sounds).toEqual(['sfx.wardstone.1', 'sfx.wardstone.1', 'sfx.wardstone.1']);
    expect(t.struck.has(1)).toBe(true);
    expect(t.log.complete).toBe(0);
  });
  it('reports the mean signed error', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT + 30);
    t.w.strike(11 * BEAT - 30);
    t.w.strike(12 * BEAT + 60);
    expect(t.log.struck[0][1]).toBeCloseTo(20);
  });
  it('a strike 120.0 ms off is a hit, 120.001 is a miss, on both sides', () => {
    const t = make();
    t.at(1);
    expect(t.w.strike(10 * BEAT + 120)).toBe('hit');
    expect(t.w.strike(11 * BEAT - 120)).toBe('hit');
    const u = make();
    u.at(1);
    expect(u.w.strike(10 * BEAT + 120.001)).toBe('miss');
    expect(u.log.missed).toEqual([[1, 'late']]);
    const v = make();
    v.at(1);
    expect(v.w.strike(10 * BEAT - 120.001)).toBe('miss');
    expect(v.log.missed).toEqual([[1, 'early']]);
    expect(v.log.sounds).toEqual(['sfx.wardstone.miss']);
  });
  it('a half-beat tie reads as late', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT + BEAT / 2);
    expect(t.log.missed).toEqual([[1, 'late']]);
  });
  it('a miss resets only that stone and keeps finished stones', () => {
    const t = make();
    t.at(1);
    phrase(t, 10);
    t.at(2);
    t.w.strike(20 * BEAT);
    t.w.strike(21 * BEAT);
    expect(t.w.progress(2)).toBe(2);
    t.w.strike(22 * BEAT + 300);
    expect(t.w.progress(2)).toBe(0);
    expect(t.struck.has(1)).toBe(true);
  });
  it('a skipped beat is a late miss on the next strike and from update()', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT);
    expect(t.w.strike(12 * BEAT)).toBe('miss');
    expect(t.log.missed).toEqual([[1, 'late']]);
    const u = make();
    u.at(1);
    u.w.strike(10 * BEAT);
    u.w.update(11 * BEAT + 119);
    expect(u.log.missed).toEqual([]);
    u.w.update(11 * BEAT + 121);
    expect(u.log.missed).toEqual([[1, 'late']]);
    expect(u.w.progress(1)).toBe(0);
    u.w.update(15 * BEAT);
    expect(u.log.missed).toHaveLength(1);
  });
  it('a second press on the same beat is ignored', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT);
    expect(t.w.strike(10 * BEAT + 10)).toBe('ignored');
    expect(t.w.progress(1)).toBe(1);
    expect(t.log.missed).toEqual([]);
  });
  it('striking out of order emits missed order and changes nothing', () => {
    const t = make();
    t.at(2);
    expect(t.w.strike(10 * BEAT)).toBe('order');
    expect(t.log.missed).toEqual([[2, 'order']]);
    expect(t.w.progress(2)).toBe(0);
    expect(t.w.nextIndex()).toBe(1);
  });
  it('a completed stone does nothing when struck again', () => {
    const t = make({ struck: [1] });
    t.at(1);
    expect(t.w.strike(10 * BEAT)).toBe('ignored');
    expect(t.log.missed).toEqual([]);
    expect(t.log.sounds).toEqual([]);
  });
  it('ignores strikes out of range or facing away', () => {
    const t = make();
    t.player.x = 50;
    expect(t.w.strike(10 * BEAT)).toBe('none');
    t.at(1);
    t.player.yaw = Math.PI; // faces +Z; the stone is at z -2
    expect(t.w.strike(10 * BEAT)).toBe('none');
    expect(t.log.sounds).toEqual([]);
  });
  it('completing the fifth stone emits wardstones.complete once and sets the done flag', () => {
    const t = make({ struck: [1, 2, 3, 4] });
    t.at(5);
    phrase(t, 10);
    expect(t.log.complete).toBe(1);
    expect(t.log.done).toBe(1);
    t.w.strike(20 * BEAT);
    expect(t.log.complete).toBe(1);
    expect(t.w.nextIndex()).toBeNull();
  });
  it('a source switch mid-phrase resets quietly and sits out one beat', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT);
    t.w.strike(11 * BEAT);
    t.clock.src = 'music';
    t.clock.gen++;
    t.w.update(11.5 * BEAT + 10);
    expect(t.w.progress(1)).toBe(0);
    expect(t.log.missed).toEqual([]);
    expect(t.w.strike(12 * BEAT)).toBe('ignored'); // the listen beat (index 12), no miss
    expect(t.log.missed).toEqual([]);
    expect(t.w.strike(13 * BEAT)).toBe('hit');
  });
  it('resets the phrase on a re-sync of the same source', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT);
    t.clock.gen++;
    t.w.update(10.4 * BEAT);
    expect(t.w.progress(1)).toBe(0);
  });
  it('reset() drops every phrase', () => {
    const t = make();
    t.at(1);
    t.w.strike(10 * BEAT);
    t.w.reset();
    expect(t.w.progress(1)).toBe(0);
  });
});

describe('AdaptiveBeatClock', () => {
  const info = (nextBeatTime: number, beatSeconds = 0.5): BeatInfoLike => ({ beatSeconds, nextBeatTime });
  function make(beat: () => BeatInfoLike | null | undefined) {
    let now = 5000;
    const clock = new AdaptiveBeatClock({ beat, toAudioTime: (ms) => ms / 1000, nowMs: () => now });
    return { clock, setNow: (n: number) => (now = n) };
  }
  it('falls back to a 92 BPM metronome when there is no beat', () => {
    const { clock } = make(() => null);
    expect(clock.source()).toBe('metronome');
    expect(clock.locate(5000 + BEAT * 3 + 40).errorMs).toBeCloseTo(40);
  });
  it('survives a throwing or missing music service', () => {
    expect(make(() => { throw new Error('boom'); }).clock.source()).toBe('metronome');
    expect(make(() => undefined).clock.source()).toBe('metronome');
  });
  it('uses the music grid when it exists and bumps the generation at each switch', () => {
    let beat: BeatInfoLike | null = null;
    const { clock } = make(() => beat);
    const g0 = clock.generation();
    beat = info(10.0);
    expect(clock.source()).toBe('music');
    const g1 = clock.generation();
    expect(g1).toBeGreaterThan(g0);
    const r = clock.locate(10_000 + 500 * 4 - 25); // audio 11.975 s, 25 ms early for beat 4
    expect(r.errorMs).toBeCloseTo(-25);
    beat = null;
    expect(clock.source()).toBe('metronome');
    expect(clock.generation()).toBeGreaterThan(g1);
  });
  it('re-bases when the tempo changes or the grid drifts', () => {
    let beat: BeatInfoLike | null = info(10.0);
    const { clock } = make(() => beat);
    clock.source();
    const g = clock.generation();
    beat = info(10.5);
    expect(clock.generation()).toBe(g);
    beat = info(10.62);
    expect(clock.generation()).toBeGreaterThan(g);
  });
  it('treats a NaN beat as no music', () => {
    expect(make(() => ({ beatSeconds: Number.NaN, nextBeatTime: 1 })).clock.source()).toBe('metronome');
  });
  it('passedIndex counts a beat only after its window closes', () => {
    const { clock } = make(() => info(10.0));
    expect(clock.passedIndex(10_000 + 119, 120)).toBe(-1);
    expect(clock.passedIndex(10_000 + 121, 120)).toBe(0);
  });
});

void vi;
