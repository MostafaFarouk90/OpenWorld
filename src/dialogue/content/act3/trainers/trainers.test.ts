// K10's four master-book trainer extensions through the real DialogueRunner and the real effect runner.
import { describe, expect, it } from 'vitest';
import { evalCondition } from '../../../../quests/conditions';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../../quests/ports';
import { questStrings } from '../../../../quests/strings.en';
import type { Condition, DialogueChoice, DialogueDef, Effect, FlagValue } from '../../../../quests/types';
import { DialogueRunner } from '../../../DialogueRunner';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { dialogueDefs } from '../../index';
import { ACT2_EXTENDED_DIALOGUES } from '../../act2';
import { npcAshdown } from '../../npc-ashdown.dialogue';
import { npcGerta } from '../../npc-gerta.dialogue';
import { ACT3_TRAINERS, ACT3_TRAINER_EXTENSIONS, ACT3_TRAINER_STRINGS, withAct3Trainers } from './index';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };

const BASE: Record<string, DialogueDef> = {
  'npc-gaut': ACT2_EXTENDED_DIALOGUES.find((d) => d.id === 'npc-gaut')!,
  'npc-pennard': ACT2_EXTENDED_DIALOGUES.find((d) => d.id === 'npc-pennard')!,
  'npc-gerta': npcGerta,
  'npc-ashdown': npcAshdown,
};
const extended = (id: string) => dialogueDefs.find((d) => d.id === id)!;

function world(flags: Record<string, FlagValue> = {}, states: Record<string, 'inactive' | 'active' | 'completed'> = {}) {
  const store = new Map<string, FlagValue>(Object.entries(flags));
  const sets: string[] = [];
  const emitted: string[] = [];
  const bus = { on: () => () => {}, emit: (t: string) => void emitted.push(t) } as unknown as BusPort;
  const state = {
    getFlag: (k: string) => store.get(k),
    setFlag: (k: string, v: FlagValue) => {
      store.set(k, v);
      sets.push(k);
    },
    clearFlag: (k: string) => void store.delete(k),
    favourBand: () => 'banked',
    favour: () => 30,
    addFavour: () => 0,
  } as unknown as StatePort;
  const quests = {
    state: (id: string) => states[id] ?? 'inactive',
    objectiveDone: () => false,
    start: () => true,
    complete: () => true,
    completeObjective: () => true,
  } as unknown as QuestReader;
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test', inventory: () => ({ add: (_i: string, n: number) => n }) } as never);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  const env = { state, quests, favourBand: () => 'banked' };
  return { dr, store, sets, emitted, env };
}

const opens = (w: ReturnType<typeof world>, id: string, npc: string): string => {
  expect(w.dr.start(id, npc), `${id} starts`).toBe(true);
  const node = w.dr.view()!.nodeId;
  w.dr.close('skip');
  return node;
};

/** The first start rule of `def` that matches the flags and quest states. */
function firstStart(def: DialogueDef, w: ReturnType<typeof world>): string {
  if (typeof def.start === 'string') return def.start;
  const hit = def.start.find((r) => evalCondition(r.when as Condition, w.env as never));
  return hit!.node;
}

const gate = { 'story.gate.a3': true };

describe.each(ACT3_TRAINERS)('$npcId', (t) => {
  const bookFlag = `trainer.${t.classId}.masterBook`;

  it('starts at a3-book once the Act 3 gate is open and the book is not given', () => {
    const w = world(gate);
    expect(opens(w, t.npcId, t.npcId)).toBe('a3-book');
  });
  it('carries { grantMasterBook } for its own class on one node', () => {
    const grants = extended(t.npcId).nodes.flatMap((n) => (n.effects ?? []).filter((e) => 'grantMasterBook' in e)) as { grantMasterBook: string }[];
    expect(grants).toEqual([{ grantMasterBook: t.classId }]);
    expect(extended(t.npcId).nodes.find((n) => n.id === 'a3-book-2')?.effects).toEqual([{ grantMasterBook: t.classId }]);
  });
  it('leaves the Act 1 and 2 start unchanged with the book given, or before the gate', () => {
    for (const flags of [{ ...gate, [bookFlag]: true }, {}, { [bookFlag]: true }, { 'story.gate.a3': false }]) {
      const w = world(flags);
      expect(firstStart(extended(t.npcId), w), JSON.stringify(flags)).toBe(firstStart(BASE[t.npcId], w));
      expect(opens(w, t.npcId, t.npcId)).toBe(firstStart(BASE[t.npcId], w));
    }
  });
  it('leaves the Act 1 and 2 start unchanged in the other quest states too', () => {
    const states = [{ m07: 'completed' }, { m10: 'active' }, { m04: 'active' }] as const;
    for (const s of states) {
      const w = world({ ...gate, [bookFlag]: true }, s as never);
      expect(firstStart(extended(t.npcId), w)).toBe(firstStart(BASE[t.npcId], w));
    }
  });
  it('keeps every base node and adds only a3- nodes', () => {
    const base = BASE[t.npcId];
    const ext = extended(t.npcId);
    expect(ext.nodes.slice(0, base.nodes.length)).toEqual(base.nodes);
    const added = ext.nodes.slice(base.nodes.length);
    expect(added.length).toBe(3);
    for (const n of added) expect(n.id.startsWith('a3-')).toBe(true);
  });
  it('plays the talk, continues to trainer-open, gives the book once and opens nothing new on a second talk', () => {
    const w = world({ ...gate, 'tutorial.complete': true });
    expect(w.dr.start(t.npcId, t.npcId)).toBe(true);
    const seen: string[] = [];
    while (w.dr.isOpen && seen.length < 3) {
      seen.push(w.dr.view()!.nodeId);
      w.dr.advance();
    }
    expect(seen).toEqual(['a3-book', 'a3-book-2', 'a3-book-3']);
    expect(w.store.get(bookFlag)).toBe(true);
    expect(w.dr.isOpen).toBe(true);
    expect(w.dr.view()!.nodeId).toBe('trainer-open');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
    w.dr.close('skip');
    const again = opens(w, t.npcId, t.npcId);
    expect(again).not.toBe('a3-book');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
  });
  it('the last a3 line falls through to trainer-open, a node of the Act 1 tree', () => {
    const ext = extended(t.npcId);
    const last = ext.nodes.find((n) => n.id === 'a3-book-3')!;
    expect(last.next).toBe('trainer-open');
    expect(ext.nodes.some((n) => n.id === 'trainer-open')).toBe(true);
  });
  it('writes no trainer. flag with setFlag anywhere in the tree', () => {
    const effects: Effect[] = [];
    for (const n of extended(t.npcId).nodes) {
      effects.push(...(n.effects ?? []));
      for (const c of (n.choices ?? []) as DialogueChoice[]) effects.push(...(c.effects ?? []));
    }
    const bad = effects.filter((e) => 'setFlag' in e && e.setFlag.startsWith('trainer.'));
    expect(bad).toEqual([]);
  });
  it('has a string for every added node', () => {
    for (const n of extended(t.npcId).nodes.filter((x) => x.id.startsWith('a3-'))) expect(all[n.textKey], n.textKey).toBeTruthy();
  });
});

describe('the four extensions', () => {
  it('cover knight, emberwright, ashblade and pathfinder through the four trainer ids', () => {
    expect(ACT3_TRAINERS.map((t) => [t.npcId, t.classId])).toEqual([
      ['npc-gaut', 'knight'],
      ['npc-pennard', 'emberwright'],
      ['npc-gerta', 'ashblade'],
      ['npc-ashdown', 'pathfinder'],
    ]);
    expect(ACT3_TRAINER_EXTENSIONS).toHaveLength(4);
  });
  it('registers the extension strings with the dialogue strings', () => {
    for (const [k, v] of Object.entries(ACT3_TRAINER_STRINGS)) expect(dialogueStrings[k], k).toBe(v);
  });
  it('withAct3Trainers leaves other trees untouched and tolerates a missing tree', () => {
    const other = { id: 'npc-other', start: 'a', nodes: [{ id: 'a', speaker: 'x', textKey: 'k', next: null }] } as DialogueDef;
    const out = withAct3Trainers([other]);
    expect(out).toEqual([other]);
    expect(out[0]).toBe(other);
  });
  it('writes no trainer. flag with setFlag in any added node when talked through, other than through the grant', () => {
    for (const t of ACT3_TRAINERS) {
      const w = world({ ...gate, 'tutorial.complete': true });
      w.dr.start(t.npcId, t.npcId);
      for (let i = 0; i < 3; i++) w.dr.advance();
      w.dr.close('skip');
      expect(w.sets).toEqual([`trainer.${t.classId}.masterBook`]); // K11's grantMasterBook is the only writer
    }
  });
});
