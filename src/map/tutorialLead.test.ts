import { describe, expect, it } from 'vitest';
import { withTutorialLead } from './tutorialLead';
import { buildMarkers } from './MapModel';

describe('withTutorialLead', () => {
  it('adds the tutorial target as a quest marker', () => {
    const q = withTutorialLead([], { target: () => ({ x: 5, y: 1, z: 9 }) });
    const m = buildMarkers({ waystones: [], quest: q });
    expect(m.filter((x) => x.kind === 'quest').map((x) => [x.id, x.x, x.z])).toEqual([['tutorial.target', 5, 9]]);
  });
  it('keeps existing leads and is absent for null target or missing service', () => {
    const lead = { id: 'a', x: 1, z: 2 };
    expect(withTutorialLead([lead], { target: () => null })).toEqual([lead]);
    expect(withTutorialLead([lead], undefined)).toEqual([lead]);
    expect(withTutorialLead([lead], { target: () => ({ x: 1, y: 0, z: 1 }) })).toHaveLength(2);
  });
});
