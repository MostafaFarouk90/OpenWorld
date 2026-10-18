import { describe, it, expect } from 'vitest';
import { evalCondition } from './conditions';
import type { ConditionEnv } from './ports';
import type { FavourBand, FavourTrack, FlagValue, QuestState, Condition } from './types';

function band(n: number): FavourBand {
  return n >= 70 ? 'hearthsworn' : n >= 50 ? 'sworn' : n >= 25 ? 'warm' : 'cold';
}

function makeEnv(opts: {
  flags?: Record<string, FlagValue>; favour?: number; quests?: Record<string, QuestState>; done?: string[];
} = {}) {
  const warns: string[] = [];
  const env: ConditionEnv = {
    state: {
      getFlag: (k) => opts.flags?.[k],
      setFlag() {}, clearFlag() {},
      favour: () => opts.favour ?? 0,
      favourBand: () => band(opts.favour ?? 0),
      addFavour: () => 0,
    },
    quests: {
      state: (id) => opts.quests?.[id] ?? 'inactive',
      objectiveDone: (q, o) => (opts.done ?? []).includes(`${q}/${o}`),
    },
    warn: (m) => warns.push(m),
  };
  return { env, warns };
}

describe('evalCondition', () => {
  it('undefined is true', () => expect(evalCondition(undefined, makeEnv().env)).toBe(true));

  it('flag truthy / equals / unset', () => {
    const { env } = makeEnv({ flags: { a: true, b: 0, c: 'x', d: 3 } });
    expect(evalCondition({ flag: 'a' }, env)).toBe(true);
    expect(evalCondition({ flag: 'b' }, env)).toBe(false);
    expect(evalCondition({ flag: 'c' }, env)).toBe(true);
    expect(evalCondition({ flag: 'zz' }, env)).toBe(false);
    expect(evalCondition({ flag: 'd', equals: 3 }, env)).toBe(true);
    expect(evalCondition({ flag: 'd', equals: 4 }, env)).toBe(false);
    expect(evalCondition({ flag: 'b', equals: 0 }, env)).toBe(true);
    expect(evalCondition({ flag: 'zz', equals: false }, env)).toBe(false);
  });

  it.each([
    [24, 'cold', 'warm'], [25, 'warm', 'cold'], [49, 'warm', 'sworn'],
    [50, 'sworn', 'warm'], [69, 'sworn', 'hearthsworn'], [70, 'hearthsworn', 'sworn'],
  ] as const)('band edge at %i is %s not %s', (n, yes, no) => {
    const { env } = makeEnv({ favour: n });
    const t: FavourTrack = 'halvard';
    expect(evalCondition({ favour: t, band: yes }, env)).toBe(true);
    expect(evalCondition({ favour: t, band: no }, env)).toBe(false);
    expect(evalCondition({ favour: t, band: [no, yes] }, env)).toBe(true);
    expect(evalCondition({ favour: t, band: [no] }, env)).toBe(false);
  });

  it('favour atLeast / below / combined', () => {
    const { env } = makeEnv({ favour: 30 });
    expect(evalCondition({ favour: 'oswin', atLeast: 30 }, env)).toBe(true);
    expect(evalCondition({ favour: 'oswin', atLeast: 31 }, env)).toBe(false);
    expect(evalCondition({ favour: 'oswin', below: 31 }, env)).toBe(true);
    expect(evalCondition({ favour: 'oswin', below: 30 }, env)).toBe(false);
    expect(evalCondition({ favour: 'oswin', band: 'warm', atLeast: 25, below: 40 }, env)).toBe(true);
    expect(evalCondition({ favour: 'oswin', band: 'cold', atLeast: 25 }, env)).toBe(false);
  });

  it('quest state single and array, unknown reads inactive', () => {
    const { env } = makeEnv({ quests: { q: 'active' } });
    expect(evalCondition({ quest: 'q', state: 'active' }, env)).toBe(true);
    expect(evalCondition({ quest: 'q', state: 'completed' }, env)).toBe(false);
    expect(evalCondition({ quest: 'q', state: ['completed', 'active'] }, env)).toBe(true);
    expect(evalCondition({ quest: 'nope', state: 'inactive' }, env)).toBe(true);
  });

  it('objective done true and false', () => {
    const { env } = makeEnv({ done: ['q/a'] });
    expect(evalCondition({ objective: ['q', 'a'], done: true }, env)).toBe(true);
    expect(evalCondition({ objective: ['q', 'a'], done: false }, env)).toBe(false);
    expect(evalCondition({ objective: ['q', 'b'], done: false }, env)).toBe(true);
    expect(evalCondition({ objective: ['q', 'b'], done: true }, env)).toBe(false);
  });

  it('all / any / not and empties, nested', () => {
    const { env } = makeEnv({ flags: { a: true } });
    const T: Condition = { flag: 'a' };
    const F: Condition = { flag: 'b' };
    expect(evalCondition({ all: [] }, env)).toBe(true);
    expect(evalCondition({ any: [] }, env)).toBe(false);
    expect(evalCondition({ all: [T, F] }, env)).toBe(false);
    expect(evalCondition({ all: [T, T] }, env)).toBe(true);
    expect(evalCondition({ any: [F, T] }, env)).toBe(true);
    expect(evalCondition({ any: [F, F] }, env)).toBe(false);
    expect(evalCondition({ not: F }, env)).toBe(true);
    expect(evalCondition({ not: T }, env)).toBe(false);
    expect(evalCondition({ all: [{ any: [F, { not: F }] }, { not: { all: [T, F] } }] }, env)).toBe(true);
  });

  it('unknown shape warns and is false; not of it is still false', () => {
    const { env, warns } = makeEnv();
    expect(evalCondition({ bogus: 1 } as unknown as Condition, env)).toBe(false);
    expect(warns.length).toBe(1);
    expect(evalCondition({ not: { bogus: 1 } } as unknown as Condition, env)).toBe(false);
    expect(evalCondition({ not: 5 } as unknown as Condition, env)).toBe(false);
  });

  it('a throwing read warns once and is false; not stays false', () => {
    const { env, warns } = makeEnv();
    env.state.getFlag = () => { throw new Error('boom'); };
    expect(evalCondition({ flag: 'x' }, env)).toBe(false);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('boom');
    expect(evalCondition({ not: { flag: 'x' } }, env)).toBe(false);
    expect(evalCondition({ all: [{ flag: 'x' }, { all: [] }] }, env)).toBe(false);
    expect(evalCondition({ any: [{ flag: 'x' }, { all: [] }] }, env)).toBe(true);
    expect(evalCondition({ any: [{ flag: 'x' }] }, env)).toBe(false);
  });

  it('works without a warn callback', () => {
    const { env } = makeEnv();
    delete env.warn;
    expect(evalCondition({ bogus: 1 } as unknown as Condition, env)).toBe(false);
  });
});
