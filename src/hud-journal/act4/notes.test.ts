import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '../../quests/types';
import { ACT_START_ROWS, actStartNote, requiredQuests, stillNeededNote, type NotePorts } from './notes';
import { HUD_JOURNAL_ACT4_STRINGS_EN } from './strings.en';

const def = (id: string, startWhen?: QuestDef['startWhen']): QuestDef =>
  ({ id, titleKey: `t.${id}`, summaryKey: `s.${id}`, objectives: [], startWhen }) as unknown as QuestDef;

function ports(flags: Record<string, boolean>, states: Record<string, QuestState>, defs: QuestDef[] = []): NotePorts {
  const S: Record<string, string> = { ...HUD_JOURNAL_ACT4_STRINGS_EN };
  return {
    flag: (k) => flags[k] === true,
    questState: (id) => states[id] ?? 'inactive',
    questDef: (id) => defs.find((d) => d.id === id),
    t: (k, p) => (S[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n])),
  };
}

describe('actStartNote (Act 3 playthrough M4)', () => {
  it('nothing before any gate', () => {
    expect(actStartNote(ports({}, {}))).toBeNull();
  });

  it('Act 3: shown after the gate until M23 is accepted', () => {
    expect(actStartNote(ports({ 'story.gate.a3': true }, {}))?.title).toContain('Leofa Hartley');
    expect(actStartNote(ports({ 'story.gate.a3': true }, { m23: 'active' }))).toBeNull();
    expect(actStartNote(ports({ 'story.gate.a3': true }, { m23: 'completed' }))).toBeNull();
  });

  it('Act 4: the newer gate wins, and clears on accepting M35', () => {
    const open = { 'story.gate.a3': true, 'story.gate.a4': true };
    expect(actStartNote(ports(open, { m23: 'completed' }))).toEqual({ id: 'start.a4', title: HUD_JOURNAL_ACT4_STRINGS_EN['hud.journal.start.a4'] });
    expect(actStartNote(ports(open, { m23: 'completed', m35: 'active' }))).toBeNull();
    // A stale Act 3 pointer never shows once Act 4 is open (a jump save with M23 never accepted).
    expect(actStartNote(ports(open, { m35: 'completed' }))).toBeNull();
  });

  it('has a row per act with a string', () => {
    for (const r of ACT_START_ROWS) expect(HUD_JOURNAL_ACT4_STRINGS_EN[r.textKey]).toBeTruthy();
  });
});

describe('requiredQuests', () => {
  it('reads completed-quest clauses alone or under all, ignores the rest, de-duplicates', () => {
    expect(requiredQuests(undefined)).toEqual([]);
    expect(requiredQuests({ quest: 'a', state: 'completed' })).toEqual(['a']);
    expect(
      requiredQuests({ all: [{ quest: 'a', state: 'completed' }, { flag: 'x' }, { quest: 'b', state: ['completed'] }, { quest: 'c', state: 'active' }, { quest: 'a', state: 'completed' }] }),
    ).toEqual(['a', 'b']);
    expect(requiredQuests({ any: [{ quest: 'a', state: 'completed' }] })).toEqual([]);
  });
});

describe('stillNeededNote', () => {
  const need = ['m35', 'm36', 'r19'];
  const defs = [def('m37', { all: need.map((q) => ({ quest: q, state: 'completed' as const })) }), def('m35'), def('m36')];

  it('lists the undone required quests by title, from the def', () => {
    const n = stillNeededNote(ports({}, { m35: 'completed' }, defs), 'm37')!;
    expect(n.title).toBe('Before t.m37, finish:');
    // r19 has no def: its id stands in.
    expect(n.lines).toEqual(['t.m36', 'r19']);
  });

  it('hidden before any is done, once all are done, and once the gated quest is accepted', () => {
    expect(stillNeededNote(ports({}, {}, defs), 'm37')).toBeNull();
    expect(stillNeededNote(ports({}, { m35: 'completed', m36: 'completed', r19: 'completed' }, defs), 'm37')).toBeNull();
    expect(stillNeededNote(ports({}, { m35: 'completed', m37: 'active' }, defs), 'm37')).toBeNull();
  });

  it('a gated quest with no def yet (M46 before L11) or no requirements shows nothing', () => {
    expect(stillNeededNote(ports({}, { m42: 'completed' }, defs), 'm46')).toBeNull();
    expect(stillNeededNote(ports({}, { m35: 'completed' }, [def('m37')]), 'm37')).toBeNull();
  });
});
