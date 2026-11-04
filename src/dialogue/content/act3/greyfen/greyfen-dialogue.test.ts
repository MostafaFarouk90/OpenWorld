// K12: Greyfen dialogue content checks: every tree and note validates, strings resolve, the Pathfinder book is granted once,
// the R12 and R14 choices set their flags, and the talk table matches real trees and segments.
import { describe, expect, it } from 'vitest';
import { evalCondition } from '../../../../quests/conditions';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../../quests/ports';
import type { FlagValue } from '../../../../quests/types';
import { DialogueRunner } from '../../../DialogueRunner';
import type { Condition, DialogueDef, Effect } from '../../../../quests/types';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { dialogueDefs } from '../../index';
import { GREYFEN_DIALOGUES, GREYFEN_DIALOGUE_STRINGS, GREYFEN_TREES } from './index';
import { GREYFEN_TALKS } from './talks';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const byId = new Map(GREYFEN_DIALOGUES.map((d) => [d.id, d]));
const fxOf = (d: DialogueDef): Effect[] =>
  d.nodes.flatMap((n) => [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.effects ?? [])]) as Effect[];

describe('greyfen dialogue content', () => {
  it('is registered in the shared dialogue index', () => {
    for (const d of GREYFEN_DIALOGUES) expect(dialogueDefs.find((x) => x.id === d.id), d.id).toBeTruthy();
  });
  it('every node text key resolves to a string', () => {
    for (const d of GREYFEN_DIALOGUES) for (const n of d.nodes) {
      expect(all[n.textKey] ?? GREYFEN_DIALOGUE_STRINGS[n.textKey], `${d.id}/${n.id}`).toBeTruthy();
    }
  });
  it('every choice text key resolves and every target exists', () => {
    for (const d of GREYFEN_DIALOGUES) {
      const ids = new Set(d.nodes.map((n) => n.id));
      for (const n of d.nodes) {
        if (n.next) expect(ids.has(n.next), `${d.id}/${n.id}`).toBe(true);
        for (const c of n.choices ?? []) {
          expect(all[c.textKey], `${d.id}/${n.id}/${c.id}`).toBeTruthy();
          if (c.next) expect(ids.has(c.next), `${d.id}/${n.id}/${c.id}`).toBe(true);
        }
      }
    }
  });
  it('never names the player character literally', () => {
    for (const [k, v] of Object.entries(GREYFEN_DIALOGUE_STRINGS)) expect(v, k).not.toMatch(/\bCael\b/);
  });
  it('the talk table points at real trees and segments', () => {
    for (const t of GREYFEN_TALKS) {
      const tree = GREYFEN_TREES.find((x) => x.def.id === t.tree);
      expect(tree, `${t.quest}.${t.objective}: ${t.tree}`).toBeTruthy();
      const ids = tree!.def.nodes.map((n) => n.id);
      expect(ids.some((i) => i === t.seg || i.startsWith(`${t.seg}-`)), `${t.tree}/${t.seg}`).toBe(true);
    }
  });
  it('grants the Pathfinder master book once, behind the flag', () => {
    const leofa = byId.get('npc-leofa')!;
    const nodes = leofa.nodes.filter((n) => JSON.stringify(n.effects ?? []).includes('grantMasterBook'));
    expect(nodes.length).toBe(1);
    const when = nodes[0]!.when as Condition;
    const env = (given: boolean) => ({ state: { getFlag: (k: string) => (k === 'trainer.pathfinder.masterBook' ? given : undefined) }, quests: { state: () => 'inactive', objectiveDone: () => false }, favourBand: () => 'banked' }) as never;
    expect(evalCondition(when, env(false))).toBe(true);
    expect(evalCondition(when, env(true))).toBe(false);
  });
  it('R12 choices set the pick and announce it', () => {
    const s = JSON.stringify(fxOf(byId.get('npc-dudda')!));
    expect(s).toContain('story.r12.pick');
    expect(s).toContain('story.r12.picked');
    expect(s).toContain('burned');
    expect(s).toContain('cut');
  });
  it('R14 choices set the choice and announce it', () => {
    const s = JSON.stringify(fxOf(byId.get('npc-deserter')!));
    expect(s).toContain('story.r14.choice');
    expect(s).toContain('story.r14.chosen');
    expect(s).toContain('returned');
    expect(s).toContain('released');
  });
});

/** The real DialogueRunner and effect runner (the trainers test's world), for the book Leofa and Cenric Ashdown both give. */
function world(flags: Record<string, FlagValue>, states: Record<string, 'inactive' | 'active' | 'completed'> = {}) {
  const store = new Map<string, FlagValue>(Object.entries(flags));
  const emitted: string[] = [];
  const bus = { on: () => () => {}, emit: (t: string) => void emitted.push(t) } as unknown as BusPort;
  const state = {
    getFlag: (k: string) => store.get(k), setFlag: (k: string, v: FlagValue) => void store.set(k, v), clearFlag: (k: string) => void store.delete(k),
    favourBand: () => 'banked', favour: () => 30, addFavour: () => 0,
  } as unknown as StatePort;
  const quests = {
    state: (id: string) => states[id] ?? 'inactive', objectiveDone: () => false, start: () => true, complete: () => true, completeObjective: () => true,
  } as unknown as QuestReader;
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test', inventory: () => ({ add: (_i: string, n: number) => n }) } as never);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  return { dr, store, emitted };
}
const playOut = (w: ReturnType<typeof world>, id: string): string[] => {
  expect(w.dr.start(id, id), id).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 80 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices?.length) w.dr.choose(v.choices.length);
    else w.dr.advance();
  }
  if (w.dr.isOpen) w.dr.close('skip');
  return seen;
};
const gate = { 'story.gate.a3': true, 'tutorial.complete': true };
const BOOK_NODE = byId.get('npc-leofa')!.nodes.find((n) => JSON.stringify(n.effects ?? []).includes('grantMasterBook'))!.id;

describe('the Pathfinder master book is given once, whoever gives it first', () => {
  it('Leofa then Cenric: one grant', () => {
    const w = world(gate);
    expect(playOut(w, 'npc-leofa')).toContain(BOOK_NODE);
    expect(w.store.get('trainer.pathfinder.masterBook')).toBe(true);
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
    const cenric = playOut(w, 'npc-ashdown');
    expect(cenric).not.toContain('a3-book');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
    // and Leofa again (the quest is now active in a real game): the line cannot repeat
    playOut(w, 'npc-leofa');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
  });
  it('Cenric then Leofa: Leofa skips the line', () => {
    const w = world(gate);
    expect(playOut(w, 'npc-ashdown')).toContain('a3-book');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
    const leofa = playOut(w, 'npc-leofa');
    expect(leofa).not.toContain(BOOK_NODE);
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
  });
});

describe("Gytha's tree", () => {
  const brewChoices = (flags: Record<string, FlagValue>, states: Record<string, 'inactive' | 'active' | 'completed'>) => {
    const w = world(flags, states);
    w.dr.start('npc-gytha', 'npc-gytha');
    const v = w.dr.view()!;
    const ids = (v.choices ?? []).map((c) => c.id);
    return { w, ids };
  };
  it('offers "Brew a salve" after M25 and raises npc.gytha.brew', () => {
    const { w, ids } = brewChoices(gate, { m23: 'completed', m24: 'completed', m25: 'completed', m26: 'completed', r13: 'completed', d05: 'completed' });
    expect(ids).toContain('brew');
    w.dr.choose(w.dr.view()!.choices!.findIndex((c) => c.id === 'brew') + 1);
    expect(w.emitted).toContain('npc.gytha.brew');
  });
  it('does not offer the brew before M25 is done', () => {
    const { ids } = brewChoices(gate, { m23: 'completed', m24: 'completed', m25: 'inactive' });
    expect(ids).not.toContain('brew');
  });
});
