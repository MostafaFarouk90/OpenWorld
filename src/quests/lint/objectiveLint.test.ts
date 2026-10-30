import { describe, expect, it } from 'vitest';
import { questDefs } from '../content';
import type { ObjectiveDef, QuestDef } from '../types';
import { isAct3Id } from './act3Ids';
import {
  OBJECTIVE_LINT_ALLOW, exemption, findObjectiveHits, shippedObjectiveInput, unlistedObjectiveHits, type ObjectiveLintInput,
} from './objectiveLint';

const input = shippedObjectiveInput();
const hits = findObjectiveHits(input);
const key = (h: { quest: string; objective: string }) => `${h.quest}/${h.objective}`;

describe('objective lint over the shipped quests', () => {
  it('passes: every hit is on the allow list', () => {
    expect(unlistedObjectiveHits(hits).map(key)).toEqual([]);
  });

  it('every allow entry still matches a hit (a stale entry is removed), once', () => {
    const keys = OBJECTIVE_LINT_ALLOW.map(key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(hits.map(key).sort());
  });

  it('holds the 35 entries (the pre-check 36, less M14 temper fixed in #144), each with a reason and an owner', () => {
    expect(OBJECTIVE_LINT_ALLOW).toHaveLength(35);
    for (const a of OBJECTIVE_LINT_ALLOW) {
      expect(a.reason.length, key(a)).toBeGreaterThan(10);
      expect(a.owner.length, key(a)).toBeGreaterThan(2);
    }
    // #144 gave M14's temper a persisted counter, so it is no longer a hit and no longer listed.
    expect(OBJECTIVE_LINT_ALLOW.find((a) => key(a) === 'm14/temper')).toBeUndefined();
  });

  it('names no Act 3 quest', () => {
    for (const a of OBJECTIVE_LINT_ALLOW) expect(isAct3Id(a.quest), a.quest).toBe(false);
  });

  it('every allow entry names a real quest and objective', () => {
    for (const a of OBJECTIVE_LINT_ALLOW) {
      const q = questDefs.find((d) => d.id === a.quest);
      expect(q, a.quest).toBeDefined();
      expect(q!.objectives.some((o) => o.id === a.objective), key(a)).toBe(true);
    }
  });

  it('counts the three data exemptions (23 props, 20 notes, 2 carries in the pre-check)', () => {
    const count: Record<string, number> = { prop: 0, note: 0, carry: 0 };
    for (const q of questDefs) for (const o of q.objectives) {
      if (o.type !== 'event' || o.doneWhen) continue;
      const e = exemption(q, o, input);
      if (e) count[e]++;
    }
    expect(count).toEqual({ prop: 23, note: 20, carry: 2 });
  });

  it('accepts a doneWhen built from { objective } conditions as persisted (R04 o2)', () => {
    const r04 = questDefs.find((q) => q.id === 'r04')!;
    const o2 = r04.objectives.find((o) => o.id === 'o2')!;
    expect(JSON.stringify(o2.doneWhen)).toContain('"objective"');
    expect(hits.some((h) => key(h) === 'r04/o2')).toBe(false);
  });
});

describe('objective lint rules (synthetic)', () => {
  const ev = (id: string, target: string, extra: Partial<ObjectiveDef> = {}): ObjectiveDef => ({ id, type: 'event', textKey: 't', target, ...extra });
  const quest = (id: string, ...objectives: ObjectiveDef[]): QuestDef => ({ id, titleKey: 't', summaryKey: 's', objectives });
  const base = (quests: QuestDef[], extra: Partial<ObjectiveLintInput> = {}): ObjectiveLintInput => ({
    quests, props: [], carry: [], notes: new Set(), ...extra,
  });

  it('reports a synthetic Act 3 quest event objective without doneWhen', () => {
    const q = quest('m27', ev('witness', 'story.m27.witnessed'));
    const h = findObjectiveHits(base([q]));
    expect(h.map(key)).toEqual(['m27/witness']);
    expect(unlistedObjectiveHits(h).map(key)).toEqual(['m27/witness']);
  });

  it('an Act 3 id on the allow list is refused by the test rule (isAct3Id)', () => {
    const entry = { quest: 'm27', objective: 'witness', reason: 'x', owner: 'K3' };
    expect(isAct3Id(entry.quest)).toBe(true);
    expect(unlistedObjectiveHits(findObjectiveHits(base([quest('m27', ev('witness', 'e'))])), [entry])).toEqual([]);
  });

  it('passes with doneWhen, and ignores non-event objectives', () => {
    const q = quest('m27', ev('a', 'e', { doneWhen: { flag: 'story.m27.a' } }), { id: 'b', type: 'goTo', textKey: 't', target: 'trg.x' });
    expect(findObjectiveHits(base([q]))).toEqual([]);
  });

  it('exempts an interact event only when every prop is bound to this exact objective', () => {
    const bound = { interactableId: 'use:a', objective: ['m27', 'o'] as [string, string] };
    const other = { interactableId: 'use:b', objective: ['m27', 'p'] as [string, string] };
    const q = (ids: string[]) => quest('m27', ev('o', 'interact', { match: { interactableId: ids } }));
    expect(findObjectiveHits(base([q(['use:a'])], { props: [bound] }))).toEqual([]);
    expect(findObjectiveHits(base([q(['use:a', 'use:b'])], { props: [bound, other] }))).toHaveLength(1);
    expect(findObjectiveHits(base([q(['use:zz'])], { props: [bound] }))).toHaveLength(1);
    expect(findObjectiveHits(base([quest('m27', ev('o', 'interact'))], { props: [bound] }))).toHaveLength(1);
  });

  it('exempts a dialogue.ended read only when all npc ids are registered notes', () => {
    const q = (ids: string[]) => quest('m27', ev('o', 'dialogue.ended', { match: { npcId: ids } }));
    const notes = new Set(['note-a', 'note-b']);
    expect(findObjectiveHits(base([q(['note-a', 'note-b'])], { notes }))).toEqual([]);
    expect(findObjectiveHits(base([q(['note-a', 'gerta'])], { notes }))).toHaveLength(1);
    expect(findObjectiveHits(base([q([])], { notes }))).toHaveLength(1);
  });

  it('exempts carry.delivered only for a carry item bound to this objective and destination', () => {
    const q = quest('m27', ev('o', 'carry.delivered', { match: { destinationId: 'trg.d' } }));
    const good = { questId: 'm27', objectiveId: 'o', destination: 'trg.d' };
    expect(findObjectiveHits(base([q], { carry: [good] }))).toEqual([]);
    expect(findObjectiveHits(base([q], { carry: [{ ...good, objectiveId: 'x' }] }))).toHaveLength(1);
    expect(findObjectiveHits(base([q], { carry: [{ ...good, destination: 'trg.e' }] }))).toHaveLength(1);
  });

  it('an event with several names is never exempt', () => {
    const q = quest('m27', { id: 'o', type: 'event', textKey: 't', target: ['interact', 'x'], match: { interactableId: 'use:a' } });
    const props = [{ interactableId: 'use:a', objective: ['m27', 'o'] as [string, string] }];
    expect(findObjectiveHits(base([q], { props }))).toHaveLength(1);
  });
});
