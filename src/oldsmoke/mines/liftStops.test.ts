import { describe, expect, it } from 'vitest';
import type { ConditionEnv } from '../../quests/ports';
import type { QuestState } from '../../quests/types';
import { MINE_DOOR_IDS, MINE_IDS } from './kit';
import { availableStops, LIFT_ARMED_FLAG, LIFT_STOPS, nextStopLabel, stopOfInterior } from './liftStops';

const STARTED = { shaft: 'story.m17.started', old: 'story.r08.started', lower: 'story.m19.started', bellows: 'story.m18.started' };
const env = (armed: boolean, flags: string[] = [], quests: Record<string, QuestState> = {}): ConditionEnv => ({
  state: { getFlag: (k: string) => ((k === LIFT_ARMED_FLAG ? armed : flags.includes(k)) || undefined) } as never,
  quests: { state: (id) => quests[id] ?? 'inactive', objectiveDone: () => false },
});
const open = (e: ConditionEnv) => availableStops(e).filter((s) => s.unlocked).map((s) => s.stop.id);

describe('lift stops table', () => {
  it('has the six stops in order, each mine on its kit interior and door', () => {
    expect(LIFT_STOPS.map((s) => s.id)).toEqual(['surface', 'shaft', 'old', 'lower', 'bellows', 'deepdelve']);
    for (const s of LIFT_STOPS.slice(1)) {
      expect(s.interiorId).toBe(MINE_IDS[s.id as keyof typeof MINE_IDS]);
      expect(s.doorId).toBe(MINE_DOOR_IDS[s.id as keyof typeof MINE_DOOR_IDS]);
    }
    expect(LIFT_STOPS[0].interiorId).toBeNull();
  });

  const rows: Array<[string, boolean, string[], Record<string, QuestState>, string[]]> = [
    ['dead lift opens only the surface', false, Object.values(STARTED), { d04: 'completed' }, ['surface']],
    ['armed, nothing started: only the surface', true, [], {}, ['surface']],
    ['m17 started opens the shaft', true, [STARTED.shaft], {}, ['surface', 'shaft']],
    ['r08 started opens old only', true, [STARTED.old], {}, ['surface', 'old']],
    ['m19 started opens lower only', true, [STARTED.lower], {}, ['surface', 'lower']],
    ['m18 started opens bellows only', true, [STARTED.bellows], {}, ['surface', 'bellows']],
    ['quest states do not stand in for started flags', true, [], { m17: 'completed', m18: 'active' }, ['surface']],
    ['d04 active opens deepdelve', true, [], { d04: 'active' }, ['surface', 'deepdelve']],
    ['d04 completed opens deepdelve', true, [], { d04: 'completed' }, ['surface', 'deepdelve']],
    ['d04 failed does not', true, [], { d04: 'failed' }, ['surface']],
    ['everything', true, Object.values(STARTED), { d04: 'active' }, ['surface', 'shaft', 'old', 'lower', 'bellows', 'deepdelve']],
  ];
  it.each(rows)('%s', (_n, armed, flags, quests, want) => {
    expect(open(env(armed, flags, quests))).toEqual(want);
  });

  it('finds the stop of an interior and defaults to the surface', () => {
    expect(stopOfInterior(null).id).toBe('surface');
    expect(stopOfInterior(MINE_IDS.lower).id).toBe('lower');
    expect(stopOfInterior('keep-hall').id).toBe('surface');
  });

  it('nextStopLabel skips locked stops and ends at the bottom', () => {
    const e = env(true, [STARTED.shaft, STARTED.old], { d04: 'active' });
    expect(nextStopLabel('surface', e)).toBe('oldsmoke.lift.stop.shaft');
    expect(nextStopLabel('shaft', e)).toBe('oldsmoke.lift.stop.old');
    expect(nextStopLabel('old', e)).toBe('oldsmoke.lift.stop.deepdelve');
    expect(nextStopLabel('deepdelve', e)).toBeNull();
  });
});
