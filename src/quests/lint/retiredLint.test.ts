// v0.8 item 8: the retirement lint over the shipped quests and desks, and that it can fail.
import { describe, expect, it } from 'vitest';
import { DEFAULT_KITS } from '../../classes/kits';
import { RETIRED_NPCS } from '../../npcs/retire';
import { questDefs } from '../content';
import type { QuestDef } from '../types';
import { RETIRED_LINT_ALLOW, liveAfter, retiredLint } from './retiredLint';

const GAUT = { id: DEFAULT_KITS.knight.trainer.npcId, whenFlag: 'story.m39.complete' };
const q = (id: string, target: string, type: 'talk' | 'interact' = 'talk'): QuestDef =>
  ({ id, objectives: [{ id: 'o1', type, target }] }) as unknown as QuestDef;

describe('retiredLint', () => {
  it('passes on the shipped tables', () => {
    expect(retiredLint(RETIRED_NPCS, questDefs)).toEqual([]);
    expect(RETIRED_LINT_ALLOW).toEqual([]);
  });
  it('earlier acts and earlier Act 4 mains are never live after an Act 4 flag; later quests and side quests are', () => {
    expect(liveAfter('m07', 'story.m39.complete')).toBe(false);
    expect(liveAfter('m38', 'story.m39.complete')).toBe(false);
    expect(liveAfter('m39', 'story.m39.complete')).toBe(false);
    expect(liveAfter('m40', 'story.m39.complete')).toBe(true);
    expect(liveAfter('r21', 'story.m39.complete')).toBe(true);
    expect(liveAfter('m07', 'world.somewhere')).toBe(true);
  });
  it('fails on a later quest that talks to the retired NPC', () => {
    const errs = retiredLint([GAUT], [q('m40', GAUT.id), q('m07', GAUT.id), q('r21', `npc:${GAUT.id}`, 'interact')], [
      { classId: 'knight', npcId: 'rook', post: 'p', when: { all: ['story.m41.complete'] } },
    ]);
    expect(errs).toHaveLength(2);
    expect(errs.join()).toMatch(/quest:m40\/o1/);
    expect(errs.join()).toMatch(/quest:r21\/o1/);
  });
  it("fails when the retired NPC's class desk is never handed on, and passes once a row takes it", () => {
    expect(retiredLint([GAUT], []).join()).toMatch(/knight desk is still theirs/);
    expect(retiredLint([GAUT], [], [{ classId: 'knight', npcId: 'rook', post: 'p', when: { all: ['story.m41.complete'] } }])).toEqual([]);
  });
  it('an allow entry with a reason clears one finding', () => {
    expect(retiredLint([GAUT], [], [], [{ npcId: GAUT.id, what: 'trainer:knight', reason: 'test' }])).toEqual([]);
  });
});
