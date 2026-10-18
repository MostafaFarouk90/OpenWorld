import { describe, it, expect } from 'vitest';
import { validateQuest } from './validate';
import type { QuestDef } from './types';

const has = () => true;
const good = (): QuestDef => ({
  id: 'q1', titleKey: 't', summaryKey: 's',
  objectives: [
    { id: 'a', type: 'goTo', textKey: 'ta', target: 'trig' },
    { id: 'b', type: 'kill', textKey: 'tb', target: 'wraith', required: 3, when: { objective: ['q1', 'a'], done: true } },
  ],
  onStart: [{ setFlag: 'f', value: true }],
  onComplete: [{ completeObjective: ['q1', 'a'] }, { event: 'story.done' }],
  rewards: [{ give: [{ itemId: 'bread', count: 1 }] }, { xp: 10 }],
});
const mod = (f: (d: QuestDef) => void): string[] => { const d = good(); f(d); return validateQuest(d, has); };

describe('validateQuest', () => {
  it('accepts a good def', () => expect(validateQuest(good(), has)).toEqual([]));
  it('empty id', () => expect(mod((d) => { d.id = ''; }).join()).toContain('id is empty'));
  it('no objectives', () => expect(mod((d) => { d.objectives = []; }).join()).toContain('no objectives'));
  it('duplicate objective ids', () => expect(mod((d) => { d.objectives[1].id = 'a'; }).join()).toContain('duplicate'));
  it.each([0, -1, 1.5, NaN])('required %s', (n) => {
    expect(mod((d) => { d.objectives[0].required = n; }).join()).toContain('required');
  });
  it('missing keys', () => {
    expect(mod((d) => { d.titleKey = ''; }).join()).toContain('titleKey');
    expect(mod((d) => { (d as any).summaryKey = undefined; }).join()).toContain('summaryKey');
    expect(mod((d) => { d.objectives[0].textKey = ''; }).join()).toContain('textKey');
  });
  it('keys absent from the table', () => {
    const e = validateQuest(good(), (k) => k !== 'ta');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('"ta"');
  });
  it('kill with empty target', () => {
    expect(mod((d) => { d.objectives[1].target = ''; }).join()).toContain('kill objective needs a target');
  });
  it('when referencing a missing objective of same quest, nested; other quests ignored', () => {
    expect(mod((d) => { d.objectives[1].when = { all: [{ not: { objective: ['q1', 'zz'], done: true } }] }; }).join()).toContain('zz');
    expect(mod((d) => { d.objectives[1].when = { objective: ['other', 'zz'], done: true }; })).toEqual([]);
  });
  it('completeObjective of a missing objective in effect lists', () => {
    expect(mod((d) => { d.rewards = [{ completeObjective: ['q1', 'nope'] }]; }).join()).toContain('nope');
  });
  it('static effect shape checks', () => {
    const bad = [
      { give: [{ itemId: 'x', count: 0 }] }, { give: [] }, { take: [{ itemId: '', count: 1 }] },
      { xp: -1 }, { skillPoints: NaN }, { setFlag: '', value: 1 }, { setFlag: 'k', value: NaN },
      { favour: 'x', delta: 1 }, { favour: 'halvard', delta: NaN }, { event: 'damage.dealt' },
      { startQuest: '' }, { bogus: 1 },
    ] as unknown as QuestDef['onStart'];
    for (const e of bad!) {
      expect(mod((d) => { d.onStart = [e]; }), JSON.stringify(e)).toHaveLength(1);
    }
  });
});
