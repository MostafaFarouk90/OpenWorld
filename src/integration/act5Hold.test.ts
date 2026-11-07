// The Phase I hold (N12 PR 1, plan Q11): `story.phase.foundryOpen` (PHASE_HOLDS.caldera) keeps the bowl floor and the
// Inner Gate shut whatever M52 and M53 write, so a Phase I build never opens the Foundry. In PR 1 only the dev jump writes
// the flag (Phase J targets). PR 2 empties the hold; this file's "held" rows flip then.
import { describe, expect, it } from 'vitest';
import { Containment } from '../region/containment';
import { ACT3_CORRIDORS, ACT3_HOLES } from '../region/act3Containment';
import { ACT4_CORRIDORS, ACT4_HOLES } from '../region/act4Containment';
import { ACT5_HOLES, INNER_GATE_OPEN_WHEN } from '../region/act5Containment';
import { DEAD_ROAD_CORRIDOR } from '../region/containment';
import { PHASE_HOLDS } from '../region/regions';
import { ACT5_GATE_FLAG, CALDERA_CENTRE, FOUNDRY_OPEN_FLAG, INNER_GATE_FLAG, RIM_GATE_OPEN_FLAG, SIEGE_COMPLETE_FLAG } from '../region/act5Regions';
import { INSIDE_FLOOR_POINT } from './act5Fixtures';
import { ACT5_PHASE_I, ACT5_PHASE_J } from '../quests/act5Jump';

const contain = (flags: Record<string, boolean>) =>
  new Containment({ getFlag: (k: string) => flags[k] }, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES, ...ACT5_HOLES]);

const allDone = (ids: readonly string[]) => Object.fromEntries(ids.map((q) => [`story.${q}.complete`, true]));
const PHASE_I_END: Record<string, boolean> = { 'story.gate.a4': true, [ACT5_GATE_FLAG]: true, [RIM_GATE_OPEN_FLAG]: true, ...allDone(ACT5_PHASE_I) };

describe('the Phase I hold on the bowl floor', () => {
  it('is the Caldera\'s only hold and is part of the Inner Gate\'s condition', () => {
    expect(PHASE_HOLDS.caldera).toEqual([FOUNDRY_OPEN_FLAG]);
    expect(INNER_GATE_OPEN_WHEN).toEqual({ all: [INNER_GATE_FLAG, FOUNDRY_OPEN_FLAG] });
  });

  it('holds the floor at Phase I\'s end, and still with M53 complete (the hold, not M53, is what holds)', () => {
    expect(PHASE_I_END[SIEGE_COMPLETE_FLAG]).toBe(true);
    expect(contain(PHASE_I_END).isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z)).toBe(false);
    expect(contain({ ...PHASE_I_END, [INNER_GATE_FLAG]: true }).isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z)).toBe(false);
    // even every Phase J quest flag without the hold flag keeps it shut
    expect(contain({ ...PHASE_I_END, ...allDone(ACT5_PHASE_J) }).isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z)).toBe(false);
  });

  it('opens with the hold flag and M53 (the dev jump\'s Phase J targets); the hold flag alone does not', () => {
    expect(contain({ ...PHASE_I_END, [FOUNDRY_OPEN_FLAG]: true }).isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z)).toBe(false);
    expect(contain({ ...PHASE_I_END, [FOUNDRY_OPEN_FLAG]: true, [INNER_GATE_FLAG]: true }).isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z)).toBe(true);
  });

  it('the Rim outside the floor stays open at Phase I\'s end (the hold touches only the floor)', () => {
    const c = contain(PHASE_I_END);
    // the Rim Camp shelf, south of the floor wall
    expect(c.isOpen(CALDERA_CENTRE.x, 6750)).toBe(true);
  });
});
