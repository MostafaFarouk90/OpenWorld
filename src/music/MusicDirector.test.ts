import { describe, expect, it, vi } from 'vitest';
import { BarClock } from './barClock';
import { musicConfig } from './musicConfig';
import { MusicDirector } from './MusicDirector';
import { BARLEY_AND_BRAZIER as TRACK, loopSeconds } from './tracks';
import { isCombatHit } from './hostileSet';

const LOOP = loopSeconds(TRACK, 48000); // 41.739 s
const BAR = LOOP / 16;
const NEAR = (): number => 10;

function setup(opts: { startAt?: number; random?: () => number } = {}) {
  const calls: Array<{ mix: Readonly<Record<string, number>>; ramp?: number }> = [];
  const driver = { setMix: vi.fn((mix: Readonly<Record<string, number>>, ramp?: number) => void calls.push({ mix, ramp })) };
  const director = new MusicDirector({ track: TRACK, driver, random: opts.random ?? (() => 0.5) });
  const t0 = opts.startAt ?? 0;
  director.start(new BarClock(t0, LOOP, 16), t0);
  /** Advance the audio clock in 1/60 s ticks to `until`. */
  let now = t0;
  const run = (until: number, dist: (id: string) => number | undefined = NEAR): void => {
    while (now < until - 1e-9) {
      now = Math.min(until, now + 1 / 60);
      director.update(now, dist);
    }
  };
  const mixNames = (): string[] =>
    calls.map((c) => (Object.entries(TRACK.mixes).find(([, m]) => m === c.mix)?.[0] ?? '?'));
  return { director, driver, calls, run, mixNames, now: () => now };
}

describe('MusicDirector basics', () => {
  it('starts in explore and issues no setMix until something changes', () => {
    const t = setup();
    t.run(5);
    expect(t.director.state).toBe('explore');
    expect(t.driver.setMix).not.toHaveBeenCalled();
    expect(t.director.currentMix()).toBe(TRACK.mixes.explore);
  });

  it('uses the 0.4 s ramp on every change and never a rate argument', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.onCalm('w1', t.now());
    t.run(10);
    expect(t.calls.length).toBeGreaterThanOrEqual(2);
    for (const c of t.calls) expect(c.ramp).toBe(0.4);
    expect(t.driver.setMix.mock.calls.every((a) => a.length === 2)).toBe(true);
  });

  it('records state before start() and issues no setMix, then starts with the right mix', () => {
    const driver = { setMix: vi.fn() };
    const d = new MusicDirector({ track: TRACK, driver });
    d.onAggro('w1');
    d.duck('dialogue:x', true);
    d.update(5, NEAR);
    d.requestDiscover();
    expect(driver.setMix).not.toHaveBeenCalled();
    expect(d.started).toBe(false);
    expect(d.currentMix()).toBe(TRACK.mixes.talk);
    d.start(new BarClock(5, LOOP, 16), 5);
    d.start(new BarClock(9, LOOP, 16), 9); // second start ignored
    d.update(5.1, NEAR);
    expect(driver.setMix).not.toHaveBeenCalled(); // the mixer was started with currentMix()
    d.duck('dialogue:x', false);
    d.update(5.2, NEAR);
    expect(d.state).toBe('combat');
    expect(driver.setMix).toHaveBeenCalledTimes(1);
  });

  it('ignores NaN, infinite and backwards time', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.update(NaN, NEAR);
    t.director.update(Infinity, NEAR);
    expect(t.director.state).toBe('explore');
    t.director.update(10, NEAR);
    expect(t.director.state).toBe('combat');
    t.director.update(5, NEAR);
    expect(t.director.state).toBe('combat');
  });

  it('survives setMix throwing and stops after dispose', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = {
      setMix: vi.fn(() => {
        throw new Error('disposed');
      }),
    };
    const d = new MusicDirector({ track: TRACK, driver });
    d.start(new BarClock(0, LOOP, 16), 0);
    d.onAggro('w1');
    expect(() => d.update(1, NEAR)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    d.dispose();
    d.onAggro('w2');
    d.update(2, NEAR);
    expect(driver.setMix).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('combat enter and exit', () => {
  it('enters combat when an aggroed hostile is within 20 m', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(0.1, () => 19.9);
    expect(t.director.state).toBe('combat');
    expect(t.mixNames()).toEqual(['combat']);
  });

  it('does not enter while the aggroed hostile is beyond 20 m, and enters when it closes', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(2, () => 35);
    expect(t.director.state).toBe('explore');
    t.run(3, () => 20);
    expect(t.director.state).toBe('combat');
  });

  it('holds combat while the hostile set is non-empty, however long the fight lasts', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(60, () => 15);
    expect(t.director.state).toBe('combat');
  });

  it('ignores a hostile with unknown distance when entering, and counts it while holding', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1, () => undefined);
    expect(t.director.state).toBe('explore');
    t.director.onAggro('w2');
    t.run(2, (id) => (id === 'w2' ? 5 : undefined));
    expect(t.director.state).toBe('combat');
    t.run(30, () => undefined); // distances lost: still held by the set
    expect(t.director.state).toBe('combat');
  });

  it('a hostile beyond the leash radius no longer holds combat', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1, () => 10);
    t.run(20, () => 60);
    expect(t.director.state).toBe('explore');
  });

  it('exits 6 s after the set empties, not before', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(2);
    t.director.onCalm('w1', t.now());
    const emptied = t.now();
    t.run(emptied + 5.9);
    expect(t.director.state).toBe('combat');
    t.run(emptied + 6.1);
    expect(t.director.state).toBe('explore');
  });

  it('combat entered and left within the hysteresis window never drops to explore', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.onCalm('w1', t.now());
    t.run(t.now() + 3);
    t.director.onAggro('w1'); // re-aggro inside the window
    t.run(t.now() + 3);
    t.director.onCalm('w1', t.now());
    t.run(t.now() + 5);
    expect(t.director.state).toBe('combat');
    expect(t.mixNames()).toEqual(['combat']); // one change only
  });

  it('a hit on the player restarts the 6 s timer', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.onCalm('w1', t.now());
    t.run(t.now() + 5);
    t.director.onCombatHit(t.now());
    const hitAt = t.now();
    t.run(hitAt + 5.5);
    expect(t.director.state).toBe('combat');
    t.run(hitAt + 6.2);
    expect(t.director.state).toBe('explore');
  });

  it('a combat hit alone (no aggro event) enters combat and leaves 6 s later', () => {
    const t = setup();
    t.director.onCombatHit(t.now());
    t.run(1);
    expect(t.director.state).toBe('combat');
    t.run(7.2);
    expect(t.director.state).toBe('explore');
  });

  it('died and despawned actors leave the set through onCalm; unknown ids are harmless', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.onAggro('w2');
    t.run(1);
    t.director.onCalm('w1', t.now());
    t.director.onCalm('ghost', t.now());
    expect(t.director.hostileCount).toBe(1);
    t.run(20);
    expect(t.director.state).toBe('combat');
  });
});

describe('mercy', () => {
  it('the last hostile mercied mid-combat plays ending for 4 s, then explore', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(3);
    t.director.onMercy('w1', t.now());
    const at = t.now();
    t.run(at + 0.1);
    expect(t.director.state).toBe('ending');
    t.run(at + 3.9);
    expect(t.director.state).toBe('ending');
    t.run(at + 4.2);
    expect(t.director.state).toBe('explore');
    expect(t.mixNames()).toEqual(['combat', 'ending', 'explore']);
  });

  it('one of two hostiles mercied keeps combat', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.onAggro('w2');
    t.run(2);
    t.director.onMercy('w1', t.now());
    t.run(20);
    expect(t.director.state).toBe('combat');
  });

  it('mercy of a creature that was not hostile does nothing', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.onMercy('stranger', t.now());
    expect(t.director.state).toBe('combat');
  });

  it('mercy.revoked alone does not re-add a creature; a fresh aggro does', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.onMercy('w1', t.now());
    t.run(t.now() + 10);
    expect(t.director.state).toBe('explore');
    expect(t.director.hostileCount).toBe(0);
    t.director.onAggro('w1');
    t.run(t.now() + 0.2);
    expect(t.director.state).toBe('combat');
  });

  it('new aggro during the mercy ending returns to combat', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.onMercy('w1', t.now());
    t.run(t.now() + 1);
    t.director.onAggro('w2');
    t.run(t.now() + 0.2);
    expect(t.director.state).toBe('combat');
  });

  it('a mercy that empties the set while a recent hit is pending still resolves with ending', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.onCombatHit(0.5);
    t.run(1);
    t.director.onMercy('w1', t.now());
    t.run(t.now() + 0.2);
    expect(t.director.state).toBe('ending');
  });
});

describe('boss and ending', () => {
  it('boss mix on, ignores combat exit, then ending for 6 s and explore', () => {
    const t = setup();
    t.director.setBoss(true, t.now());
    t.director.setBoss(true, t.now()); // idempotent
    t.director.onAggro('b');
    t.run(1);
    expect(t.director.state).toBe('boss');
    t.director.onCalm('b', t.now());
    t.run(20);
    expect(t.director.state).toBe('boss');
    t.director.setBoss(false, t.now());
    const at = t.now();
    t.run(at + 0.2);
    expect(t.director.state).toBe('ending');
    t.run(at + 5.9);
    expect(t.director.state).toBe('ending');
    t.run(at + 6.3);
    expect(t.director.state).toBe('explore');
    expect(t.mixNames()).toEqual(['boss', 'ending', 'explore']);
  });

  it('setBoss(false) when not in a boss fight is a no-op', () => {
    const t = setup();
    t.director.setBoss(false, 0);
    t.run(1);
    expect(t.director.state).toBe('explore');
  });

  it('discover requests are dropped during boss, combat and ending', () => {
    const t = setup();
    t.director.setBoss(true, 0);
    t.director.requestDiscover();
    t.director.setBoss(false, 0);
    t.director.requestDiscover();
    t.run(10);
    expect(t.mixNames()).toEqual(['ending', 'explore']);
  });
});

describe('discover (A/B bar scheduling)', () => {
  it('within 4 bars of the half boundary it starts there and ends on the next half boundary', () => {
    const t = setup();
    t.run(5 * BAR); // bar position 5: the half boundary (8) is 3 bars away
    t.director.requestDiscover();
    t.run(7.9 * BAR);
    expect(t.director.state).toBe('explore');
    t.run(8.1 * BAR);
    expect(t.director.state).toBe('discover');
    t.run(15.9 * BAR);
    expect(t.director.state).toBe('discover');
    t.run(16.1 * BAR);
    expect(t.director.state).toBe('explore');
    expect(t.mixNames()).toEqual(['discover', 'explore']);
  });

  it('more than 4 bars from the half boundary it starts on the next bar line and ends on the following half boundary', () => {
    const t = setup();
    t.run(2.5 * BAR); // half boundary is 5.5 bars away
    t.director.requestDiscover();
    t.run(2.9 * BAR);
    expect(t.director.state).toBe('explore');
    t.run(3.1 * BAR);
    expect(t.director.state).toBe('discover');
    t.run(7.9 * BAR);
    expect(t.director.state).toBe('discover');
    t.run(8.1 * BAR);
    expect(t.director.state).toBe('explore');
  });

  it('near the loop end the half boundary wraps to the loop start', () => {
    const t = setup();
    t.run(14 * BAR);
    t.director.requestDiscover();
    t.run(16.1 * BAR);
    expect(t.director.state).toBe('discover');
    t.run(24.1 * BAR);
    expect(t.director.state).toBe('explore');
  });

  it('two discover requests in a row play one phrase', () => {
    const t = setup();
    t.run(5 * BAR);
    t.director.requestDiscover();
    t.director.requestDiscover();
    t.run(8.2 * BAR);
    t.director.requestDiscover(); // during the phrase
    t.run(30 * BAR);
    expect(t.mixNames()).toEqual(['discover', 'explore']);
  });

  it('combat during the phrase cancels it', () => {
    const t = setup();
    t.run(5 * BAR);
    t.director.requestDiscover();
    t.run(9 * BAR);
    t.director.onAggro('w1');
    t.run(9.2 * BAR);
    expect(t.director.state).toBe('combat');
    t.director.onCalm('w1', t.now());
    t.run(30 * BAR);
    expect(t.mixNames()).toEqual(['discover', 'combat', 'explore']);
  });

  it('a discover requested during combat is dropped, not replayed afterwards', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.run(1);
    t.director.requestDiscover();
    t.director.onCalm('w1', t.now());
    t.run(60);
    expect(t.mixNames()).toEqual(['combat', 'explore']);
  });

  it('a discover requested during a duck waits, then plays after the duck lifts', () => {
    const t = setup();
    t.director.duck('dialogue:a', true);
    t.run(5 * BAR);
    t.director.requestDiscover();
    t.run(20 * BAR);
    expect(t.director.mixKey).toBe('talk');
    expect(t.mixNames()).toEqual(['talk']);
    t.director.duck('dialogue:a', false);
    t.run(t.now() + 3 * BAR);
    t.run(t.now() + 17 * BAR);
    expect(t.mixNames()).toContain('discover');
    expect(t.director.state).toBe('explore');
  });

  it('requests before start() are ignored', () => {
    const d = new MusicDirector({ track: TRACK, driver: { setMix: vi.fn() } });
    d.requestDiscover();
    d.start(new BarClock(0, LOOP, 16), 0);
    d.update(30 * BAR, NEAR);
    expect(d.state).toBe('explore');
  });
});

describe('silence', () => {
  it('starts after two uninterrupted explore loops, lasts 45-90 s, then returns', () => {
    const t = setup({ random: () => 0 });
    t.run(2 * LOOP - 1);
    expect(t.director.state).toBe('explore');
    t.run(2 * LOOP + 0.1);
    expect(t.director.state).toBe('silence');
    const at = t.now();
    t.run(at + 44.5);
    expect(t.director.state).toBe('silence');
    t.run(at + 45.2);
    expect(t.director.state).toBe('explore');
    expect(t.mixNames()).toEqual(['silence', 'explore']);
  });

  it('the silence length is drawn from [45, 90]', () => {
    const t = setup({ random: () => 0.999 });
    t.run(2 * LOOP + 0.1);
    const at = t.now();
    t.run(at + 89);
    expect(t.director.state).toBe('silence');
    t.run(at + 91);
    expect(t.director.state).toBe('explore');
  });

  it('combat ends silence at once', () => {
    const t = setup();
    t.run(2 * LOOP + 0.1);
    expect(t.director.state).toBe('silence');
    t.director.onAggro('w1');
    t.run(t.now() + 0.2);
    expect(t.director.state).toBe('combat');
  });

  it('a duck resets the explore-loop count so silence never starts during or right after dialogue', () => {
    const t = setup();
    t.run(1.9 * LOOP);
    t.director.duck('dialogue:a', true);
    t.run(2.5 * LOOP);
    expect(t.director.state).toBe('explore');
    t.director.duck('dialogue:a', false);
    t.run(t.now() + 1.9 * LOOP);
    expect(t.director.state).toBe('explore');
    t.run(t.now() + 0.2 * LOOP);
    expect(t.director.state).toBe('silence');
  });

  it('a scheduled discover prevents silence from starting', () => {
    const t = setup();
    t.run(2 * LOOP - 0.05);
    t.director.requestDiscover();
    t.run(2 * LOOP + 0.5);
    expect(t.director.state).not.toBe('silence');
  });
});

describe('talk overlay (ducks)', () => {
  it('dialogue and cutscene ducks apply the talk mix and return to the underlying state', () => {
    const t = setup();
    t.director.duck('dialogue:x', true);
    t.run(1);
    expect(t.director.mixKey).toBe('talk');
    t.director.duck('dialogue:x', false);
    t.run(2);
    expect(t.director.mixKey).toBe('explore');
    expect(t.mixNames()).toEqual(['talk', 'explore']);
  });

  it('nested reasons hold until the last is released', () => {
    const t = setup();
    t.director.duck('dialogue:x', true);
    t.director.duck('cutscene:y', true);
    t.director.duck('dialogue:x', false);
    t.run(1);
    expect(t.director.mixKey).toBe('talk');
    t.director.duck('cutscene:y', false);
    t.run(2);
    expect(t.director.mixKey).toBe('explore');
  });

  it('releasing a reason that was never set is a no-op; setting twice needs one release', () => {
    const t = setup();
    t.director.duck('ghost', false);
    t.director.duck('a', true);
    t.director.duck('a', true);
    t.director.duck('a', false);
    t.run(1);
    expect(t.director.mixKey).toBe('explore');
  });

  it('combat starting during talk keeps the talk mix until the duck ends, then plays combat', () => {
    const t = setup();
    t.director.duck('dialogue:x', true);
    t.run(1);
    t.director.onAggro('w1');
    t.run(2);
    expect(t.director.state).toBe('combat');
    expect(t.director.mixKey).toBe('talk');
    expect(t.mixNames()).toEqual(['talk']);
    t.director.duck('dialogue:x', false);
    t.run(3);
    expect(t.mixNames()).toEqual(['talk', 'combat']);
  });

  it('a duck that lifts and re-applies within one tick issues no setMix', () => {
    const t = setup();
    t.director.duck('a', true);
    t.director.duck('a', false);
    t.run(1);
    expect(t.driver.setMix).not.toHaveBeenCalled();
  });
});

describe('simultaneous changes and reset', () => {
  it('two causes in one tick produce one setMix with the highest-precedence state', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.setBoss(true, 0);
    t.director.requestDiscover();
    t.run(0.1);
    expect(t.driver.setMix).toHaveBeenCalledTimes(1);
    expect(t.mixNames()).toEqual(['boss']);
  });

  it('combat and a duck in the same tick give one setMix with the talk mix', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.duck('cutscene:z', true);
    t.run(0.1);
    expect(t.mixNames()).toEqual(['talk']);
  });

  it('reset clears the hostile set, ducks, boss, ending and queued discover (save.loaded, respawn)', () => {
    const t = setup();
    t.director.onAggro('w1');
    t.director.duck('dialogue:x', true);
    t.run(1);
    t.director.requestDiscover();
    t.director.reset(t.now());
    expect(t.director.hostileCount).toBe(0);
    t.run(t.now() + 10);
    expect(t.director.state).toBe('explore');
    expect(t.director.mixKey).toBe('explore');
    expect(t.mixNames()).toEqual(['talk', 'explore']);
  });

  it('reset during a boss fight returns to explore without an ending', () => {
    const t = setup();
    t.director.setBoss(true, 0);
    t.run(1);
    t.director.reset(t.now());
    t.run(t.now() + 1);
    expect(t.director.state).toBe('explore');
  });
});

describe('isCombatHit', () => {
  it('counts melee and spell between hostiles and the player only', () => {
    expect(isCombatHit('melee', 'hostile', 'player')).toBe('hostile-hit-player');
    expect(isCombatHit('spell', 'hostile', 'player')).toBe('hostile-hit-player');
    expect(isCombatHit('melee', 'player', 'hostile')).toBe('player-hit-hostile');
  });

  it('ignores falls, script damage, dummies, neutral targets and unknown teams', () => {
    expect(isCombatHit('fall', 'hostile', 'player')).toBeNull();
    expect(isCombatHit('script', 'player', 'hostile')).toBeNull();
    expect(isCombatHit('melee', 'player', 'neutral')).toBeNull();
    expect(isCombatHit('melee', 'neutral', 'player')).toBeNull();
    expect(isCombatHit('melee', 'ally', 'hostile')).toBeNull();
    expect(isCombatHit('melee', undefined, 'player')).toBeNull();
    expect(isCombatHit('melee', 'hostile', undefined)).toBeNull();
  });
});

describe('config', () => {
  it('matches design 6.1', () => {
    expect(musicConfig.aggroRadius).toBe(20);
    expect(musicConfig.exitHysteresis).toBe(6);
    expect(musicConfig.endingSeconds).toBe(6);
    expect(musicConfig.mercyEndingSeconds).toBe(4);
  });
});
