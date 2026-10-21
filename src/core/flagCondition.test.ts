import { describe, expect, it } from 'vitest';
import { conditionKeys, flagConditionHolds } from './flagCondition';

const state = (flags: Record<string, unknown>) => ({ getFlag: (k: string) => flags[k] });

describe('flagConditionHolds', () => {
  it('an empty condition always holds', () => {
    expect(flagConditionHolds({}, state({}))).toBe(true);
    expect(flagConditionHolds({ any: [] }, state({}))).toBe(true);
  });
  it('all needs every flag truthy', () => {
    expect(flagConditionHolds({ all: ['a', 'b'] }, state({ a: true, b: 1 }))).toBe(true);
    expect(flagConditionHolds({ all: ['a', 'b'] }, state({ a: true }))).toBe(false);
  });
  it('any needs one truthy flag', () => {
    expect(flagConditionHolds({ any: ['a', 'b'] }, state({ b: 'x' }))).toBe(true);
    expect(flagConditionHolds({ any: ['a', 'b'] }, state({ a: false, b: 0 }))).toBe(false);
  });
  it('none needs every flag falsy, and the lists combine', () => {
    expect(flagConditionHolds({ none: ['c'] }, state({}))).toBe(true);
    expect(flagConditionHolds({ all: ['a'], none: ['c'] }, state({ a: true, c: true }))).toBe(false);
  });
});

describe('conditionKeys', () => {
  it('lists each key once', () => {
    expect(conditionKeys({ all: ['a', 'b'], any: ['b', 'c'], none: ['a'] }).sort()).toEqual(['a', 'b', 'c']);
    expect(conditionKeys({})).toEqual([]);
  });
});
