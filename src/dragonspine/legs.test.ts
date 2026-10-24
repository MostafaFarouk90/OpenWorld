import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEG_TARGETS, legLengths } from './legs';
import { buildDragonspine } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { stubInputs } from './testing/fixture';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const b = buildDragonspine(stubInputs());
const legs = legLengths(b);
const within = (actual: number, target: number, pct = 0.15) => Math.abs(actual - target) <= target * pct;

describe('leg lengths (the plan\'s table, computed from the layout)', () => {
  it('computes all seven quests and prints the table', () => {
    expect(Object.keys(legs)).toEqual(Object.keys(LEG_TARGETS));
    const rows = Object.entries(legs).map(([q, l]) => `${q}: ridden ${l.ridden} m (target ${LEG_TARGETS[q]!.ridden}), foot ${l.foot} m (target ${LEG_TARGETS[q]!.foot}) - ${l.note}`);
    console.log(`Dragonspine leg lengths on the stand-in ground:\n${rows.join('\n')}`);
    for (const l of Object.values(legs)) {
      expect(l.ridden).toBeGreaterThanOrEqual(0);
      expect(l.foot).toBeGreaterThan(0);
    }
  });

  it('keeps the legs this layout owns within 15% of the plan: M28 climb, R15 haul, M29 woodpile, M30 loop, R18 climb', () => {
    expect(within(legs.M28!.foot, LEG_TARGETS.M28!.foot)).toBe(true);
    expect(within(legs.R15!.foot, LEG_TARGETS.R15!.foot), `R15 foot ${legs.R15!.foot}`).toBe(true);
    expect(within(legs.M29!.foot, LEG_TARGETS.M29!.foot), `M29 foot ${legs.M29!.foot}`).toBe(true);
    expect(within(legs.M30!.foot, LEG_TARGETS.M30!.foot), `M30 foot ${legs.M30!.foot}`).toBe(true);
    expect(within(legs.R18!.foot, LEG_TARGETS.R18!.foot), `R18 foot ${legs.R18!.foot}`).toBe(true);
    expect(within(legs.M28!.ridden, LEG_TARGETS.M28!.ridden), `M28 ridden ${legs.M28!.ridden}`).toBe(true);
  });
});
