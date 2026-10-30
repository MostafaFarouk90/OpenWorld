// K5: Hrolf's master-book talk (Q2; any class may ask, coordinator ruling 2026-10-30) through the real DialogueRunner and
// effect runner, the companions' scene trees for M27, M32 and M34, and K0's load rule for a Warden without the book.
import { describe, expect, it } from 'vitest';
import { evalCondition } from '../../../../quests/conditions';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../../quests/ports';
import { questStrings } from '../../../../quests/strings.en';
import type { Condition, DialogueDef, Effect, FlagValue } from '../../../../quests/types';
import { Progression } from '../../../../progression/Progression';
import { SKILLS, getSkill, registerClassSkills } from '../../../../progression/skills';
import { fakeActor } from '../../../../progression/testkit';
import { WARDEN_SKILLS } from '../../../../classes/warden/skills';
import { DialogueRunner } from '../../../DialogueRunner';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { dialogueDefs } from '../../index';
import { ACT2_DIALOGUES } from '../../act2';
import {
  ACT3_COMPANION_DIALOGUES,
  ACT3_COMPANION_STRINGS,
  HROLF_DIALOGUE_ID,
  SCENE_M27_DESERTER,
  SCENE_M32_COMPANIONS,
  SCENE_M34_COMPANIONS,
  withAct3Companions,
} from './index';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const BOOK = 'trainer.warden.masterBook';
const gate = { 'story.gate.a3': true };
const BASE = ACT2_DIALOGUES.find((d) => d.id === HROLF_DIALOGUE_ID)!;
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

function firstStart(def: DialogueDef, w: ReturnType<typeof world>): string {
  if (typeof def.start === 'string') return def.start;
  return def.start.find((r) => evalCondition(r.when as Condition, w.env as never))!.node;
}

describe("Hrolf's master-book talk", () => {
  it('opens at a3-book once the Act 3 gate is open and the book is not given, whatever the class', () => {
    for (const cls of ['knight', 'warden', 'pathfinder']) {
      const w = world({ ...gate, 'progression.class': cls });
      expect(w.dr.start(HROLF_DIALOGUE_ID, 'hrolf')).toBe(true);
      expect(w.dr.view()!.nodeId).toBe('a3-book');
      w.dr.close('skip');
    }
  });

  it('plays through, gives the book once, falls into his idle talk; a second talk does not offer it again', () => {
    const w = world(gate);
    w.dr.start(HROLF_DIALOGUE_ID, 'hrolf');
    const seen: string[] = [];
    while (w.dr.isOpen && seen.length < 4) {
      seen.push(w.dr.view()!.nodeId);
      w.dr.advance();
    }
    expect(seen).toEqual(['a3-book', 'a3-book-2', 'a3-book-3', 'a3-book-4']);
    expect(w.store.get(BOOK)).toBe(true);
    expect(w.dr.isOpen).toBe(true);
    expect(w.dr.view()!.nodeId).toBe('idle');
    w.dr.close('skip');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
    expect(w.sets).toEqual([BOOK]);
    w.dr.start(HROLF_DIALOGUE_ID, 'hrolf');
    expect(w.dr.view()!.nodeId).not.toBe('a3-book');
    w.dr.close('skip');
    expect(w.emitted.filter((e) => e === 'trainer.masterBook')).toHaveLength(1);
  });

  it('a book already given (by another route) is never given again: the Act 2 start holds', () => {
    const cases: Record<string, FlagValue>[] = [{ ...gate, [BOOK]: true }, {}, { 'story.gate.a3': false }];
    for (const flags of cases) {
      const w = world(flags);
      expect(firstStart(extended(HROLF_DIALOGUE_ID), w), JSON.stringify(flags)).toBe(firstStart(BASE, w));
    }
  });

  it('his open R11 or R07 speaks before the book (the book waits for the next talk)', () => {
    for (const q of ['r11', 'r07']) {
      const w = world(gate, { [q]: 'active' });
      expect(firstStart(extended(HROLF_DIALOGUE_ID), w), q).toBe(firstStart(BASE, w));
    }
  });

  it('carries exactly one { grantMasterBook: warden } and keeps every base node', () => {
    const ext = extended(HROLF_DIALOGUE_ID);
    const grants = ext.nodes.flatMap((n) => (n.effects ?? []).filter((e: Effect) => 'grantMasterBook' in e));
    expect(grants).toEqual([{ grantMasterBook: 'warden' }]);
    expect(ext.nodes.slice(0, BASE.nodes.length)).toEqual(BASE.nodes);
    for (const n of ext.nodes.slice(BASE.nodes.length)) expect(n.id.startsWith('a3-')).toBe(true);
  });

  it('every added node and scene line has a string, registered with the dialogue strings', () => {
    for (const [k, v] of Object.entries(ACT3_COMPANION_STRINGS)) expect(dialogueStrings[k], k).toBe(v);
  });

  it('withAct3Companions tolerates a missing Hrolf tree and leaves other trees alone', () => {
    const other = { id: 'npc-other', start: 'a', nodes: [{ id: 'a', speaker: 'x', textKey: 'k', next: null }] } as DialogueDef;
    const out = withAct3Companions([other]);
    expect(out[0]).toBe(other);
    expect(out.slice(1)).toEqual(ACT3_COMPANION_DIALOGUES);
  });
});

describe('scene trees for K12 and K13', () => {
  const lines = (id: string) => extended(id).nodes;

  it('have the pacing node counts: M27 ally 6, M32 companions 12, M34 companions 10', () => {
    expect(lines(SCENE_M27_DESERTER)).toHaveLength(6);
    expect(lines(SCENE_M32_COMPANIONS)).toHaveLength(12);
    expect(lines(SCENE_M34_COMPANIONS)).toHaveLength(10);
  });

  it('carry no effects (the quest threads own every flag) and use only known speakers', () => {
    const speakers = new Set(['tobb', 'hrolf', 'aelfreda', 'deserter', 'cael']);
    for (const id of [SCENE_M27_DESERTER, SCENE_M32_COMPANIONS, SCENE_M34_COMPANIONS]) {
      for (const n of lines(id)) {
        expect(n.effects, `${id}/${n.id}`).toBeUndefined();
        expect(speakers.has(n.speaker), `${id}/${n.id}`).toBe(true);
      }
    }
  });

  it('M32 and M34 give all three companions a voice; M27 is Wybert and Cael', () => {
    const who = (id: string) => new Set(lines(id).map((n) => n.speaker));
    expect([...who(SCENE_M32_COMPANIONS)].sort()).toEqual(['aelfreda', 'cael', 'hrolf', 'tobb']);
    expect([...who(SCENE_M34_COMPANIONS)].sort()).toEqual(['aelfreda', 'cael', 'hrolf', 'tobb']);
    expect([...who(SCENE_M27_DESERTER)].sort()).toEqual(['cael', 'deserter']);
  });

  it('run start to end in the real runner', () => {
    const w = world();
    for (const id of [SCENE_M27_DESERTER, SCENE_M32_COMPANIONS, SCENE_M34_COMPANIONS]) {
      expect(w.dr.start(id, id)).toBe(true);
      let n = 0;
      while (w.dr.isOpen && n++ < 20) w.dr.advance();
      expect(w.dr.isOpen, id).toBe(false);
      expect(n, id).toBe(lines(id).length);
    }
  });
});

describe("K0's load rule: a Warden save without the book flag keeps its learned skills", () => {
  registerClassSkills('warden', [...WARDEN_SKILLS]);
  it('tier 4 and 5 Warden skills learned before load stay learned with the book flag absent', () => {
    // Tier 4 and one tier 5 capstone (capstones are exclusive).
    const tree = SKILLS.filter((s) => s.classId === 'warden').sort((a, b) => a.tier - b.tier);
    const capstone = tree.find((s) => s.tier === 5)!;
    const learned = [...tree.filter((s) => s.tier <= 4), capstone].map((s) => s.id);
    const cost = learned.reduce((n, id) => n + getSkill(id)!.cost, 0);
    const flags = new Map<string, boolean>();
    const p = new Progression({
      emit: () => {},
      logger: { warn: () => {} },
      actor: () => fakeActor(),
      flags: { get: (k: string) => flags.get(k), set: (k: string, v: boolean) => void flags.set(k, v) },
    });
    p.load({ xp: 0, storyPoints: cost, learned, bar: [null, null, null, null, null, null], classId: 'warden', respecUsed: false });
    expect(flags.has(BOOK)).toBe(false);
    for (const id of learned) expect(p.learned(id), id).toBe(true);
  });
});
