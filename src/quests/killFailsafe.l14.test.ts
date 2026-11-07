// Act 4 L14: the kill failsafe also covers M03's churchyard and D02's stray and sluice hounds.
import { describe, expect, it } from 'vitest';
import { KILL_FAILSAFE_QUESTS, KILL_FAILSAFE_SPAWNERS, currentKillTargets, type KillQuestPort } from './killFailsafe';
import { BRIGHTWATER_SPAWNERS } from '../enemies/brightwaterSpawners';
import * as density from '../enemies/densitySpawners';
import { m03 as m03Quest } from './content/m03.quest';
import { d02 as d02Quest } from './content/d02.quest';

describe('kill failsafe coverage (L14)', () => {
  it('maps the new groups to spawners that exist and carry the same tag', () => {
    const all = [...BRIGHTWATER_SPAWNERS, ...Object.values(density).filter(Array.isArray).flat()] as Array<{ id: string; tag: string }>;
    for (const tag of ['m03.churchyard', 'd02.stray', 'd02.sluice']) {
      const id = KILL_FAILSAFE_SPAWNERS[tag];
      expect(id, tag).toBeDefined();
      expect(all.find((s) => s.id === id)?.tag).toBe(tag);
    }
    expect(KILL_FAILSAFE_QUESTS).toEqual(expect.arrayContaining(['m03', 'd02']));
  });

  it('leaves the kennels out (two spawners for one tag, a built-in margin)', () => {
    expect(KILL_FAILSAFE_SPAWNERS['d02.kennels']).toBeUndefined();
  });

  it("lists M03's churchyard and D02's stray when current, and not once done", () => {
    const port = (id: string, objId: string, done: boolean, progress = 1): KillQuestPort => {
      const def = [m03Quest, d02Quest].find((q) => q.id === id)!;
      return {
        state: (q) => (q === id ? 'active' : 'inactive'),
        objectives: (q) => (q === id ? def.objectives.filter((o) => o.id === objId).map((o) => ({ def: o, progress, done, current: true })) : []),
      };
    };
    expect(currentKillTargets(port('m03', 'o6', false), KILL_FAILSAFE_QUESTS)).toEqual([
      { questId: 'm03', objectiveId: 'o6', spawnTag: 'm03.churchyard', remaining: 3 },
    ]);
    const bread = (f: string) => f === 'story.d02.breadGiven';
    expect(currentKillTargets(port('d02', 'stray', false, 0), KILL_FAILSAFE_QUESTS, bread)[0]?.remaining).toBe(2);
    // before Rook's bread (the strays' gate) nothing is refilled, with or without a flag reader
    expect(currentKillTargets(port('d02', 'stray', false, 0), KILL_FAILSAFE_QUESTS, () => false)).toEqual([]);
    expect(currentKillTargets(port('d02', 'stray', false, 0), KILL_FAILSAFE_QUESTS)).toEqual([]);
    expect(currentKillTargets(port('d02', 'stray', true, 2), KILL_FAILSAFE_QUESTS, bread)).toEqual([]);
    expect(currentKillTargets(port('d02', 'o3', false, 0), KILL_FAILSAFE_QUESTS)).toEqual([]);
  });
});
