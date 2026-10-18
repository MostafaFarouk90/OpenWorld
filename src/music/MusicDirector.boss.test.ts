import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarClock } from './barClock';
import { MusicDirector } from './MusicDirector';
import { BARLEY_AND_BRAZIER as TRACK, loopSeconds, validateTrack } from './tracks';

const LOOP = loopSeconds(TRACK, 48000);

function setup() {
  const calls: Array<Readonly<Record<string, number>>> = [];
  const driver = { setMix: vi.fn((m: Readonly<Record<string, number>>) => void calls.push(m)) };
  const d = new MusicDirector({ track: TRACK, driver, random: () => 0.5 });
  d.start(new BarClock(0, LOOP, 16), 0);
  let now = 0;
  const run = (secs: number): void => {
    const end = now + secs;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 1 / 60);
      d.update(now, () => undefined);
    }
  };
  return { d, calls, run, now: () => now };
}

const PRIOR = TRACK.bossMixes!['ashen-prior'];

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('boss mixes', () => {
  it('the track with boss mixes validates, and a bad one is rejected', () => {
    expect(() => validateTrack(TRACK)).not.toThrow();
    expect(() => validateTrack({ ...TRACK, bossMixes: { x: { phases: [] } } })).toThrow(/no phases/);
    expect(() => validateTrack({ ...TRACK, bossMixes: { x: { phases: [{ ghost: 1 }] } } })).toThrow(/unknown stem/);
  });

  it('boss.started plays phase 1 of the id and keeps the identity of the plain boss mix', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    expect(t.calls.at(-1)).toBe(PRIOR.phases[0]);
    expect(PRIOR.phases[0]).toEqual(TRACK.mixes.boss);
  });

  it('a boss registered below a threshold starts in that 1-based phase', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 3, 0);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(PRIOR.phases[2]);
  });

  it('boss.phase re-ramps inside the boss state (the revision key changes)', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.run(0.1);
    const n = t.calls.length;
    t.d.bossPhase('ashen-prior', 2);
    t.run(0.1);
    expect(t.calls.length).toBe(n + 1);
    expect(t.calls.at(-1)).toBe(PRIOR.phases[1]);
    t.run(1);
    expect(t.calls.length).toBe(n + 1); // no repeat without a change
  });

  it('a phase past the table clamps to the last one, and 0 or NaN to the first', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 9, 0);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(PRIOR.phases.at(-1));
    t.d.bossPhase('ashen-prior', NaN);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(PRIOR.phases[0]);
  });

  it('an unknown boss id falls back to the generic boss mix, warning once', () => {
    const t = setup();
    t.d.bossStarted('mystery', 1, 0);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.mixes.boss);
    t.d.bossPhase('mystery', 2);
    t.run(0.1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('the Release window hushes the mix and restores it when it closes while the boss is active', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 2, 0);
    t.run(0.1);
    t.d.bossHush('ashen-prior', true);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(PRIOR.hush);
    t.d.bossHush('ashen-prior', false);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(PRIOR.phases[1]);
  });

  it('a window-closed event after the outcome does not restore the boss mix', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.d.bossHush('ashen-prior', true);
    t.run(0.1);
    t.d.bossResolved('ashen-prior', t.now()); // the registry emits the outcome first
    t.d.bossHush('ashen-prior', false); // then the window close
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    expect(t.calls.at(-1)).toBe(TRACK.mixes.ending);
  });

  it('defeated or released plays the 6 s ending, then explore', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.run(1);
    t.d.bossResolved('ashen-prior', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    t.run(5.8);
    expect(t.d.state).toBe('ending');
    t.run(0.5);
    expect(t.d.state).toBe('explore');
  });

  it('boss.ended without an outcome returns to explore with no ending', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.run(1);
    t.d.bossEnded('ashen-prior', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore');
  });

  it('two bosses at once: one ending leaves the other playing, the ending waits for the last', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.d.bossStarted('gaffer-grimtooth', 1, 0);
    t.run(1);
    t.d.bossEnded('gaffer-grimtooth', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    expect(t.calls.at(-1)).toBe(PRIOR.phases[0]);
    t.d.bossResolved('ashen-prior', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
  });

  it('an outside setBoss(false) never ends a registry boss', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.run(0.1);
    t.d.setBoss(false, t.now());
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    t.d.setBoss(false, t.now(), 'ashen-prior');
    t.run(0.1);
    expect(t.d.state).toBe('ending');
  });

  it('the legacy setBoss(true) / setBoss(false) pair still works and is idempotent', () => {
    const t = setup();
    t.d.setBoss(true, 0);
    t.d.setBoss(true, 0);
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    t.d.setBoss(false, t.now());
    t.d.setBoss(false, t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
  });

  it('a boss starting during a discover phrase or an ending cancels them', () => {
    const t = setup();
    t.d.requestDiscover();
    t.run(0.1);
    t.d.bossStarted('ashen-prior', 1, t.now());
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    t.d.bossResolved('ashen-prior', t.now());
    t.run(0.1);
    t.d.bossStarted('ashen-prior', 1, t.now());
    t.run(0.1);
    expect(t.d.state).toBe('boss');
  });

  it('reset (save.loaded) forgets bosses; events for unknown bosses are harmless', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.d.reset(t.now());
    t.d.bossPhase('nope', 2);
    t.d.bossHush('nope', true);
    t.d.bossResolved('nope', 0);
    t.d.bossEnded('nope', 0);
    t.run(0.1);
    expect(t.d.state).toBe('explore');
  });

  it('dialogue ducks win over the boss mix and return to it', () => {
    const t = setup();
    t.d.bossStarted('ashen-prior', 1, 0);
    t.run(0.1);
    t.d.duck('dialogue:x', true);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.mixes.talk);
    t.d.duck('dialogue:x', false);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(PRIOR.phases[0]);
  });
});
