import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { CINDERFORD_CLEANSED_FLAG, CINDERFORD_SEALED_FLAG, DEN_SLAIN_FLAG, DEN_SPARED_FLAG, PASTURE_REDUCED_FLAG } from './flags';
import { syncDerivedFlags, watchChoices } from './readers';

function setup() {
  const fc = createFakeCore();
  const off = watchChoices(fc.ctx);
  const get = (k: string) => fc.ctx.state.getBool(k);
  return { fc, off, get };
}

describe('the choice readers', () => {
  it('R05: fox reduces the pasture, anything else does not', () => {
    const { fc, get } = setup();
    expect(get(PASTURE_REDUCED_FLAG)).toBe(false);
    fc.ctx.state.setFlag('story.r05.choice', 'fox');
    expect(get(PASTURE_REDUCED_FLAG)).toBe(true);
    fc.ctx.state.setFlag('story.r05.choice', 'foxes');
    expect(get(PASTURE_REDUCED_FLAG)).toBe(false);
  });

  it('R06: sealed and cleansed are exclusive, unset derives nothing, an unknown value derives nothing', () => {
    const { fc, get } = setup();
    fc.ctx.state.setFlag('story.r06.choice', 'sealed');
    expect([get(CINDERFORD_SEALED_FLAG), get(CINDERFORD_CLEANSED_FLAG)]).toEqual([true, false]);
    fc.ctx.state.setFlag('story.r06.choice', 'cleansed');
    expect([get(CINDERFORD_SEALED_FLAG), get(CINDERFORD_CLEANSED_FLAG)]).toEqual([false, true]);
    fc.ctx.state.setFlag('story.r06.choice', 'burned');
    expect([get(CINDERFORD_SEALED_FLAG), get(CINDERFORD_CLEANSED_FLAG)]).toEqual([false, false]);
  });

  it('R11: spared and slain', () => {
    const { fc, get } = setup();
    fc.ctx.state.setFlag('story.r11.choice', 'spared');
    expect([get(DEN_SPARED_FLAG), get(DEN_SLAIN_FLAG)]).toEqual([true, false]);
    fc.ctx.state.setFlag('story.r11.choice', 'slain');
    expect([get(DEN_SPARED_FLAG), get(DEN_SLAIN_FLAG)]).toEqual([false, true]);
  });

  it('derives from flags already set at setup, and re-derives on a load (set and clear)', () => {
    const fc = createFakeCore();
    fc.flags.set('story.r06.choice', 'sealed');
    watchChoices(fc.ctx);
    expect(fc.ctx.state.getBool(CINDERFORD_SEALED_FLAG)).toBe(true);
    fc.flags.clear();
    fc.flags.set('story.r11.choice', 'spared');
    fc.fire('save.loaded');
    expect(fc.ctx.state.getBool(CINDERFORD_SEALED_FLAG)).toBe(false);
    expect(fc.ctx.state.getBool(DEN_SPARED_FLAG)).toBe(true);
  });

  it('stops reacting after the remover runs', () => {
    const { fc, off, get } = setup();
    off();
    fc.ctx.state.setFlag('story.r05.choice', 'fox');
    expect(get(PASTURE_REDUCED_FLAG)).toBe(false);
  });

  it('syncDerivedFlags reports only what it changed', () => {
    const flags = new Map<string, unknown>([['story.r05.choice', 'fox']]);
    const store = { getFlag: (k: string) => flags.get(k), getBool: (k: string) => flags.get(k) === true, setFlag: (k: string, v: boolean) => void flags.set(k, v) };
    expect(syncDerivedFlags(store)).toEqual([PASTURE_REDUCED_FLAG]);
    expect(syncDerivedFlags(store)).toEqual([]);
  });
});
