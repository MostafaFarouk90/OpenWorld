import { describe, it, expect } from 'vitest';
import { TUTORIAL_QUESTS } from './quests';
import { TUTORIAL_STRINGS_EN } from './strings.en';
import { validateQuest } from '../quests/validate';

const has = (k: string) => k in TUTORIAL_STRINGS_EN;

describe('tutorial quests', () => {
  it('defines 14 quests and not t03 or t12', () => {
    expect(TUTORIAL_QUESTS).toHaveLength(14);
    const ids = TUTORIAL_QUESTS.map((q) => q.id);
    expect(ids).not.toContain('t03');
    expect(ids).not.toContain('t12');
    expect(ids).toContain('t-skirmish');
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const q of TUTORIAL_QUESTS) {
    it(`${q.id} validates`, () => {
      expect(validateQuest(q, has)).toEqual([]);
      expect(q.objectives).toHaveLength(1);
      expect(q.objectives[0]).toMatchObject({ id: 'o1', type: 'interact' });
      expect(q.sequential).toBeFalsy();
    });
  }
});
