import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { HALL_HOSTILE_FLAG, MARKET_COMPROMISE_FLAG, MARKET_MINERS_FLAG, MARKET_MINER_GUARD_FLAG, MARKET_STEWARD_GUARD_FLAG } from './flags';
import { syncDerivedFlags, watchChoices } from './readers';

function setup() {
  const fc = createFakeCore();
  const off = watchChoices(fc.ctx);
  const get = (k: string) => fc.ctx.state.getBool(k);
  const market = () => [get(MARKET_MINERS_FLAG), get(MARKET_COMPROMISE_FLAG), get(MARKET_MINER_GUARD_FLAG), get(MARKET_STEWARD_GUARD_FLAG)];
  return { fc, off, get, market };
}

describe('the R10 market reader', () => {
  it('lets the stewards guard the market until R10 settles (nothing set)', () => {
    const { market } = setup();
    expect(market()).toEqual([false, false, false, true]);
  });

  it('miners: miners guard alone', () => {
    const { fc, market } = setup();
    fc.ctx.state.setFlag('story.r10.choice', 'miners');
    expect(market()).toEqual([true, false, true, false]);
  });

  it('stewards: stewards guard alone', () => {
    const { fc, market } = setup();
    fc.ctx.state.setFlag('story.r10.choice', 'stewards');
    expect(market()).toEqual([false, false, false, true]);
  });

  it('compromise: both stand on the market', () => {
    const { fc, market } = setup();
    fc.ctx.state.setFlag('story.r10.choice', 'compromise');
    expect(market()).toEqual([false, true, true, true]);
  });

  it('an unknown value, a number or a boolean derives the default and never throws', () => {
    const { fc, market } = setup();
    for (const junk of ['Miners', 'miners ', '', 'none', 7, true]) {
      fc.ctx.state.setFlag('story.r10.choice', junk as never);
      expect(market(), String(junk)).toEqual([false, false, false, true]);
    }
  });

  it('flips back when the choice changes', () => {
    const { fc, market } = setup();
    fc.ctx.state.setFlag('story.r10.choice', 'miners');
    fc.ctx.state.setFlag('story.r10.choice', 'compromise');
    expect(market()).toEqual([false, true, true, true]);
  });
});

describe('the M21 hall reader', () => {
  it('turns hostile on confront', () => {
    const { fc, get } = setup();
    expect(get(HALL_HOSTILE_FLAG)).toBe(false);
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    expect(get(HALL_HOSTILE_FLAG)).toBe(true);
  });

  it('stays peaceful on spy, an unknown value, or a confront that A13\'s persuasion pass skipped', () => {
    const { fc, get } = setup();
    fc.ctx.state.setFlag('story.m21.choice', 'spy');
    expect(get(HALL_HOSTILE_FLAG)).toBe(false);
    fc.ctx.state.setFlag('story.m21.choice', 'argue');
    expect(get(HALL_HOSTILE_FLAG)).toBe(false);
    fc.ctx.state.setFlag('story.m21.persuaded', true);
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    expect(get(HALL_HOSTILE_FLAG)).toBe(false);
  });

  it('re-derives when persuaded is written after the choice, and when it is cleared', () => {
    const { fc, get } = setup();
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    expect(get(HALL_HOSTILE_FLAG)).toBe(true);
    fc.ctx.state.setFlag('story.m21.persuaded', true);
    expect(get(HALL_HOSTILE_FLAG)).toBe(false);
    fc.ctx.state.setFlag('story.m21.persuaded', false);
    expect(get(HALL_HOSTILE_FLAG)).toBe(true);
  });
});

describe('re-derivation', () => {
  it('syncs at setup from flags already set', () => {
    const fc = createFakeCore();
    fc.ctx.state.setFlag('story.r10.choice', 'miners');
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    watchChoices(fc.ctx);
    expect(fc.ctx.state.getBool(MARKET_MINER_GUARD_FLAG)).toBe(true);
    expect(fc.ctx.state.getBool(HALL_HOSTILE_FLAG)).toBe(true);
  });

  it('clears a stale derived flag on save.loaded (a load replaces the flags wholesale), and a new game clears it too', () => {
    const { fc, get } = setup();
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    fc.ctx.state.setFlag('story.r10.choice', 'miners');
    expect(get(HALL_HOSTILE_FLAG)).toBe(true);
    fc.flags.clear();
    fc.fire('save.loaded');
    expect([get(HALL_HOSTILE_FLAG), get(MARKET_MINER_GUARD_FLAG), get(MARKET_STEWARD_GUARD_FLAG)]).toEqual([false, false, true]);
  });

  it('changes nothing when every flag already matches, and reports what it changed otherwise', () => {
    const { fc } = setup();
    const store = fc.ctx.state;
    expect(syncDerivedFlags(store)).toEqual([]);
    store.setFlag('story.m21.choice', 'confront');
    store.setFlag(HALL_HOSTILE_FLAG, false);
    expect(syncDerivedFlags(store)).toEqual([HALL_HOSTILE_FLAG]);
  });

  it('stops watching once removed', () => {
    const { fc, off, get } = setup();
    off();
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    expect(get(HALL_HOSTILE_FLAG)).toBe(false);
  });
});
