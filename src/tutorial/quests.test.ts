import { describe, it, expect } from 'vitest';
import { TUTORIAL_QUESTS } from './quests';
import { TUTORIAL_STRINGS_EN } from './strings.en';
import { BEATS } from './beats';
import { stepRequired } from './goals';
import { validateQuest } from '../quests/validate';
import { makeWorld } from '../quests/testKit';
import type { BeatId } from './types';

const has = (k: string) => k in TUTORIAL_STRINGS_EN;
const beatOf = (questId: string): BeatId => (questId === 't-skirmish' ? 'skirmish' : (questId as BeatId));

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
    it(`${q.id} validates with one event objective per step`, () => {
      const beat = beatOf(q.id);
      expect(validateQuest(q, has)).toEqual([]);
      expect(q.sequential).toBe(true);
      expect(q.objectives).toHaveLength(BEATS[beat].steps.length);
      q.objectives.forEach((o, i) => {
        expect(o).toMatchObject({ id: `o${i + 1}`, type: 'event', target: 'tutorial.goal', match: { beatId: beat, step: i } });
        expect(o.required).toBe(stepRequired(BEATS[beat].steps[i]));
        expect(o.textKey).toBe(`tutorial.${beat}.o${i + 1}`);
        expect(has(o.textKey)).toBe(true);
      });
    });
  }

  it('credits only events that match both beatId and step, in order', () => {
    const w = makeWorld(TUTORIAL_QUESTS);
    expect(w.manager.start('t08')).toBe(true);
    const o = () => w.manager.objectives('t08').map((x) => x.progress);
    w.bus.emit('tutorial.goal', { beatId: 't09', step: 0 });
    w.bus.emit('tutorial.goal', { beatId: 't08', step: 1 }); // step 2 is not current yet
    expect(o()).toEqual([0, 0]);
    for (let i = 0; i < 4; i++) w.bus.emit('tutorial.goal', { beatId: 't08', step: 0 });
    expect(o()).toEqual([4, 0]);
    w.bus.emit('tutorial.goal', { beatId: 't08', step: 0 }); // clamped, no overflow into step 2
    expect(o()).toEqual([4, 0]);
    w.bus.emit('tutorial.goal', { beatId: 't08', step: 1 });
    expect(w.manager.state('t08')).toBe('completed');
  });

  it('a save holding the old o1 progress loads without errors, and the director can still complete the quest', () => {
    const w = makeWorld(TUTORIAL_QUESTS);
    w.manager.load({ quests: { t05: { state: 'active', objectives: { o1: 1 } } } });
    expect(w.warns).toEqual([]);
    expect(w.manager.state('t05')).toBe('active');
    // the old o1 id is reused by step 0, so its progress is read (clamped) as that step's count: cosmetic only
    expect(w.manager.objectives('t05').map((x) => x.progress)).toEqual([1, 0]);
    w.bus.emit('tutorial.goal', { beatId: 't05', step: 0 });
    expect(w.manager.objectives('t05')[0].progress).toBe(2);
    // an unknown objective id in a save is dropped without a warning or error
    w.manager.load({ quests: { t06: { state: 'active', objectives: { o1: 9, gone: 1 } } } });
    expect(w.warns.filter((m) => !m.includes('clamped'))).toEqual([]);
    expect(w.manager.state('t06')).toBe('active');
    w.manager.load({ quests: { t05: { state: 'active', objectives: { o1: 1 } } } });
    // and the director's completeQuest ends it
    expect(w.manager.complete('t05')).toBe(true);
    expect(w.manager.state('t05')).toBe('completed');
    // completed old saves stay completed
    const w2 = makeWorld(TUTORIAL_QUESTS);
    w2.manager.load({ quests: { t01: { state: 'completed', objectives: { o1: 1 } } } });
    expect(w2.manager.state('t01')).toBe('completed');
  });
});

