// The Phase I hold, retired (N12 PR 2, plan 8): PR 1 held the bowl floor and the Inner Gate shut with
// `story.phase.foundryOpen` (PHASE_HOLDS.caldera) whatever M52 and M53 wrote. PR 2 emptied the list, so the floor opens on
// M53 alone, the Foundry quests on M52 alone, and an old save that still carries the flag loads cleanly (nothing reads it).
import { describe, expect, it } from 'vitest';
import { Containment } from '../region/containment';
import { ACT3_CORRIDORS, ACT3_HOLES } from '../region/act3Containment';
import { ACT4_CORRIDORS, ACT4_HOLES } from '../region/act4Containment';
import { ACT5_HOLES, INNER_GATE_OPEN_WHEN } from '../region/act5Containment';
import { DEAD_ROAD_CORRIDOR } from '../region/containment';
import { PHASE_HOLDS } from '../region/regions';
import { ACT5_GATE_FLAG, CALDERA_CENTRE, FOUNDRY_OPEN_FLAG, INNER_GATE_FLAG, RIM_GATE_OPEN_FLAG, SIEGE_COMPLETE_FLAG } from '../region/act5Regions';
import { INSIDE_FLOOR_POINT } from './act5Fixtures';
import { ACT5_PHASE_I } from '../quests/act5Jump';
import { phaseJOpen } from '../quests/content/act5/foundry/phase';

const contain = (flags: Record<string, boolean>) =>
  new Containment({ getFlag: (k: string) => flags[k] }, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES, ...ACT5_HOLES]);

const allDone = (ids: readonly string[]) => Object.fromEntries(ids.map((q) => [`story.${q}.complete`, true]));
const PHASE_I_END: Record<string, boolean> = { 'story.gate.a4': true, [ACT5_GATE_FLAG]: true, [RIM_GATE_OPEN_FLAG]: true, ...allDone(ACT5_PHASE_I) };
const floorOpen = (flags: Record<string, boolean>) => contain(flags).isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z);

describe('the Phase I hold on the bowl floor, retired', () => {
  it('is gone: the Caldera holds nothing and the Inner Gate waits on M53 alone', () => {
    expect(PHASE_HOLDS.caldera).toBeUndefined();
    expect(INNER_GATE_OPEN_WHEN).toEqual({ all: [INNER_GATE_FLAG] });
    expect(JSON.stringify(INNER_GATE_OPEN_WHEN)).not.toContain(FOUNDRY_OPEN_FLAG);
  });

  it('the floor is still shut at Phase I\'s end (M52 done, M53 not), and opens once M53 completes', () => {
    expect(PHASE_I_END[SIEGE_COMPLETE_FLAG]).toBe(true);
    expect(floorOpen(PHASE_I_END)).toBe(false);
    expect(floorOpen({ ...PHASE_I_END, [INNER_GATE_FLAG]: true })).toBe(true);
  });

  it('an old save carrying the retired flag changes nothing: shut without M53, open with it', () => {
    expect(floorOpen({ ...PHASE_I_END, [FOUNDRY_OPEN_FLAG]: true })).toBe(false);
    expect(floorOpen({ ...PHASE_I_END, [FOUNDRY_OPEN_FLAG]: true, [INNER_GATE_FLAG]: true })).toBe(true);
  });

  it('the Foundry quests open on M52 alone', () => {
    expect(phaseJOpen()).toEqual({ all: [{ flag: 'story.m52.complete', equals: true }] });
  });

  it('the Rim outside the floor stays open at Phase I\'s end', () => {
    expect(contain(PHASE_I_END).isOpen(CALDERA_CENTRE.x, 6750)).toBe(true);
  });
});
