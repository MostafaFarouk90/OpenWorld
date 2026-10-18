import { describe, expect, it } from 'vitest';
import { StubDocument, textOf } from './dom';
import { objectiveProgress, QuestTracker, type TrackedQuest } from './QuestTracker';

const t = (k: string) => (k === 'known' ? 'Known' : `[[${k}]]`);
const quest = (id: string, objectives: TrackedQuest['objectives'] = []): TrackedQuest => ({ id, titleKey: `q.${id}`, objectives });

describe('QuestTracker', () => {
  it('no quests service is an empty tracker', () => {
    const q = new QuestTracker(new StubDocument(), { quests: undefined, t });
    expect(q.element.children).toHaveLength(0);
    expect(() => q.update()).not.toThrow();
  });
  it('no active quest is empty', () => {
    const q = new QuestTracker(new StubDocument(), { quests: { active: () => [] }, t });
    expect(q.element.children).toHaveLength(0);
  });
  it('caps at three quests', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((i) => quest(i));
    const q = new QuestTracker(new StubDocument(), { quests: { active: () => list }, t });
    expect(q.element.children.map((c) => c.getAttribute('data-quest'))).toEqual(['a', 'b', 'c']);
  });
  it('shows done objectives struck, progress and optional', () => {
    const list = [
      quest('a', [
        { textKey: 'known', progress: 3, required: 3, done: true },
        { textKey: 'o2', progress: 1, required: 4, done: false, optional: true },
        { textKey: 'o3', progress: 9, required: 1, done: false },
      ]),
    ];
    const q = new QuestTracker(new StubDocument(), { quests: { active: () => list }, t });
    const rows = q.element.children[0]!.children.slice(1);
    expect(rows[0]!.className).toContain('owg-done');
    expect(rows[0]!.textContent).toBe('Known 3/3');
    expect(rows[1]!.className).toContain('owg-optional');
    expect(rows[1]!.textContent).toContain('1/4');
    expect(rows[1]!.textContent).toContain('hud.quest.optional');
    expect(rows[2]!.className).not.toContain('owg-done');
    expect(rows[2]!.textContent).toBe('[[o3]]');
  });
  it('missing string keys render what t returns', () => {
    const q = new QuestTracker(new StubDocument(), { quests: { active: () => [quest('z')] }, t });
    expect(textOf(q.element)).toBe('[[q.z]]');
  });
  it('updates when quests change and disposes', () => {
    let list: TrackedQuest[] = [quest('a')];
    const q = new QuestTracker(new StubDocument(), { quests: { active: () => list }, t });
    list = [];
    q.update();
    expect(q.element.children).toHaveLength(0);
    const root = new StubDocument().createElement('div');
    root.append(q.element);
    q.dispose();
    expect(root.children).toHaveLength(0);
  });
});

describe('objectiveProgress', () => {
  it('handles edges', () => {
    expect(objectiveProgress({ progress: 0, required: 1 })).toBeNull();
    expect(objectiveProgress({ progress: 2, required: 3 })).toBe('2/3');
    expect(objectiveProgress({ progress: 99, required: 3 })).toBe('3/3');
    expect(objectiveProgress({ progress: -4, required: 3 })).toBe('0/3');
    expect(objectiveProgress({ progress: NaN, required: 3 })).toBe('0/3');
    expect(objectiveProgress({ progress: 1, required: NaN })).toBeNull();
  });
});
