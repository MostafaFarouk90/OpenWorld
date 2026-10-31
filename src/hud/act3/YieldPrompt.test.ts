import { describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import { Trials, TRIAL_TUNING } from '../../companions/trials';
import { GameEvents } from '../../core/events';
import { StubDocument, textOf } from '../dom';
import { YIELD_HOLD_SECONDS, YieldPrompt, type YieldTrials } from './YieldPrompt';

const DT = 1 / 60;

/** The real Trials class with a player and one opponent; `breaks(n)` scores n breaks for the player. */
function realTrials() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const opp = actors.spawn({ kind: 'ysmeryth-test', team: 'hostile', maxHealth: 120, maxPoise: 45 });
  const trials = new Trials({
    events,
    actors,
    addLethalHandler: (id, fn, order) => dr.addLethalHandler(id, fn, order),
    heal: (id, n) => dr.heal(id, n),
    playerFeet: () => ({ x: 0, y: 0, z: 0 }),
  });
  const ended: string[] = [];
  events.on('trial.ended', (e) => ended.push(e.reason));
  const tick = (s: number) => {
    for (let t = 0; t < s; t += DT) trials.fixedUpdate(DT);
  };
  const breakBy = (byId: string, targetId: string) => {
    dr.stagger(targetId, byId, 1000);
    tick(TRIAL_TUNING.pauseSeconds + 0.1);
  };
  return { events, trials, player, opp, ended, tick, breakBy };
}

/** A key that the test presses and holds by hand. */
function keys() {
  const k = { down: false, pressed: false };
  return {
    k,
    press() { k.down = true; k.pressed = true; },
    hold() { k.pressed = false; },
    release() { k.down = false; k.pressed = false; },
  };
}
const make = (trials: () => YieldTrials | undefined, k = keys()) => {
  const p = new YieldPrompt(new StubDocument(), { trials, mercyDown: () => k.k.down, mercyPressed: () => k.k.pressed, glyph: () => 'T' });
  /** One fixed tick of dt, as the plugin runs it. */
  const tick = (dt = DT) => {
    p.tick(dt);
    k.hold();
  };
  const run = (s: number) => {
    for (let t = 0; t < s - 1e-9; t += DT) tick();
  };
  return { p, k, tick, run };
};
const fake = (over: Partial<{ can: boolean; id: string | null }> = {}) => {
  const f = { can: over.can ?? true, id: over.id === undefined ? 'ysmeryth-trial' : over.id, yielded: [] as string[] };
  const trials: YieldTrials = {
    canYield: () => f.can,
    state: () => (f.id ? { id: f.id } : null),
    yield: (id) => (f.yielded.push(id), true),
  };
  return { f, trials };
};

describe('YieldPrompt visibility (real Trials)', () => {
  it('is hidden with no trial, with a trial without allowYield, and before the required breaks; shown after; hides on trial.ended', () => {
    const t = realTrials();
    const { p } = make(() => t.trials);
    p.update();
    expect(p.visible).toBe(false);

    expect(t.trials.start({ id: 'plain', opponentId: t.opp.id })).toBe(true);
    p.update();
    expect(p.visible).toBe(false);
    t.trials.stop('plain');

    expect(t.trials.start({ id: 'ysmeryth-trial', opponentId: t.opp.id, breaksToWin: 5, allowYield: { afterBreaks: 2 } })).toBe(true);
    p.update();
    expect(p.visible).toBe(false);
    t.breakBy(t.player.id, t.opp.id);
    p.update();
    expect(p.visible).toBe(false);
    t.breakBy(t.opp.id, t.player.id);
    p.update();
    expect(p.visible).toBe(true);
    expect(textOf(p.element)).toContain('Hold T to yield');

    t.trials.stop('ysmeryth-trial');
    p.update();
    expect(p.visible).toBe(false);
  });

  it('a full hold yields once, through the real service, for a trial id nothing hard-codes', () => {
    const t = realTrials();
    const { p, k, tick, run } = make(() => t.trials);
    t.trials.start({ id: 'some-other-trial', opponentId: t.opp.id, breaksToWin: 5, allowYield: { afterBreaks: 1 } });
    t.breakBy(t.player.id, t.opp.id);
    k.press();
    tick();
    run(YIELD_HOLD_SECONDS + 0.2);
    expect(t.ended).toEqual(['yielded']);
    expect(t.trials.state()).toBeNull();
    p.update();
    expect(p.visible).toBe(false);
  });

  it('cannot yield before the breaks even with the key held a long time', () => {
    const t = realTrials();
    const { k, tick, run } = make(() => t.trials);
    t.trials.start({ id: 'ysmeryth-trial', opponentId: t.opp.id, breaksToWin: 5, allowYield: { afterBreaks: 2 } });
    k.press();
    tick();
    run(5);
    expect(t.ended).toEqual([]);
    expect(t.trials.state()?.id).toBe('ysmeryth-trial');
  });
});

describe('YieldPrompt hold', () => {
  it('yields once after 1.0 s held, then needs a new press', () => {
    const { f, trials } = fake();
    const { k, tick, run } = make(() => trials);
    k.press();
    tick();
    run(YIELD_HOLD_SECONDS - 2 * DT);
    expect(f.yielded).toEqual([]);
    run(3 * DT);
    expect(f.yielded).toEqual(['ysmeryth-trial']);
    run(3); // still held: no second yield without a fresh press
    expect(f.yielded).toHaveLength(1);
  });

  it('an early release resets the ring and yields nothing', () => {
    const { f, trials } = fake();
    const { p, k, tick, run } = make(() => trials);
    k.press();
    tick();
    run(0.6);
    expect(p.progress).toBeGreaterThan(0.5);
    p.update();
    expect(p.ring.style.background).toContain('deg');
    k.release();
    tick();
    expect(p.progress).toBe(0);
    k.press();
    tick();
    run(0.6);
    expect(f.yielded).toEqual([]);
  });

  it('a key already down when the prompt appears does nothing until pressed afresh', () => {
    const { f, trials } = fake({ can: false });
    const { k, tick, run } = make(() => trials);
    k.press();
    tick();
    run(0.5);
    f.can = true;
    run(2);
    expect(f.yielded).toEqual([]);
    k.release();
    tick();
    k.press();
    tick();
    run(YIELD_HOLD_SECONDS + 0.1);
    expect(f.yielded).toEqual(['ysmeryth-trial']);
  });

  it('no yield after the trial ends mid-hold, and a new trial starts the hold from zero', () => {
    const { f, trials } = fake();
    const { p, k, tick, run } = make(() => trials);
    k.press();
    tick();
    run(0.8);
    f.can = false;
    f.id = null;
    run(0.5);
    expect(f.yielded).toEqual([]);
    expect(p.progress).toBe(0);
    // A new trial opens while the key is still down: no carry-over.
    f.can = true;
    f.id = 'second';
    run(2);
    expect(f.yielded).toEqual([]);
  });

  it('survives a missing service, a throwing service, a bad dt and a throwing yield', () => {
    const { k, tick } = make(() => undefined);
    k.press();
    expect(() => tick()).not.toThrow();
    const bad = make(() => { throw new Error('x'); });
    bad.k.press();
    expect(() => bad.tick()).not.toThrow();
    bad.p.update();
    expect(bad.p.visible).toBe(false);

    const { trials } = fake();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing: YieldTrials = { ...trials, yield: () => { throw new Error('boom'); } };
    const m = make(() => throwing);
    m.k.press();
    m.tick();
    m.p.tick(NaN);
    m.p.tick(-1);
    expect(m.p.progress).toBeLessThan(0.1);
    m.p.tick(YIELD_HOLD_SECONDS);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
