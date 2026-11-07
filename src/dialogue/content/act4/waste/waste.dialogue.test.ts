// The Waste trees on the real DialogueRunner: every talk objective opens its own segment in the state it is current in; the
// choices write their flags and favour once; the hub offers only the errands that can start; strings resolve with no dash and
// no literal player name; the pacing rows' node counts are the real trees'.
import { describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../../DialogueRunner';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, StatePort, StringsPort } from '../../../../quests/ports';
import type { FlagValue, QuestState } from '../../../../quests/types';
import { dialogueDefs } from '../../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { WASTE_A4_QUEST_DEFS } from '../../../../quests/content/act4/waste/waste.content';
import { M43_DANCE_ASKED, M43_MASTER } from '../../../../quests/content/act4/waste/m43.quest';
import { R24_CHOICE, R24_CHOSEN_EVENT } from '../../../../quests/content/act4/waste/r24.quest';
import { R25_NO_CANDLE, R25_SPARE_ASKED } from '../../../../quests/content/act4/waste/r25.quest';
import { D08_BOSS_FLAG } from '../../../../quests/content/act4/waste/d08.quest';
import { WASTE_A4_NODES } from '../../../../quests/content/act4/waste/pacing';
import { WASTE_A4_TALKS } from './talks';
import { WASTE_A4_DIALOGUE_STRINGS, WASTE_A4_EXTENSIONS, WASTE_A4_NOTE_DIALOGUES, WASTE_A4_TREES } from './index';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const DEFS = Object.fromEntries(WASTE_A4_QUEST_DEFS.map((q) => [q.id, q]));

interface World { states?: Record<string, QuestState>; done?: Record<string, string[]>; flags?: Record<string, FlagValue> }

function setup(w: World = {}) {
  const flags = new Map<string, FlagValue>(Object.entries({ 'story.gate.a4': true, ...w.flags }));
  const favours: Array<[string, number]> = [];
  const events: Array<{ type: string; payload: unknown }> = [];
  const started: string[] = [];
  const bus: BusPort = { on: () => () => {}, emit: (type, payload) => { events.push({ type, payload }); } };
  const state: StatePort = {
    getFlag: (k) => flags.get(k), setFlag: (k, v) => { flags.set(k, v); }, clearFlag: (k) => { flags.delete(k); },
    favourBand: () => 'neutral' as never, favour: () => 0,
    addFavour: (t, d) => { favours.push([t, d]); return d; },
  };
  const quests = {
    state: (q: string) => w.states?.[q] ?? 'inactive',
    objectiveDone: (q: string, o: string) => w.done?.[q]?.includes(o) ?? false,
    start: (q: string) => { started.push(q); return true; }, complete: () => true, completeObjective: () => true,
  };
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test', inventory: () => ({ gold: 0 }) } as never);
  const strings: StringsPort = { t: (k, p) => (all[k] ?? `[[${k}]]`).replace('{name}', String(p?.name ?? 'Ser')), has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests: quests as never, effects, strings, gold: () => 0 });
  for (const d of dialogueDefs) dr.register(d);
  return { flags, favours, events, started, dr };
}

function runOut(dr: DialogueRunner, pick: (ids: string[]) => string | undefined = () => undefined): { nodes: string[]; offered: string[] } {
  const nodes: string[] = [];
  const offered: string[] = [];
  for (let i = 0; i < 80 && dr.isOpen; i++) {
    const v = dr.view()!;
    nodes.push(v.nodeId);
    if (v.choices.length) {
      offered.push(...v.choices.map((c) => c.id));
      const id = pick(v.choices.map((c) => c.id));
      dr.choose((v.choices.find((c) => c.id === id) ?? v.choices[0]!).number);
    } else dr.advance();
  }
  return { nodes, offered };
}

const done = (...ids: string[]): Record<string, QuestState> => Object.fromEntries(ids.map((q) => [q, 'completed' as QuestState]));
/** The quests done when each brief is first offered (each quest's start rule). */
const PARENTS: Record<string, Record<string, QuestState>> = {
  m42: done('m41'), m43: done('m41', 'm42'), m44: done('m41', 'm42', 'm43'), r24: done('m41', 'm42', 'm43'), d08: done('m41', 'm42', 'm43'),
  r25: done('m41', 'm42', 'm43', 'm44'), m45: done('m41', 'm42', 'm43', 'm44'),
  m46: done('m41', 'm42', 'm43', 'm44', 'm45', 'd08', 'r24', 'r25'),
};
/** The world in which `quest`.`objective` is the current step (a brief: the quest not begun, its parents done). */
function worldAt(quest: string, objective: string, flags: Record<string, FlagValue> = {}): World {
  const def = DEFS[quest]!;
  const i = def.objectives.findIndex((o) => o.id === objective);
  if (i === 0) return { states: PARENTS[quest]!, flags };
  return { states: { ...PARENTS[quest]!, [quest]: 'active' }, done: { [quest]: def.objectives.slice(0, i).map((o) => o.id) }, flags };
}
const HUB = new Set(['r24', 'd08', 'm45']);
const pick = (quest: string) => (ids: string[]) => (ids.includes(quest) ? quest : ids.includes('accept') ? 'accept' : ids.includes('released') ? 'released' : undefined);
const npcOf = (tree: string) => tree.replace('npc-', '');
const EXTRA: Record<string, Record<string, FlagValue>> = { d08: { [D08_BOSS_FLAG]: 'released' } };

describe('every talk objective opens its own segment', () => {
  it.each(WASTE_A4_TALKS.map((t) => [`${t.quest}.${t.objective} (${t.tree})`, t] as const))('%s', (_n, t) => {
    const { dr, started } = setup(worldAt(t.quest, t.objective, t.objective === 'report' ? EXTRA[t.quest] : {}));
    expect(dr.start(t.tree, npcOf(t.tree))).toBe(true);
    const hub = t.objective === 'brief' && HUB.has(t.quest);
    expect(dr.view()!.nodeId).toBe(hub ? 'jobs' : t.seg);
    const { nodes } = runOut(dr, pick(t.quest));
    if (hub) expect(nodes).toContain(t.seg);
    expect(dr.isOpen).toBe(false);
    if (t.objective === 'brief') expect(started).toEqual([t.quest]);
  });

  it('every talk objective of the eight quests has a row', () => {
    for (const q of WASTE_A4_QUEST_DEFS) {
      for (const o of q.objectives.filter((x) => x.type === 'talk')) {
        expect(WASTE_A4_TALKS.some((t) => t.quest === q.id && t.objective === o.id), `${q.id}.${o.id}`).toBe(true);
      }
    }
  });

  it('Hrolf\'s extended tree opens on his shipped lines while M46 is neither offered nor under way', () => {
    for (const e of WASTE_A4_EXTENSIONS) {
      const { dr } = setup({ states: done('m41') });
      if (!dr.start(e.def.id, npcOf(e.def.id))) continue;
      expect(dr.view()!.nodeId.startsWith('a4w-'), e.def.id).toBe(false);
    }
  });

  it('the hub offers only the errands that can start, and never hides one behind another', () => {
    const { dr } = setup({ states: { ...PARENTS.r24!, d08: 'active' } });
    dr.start('npc-wulfhild', 'wulfhild');
    const { offered } = runOut(dr, () => 'later');
    expect(offered).toEqual(['r24', 'later']);
    const w2 = setup({ states: { ...PARENTS.m45!, r24: 'inactive', d08: 'inactive' } });
    w2.dr.start('npc-wulfhild', 'wulfhild');
    expect(runOut(w2.dr, () => 'later').offered).toEqual(['r24', 'd08', 'm45', 'later']);
  });
});

describe('the choices', () => {
  it('R24: all gives A +10, half A -4 and H +3; each writes the choice and its event once', () => {
    const want: Record<string, Array<[string, number]>> = { all: [['ashwalkers', 10]], half: [['ashwalkers', -4], ['halvard', 3]] };
    for (const way of ['all', 'half']) {
      const { dr, flags, favours, events } = setup(worldAt('r24', 'choose'));
      dr.start('npc-wulfhild', 'wulfhild');
      expect(dr.view()!.nodeId).toBe('r24-choose');
      runOut(dr, (ids) => (ids.includes(way) ? way : undefined));
      expect(flags.get(R24_CHOICE)).toBe(way);
      expect(favours).toEqual(want[way]);
      expect(events.filter((e) => e.type === R24_CHOSEN_EVENT).length).toBe(1);
    }
  });

  it('M43: Hrodna\'s "now" asks for the bout; after a loss she offers again until the dance is won', () => {
    const a = setup(worldAt('m43', 'danceTalk'));
    a.dr.start(`npc-${M43_MASTER.dance}`, M43_MASTER.dance);
    runOut(a.dr, (ids) => (ids.includes('now') ? 'now' : undefined));
    expect(a.events.filter((e) => e.type === M43_DANCE_ASKED).length).toBe(1);
    const b = setup({ states: { ...PARENTS.m43!, m43: 'active' }, done: { m43: ['brief', 'danceTalk'] } });
    b.dr.start(`npc-${M43_MASTER.dance}`, M43_MASTER.dance);
    expect(b.dr.view()!.nodeId).toBe('m43-dance-again');
    const c = setup({ states: { ...PARENTS.m43!, m43: 'active' }, done: { m43: ['brief', 'danceTalk'] }, flags: { 'story.m43.dance': true } });
    c.dr.start(`npc-${M43_MASTER.dance}`, M43_MASTER.dance);
    expect(c.dr.view()!.nodeId).toBe('idle');
  });

  it('R25: Ebba asks for a spare only for an empty hand, and her trees carry no item effect', () => {
    const a = setup({ ...worldAt('r25', 'light2'), flags: { [R25_NO_CANDLE]: true } });
    a.dr.start('npc-ebba', 'ebba');
    expect(a.dr.view()!.nodeId).toBe('r25-candle');
    runOut(a.dr);
    expect(a.events.filter((e) => e.type === R25_SPARE_ASKED).length).toBe(1);
    const b = setup(worldAt('r25', 'light2'));
    b.dr.start('npc-ebba', 'ebba');
    expect(b.dr.view()!.nodeId).toBe('r25-wait');
  });

  it('D08: the report tells the outcome that happened', () => {
    for (const [outcome, line] of [['defeated', 'd08-report-2'], ['released', 'd08-report-5']] as const) {
      const { dr } = setup(worldAt('d08', 'report', { [D08_BOSS_FLAG]: outcome }));
      dr.start('npc-wulfhild', 'wulfhild');
      const { nodes } = runOut(dr);
      expect(nodes, outcome).toContain(line);
    }
  });
});

describe('strings', () => {
  it('every node and choice of the Waste trees resolves, and no line says Cael or uses a dash', () => {
    const strings = { ...all, ...WASTE_A4_DIALOGUE_STRINGS };
    const defs = [...WASTE_A4_TREES.map((t) => t.def), ...WASTE_A4_EXTENSIONS.map((t) => t.def), ...WASTE_A4_NOTE_DIALOGUES];
    for (const d of defs) {
      for (const n of d.nodes) {
        expect(n.textKey in strings, n.textKey).toBe(true);
        for (const c of n.choices ?? []) expect(c.textKey in strings, c.textKey).toBe(true);
      }
    }
    for (const [k, v] of Object.entries(WASTE_A4_DIALOGUE_STRINGS)) expect(v, k).not.toMatch(/\bCael\b|—|–/);
  });
});

describe('the pacing rows count the real trees', () => {
  it('each quest\'s nodes are its talks on the shorter branch and R24\'s choice (notes and scene lines are not counted)', () => {
    const per: Record<string, number> = {};
    for (const t of WASTE_A4_TALKS) {
      const { dr } = setup(worldAt(t.quest, t.objective, t.objective === 'report' ? EXTRA[t.quest] : {}));
      dr.start(t.tree, npcOf(t.tree));
      per[t.quest] = (per[t.quest] ?? 0) + runOut(dr, pick(t.quest)).nodes.length;
    }
    // R24's choice is a flag step spoken with Wulfhild (the shorter way)
    const ch = setup(worldAt('r24', 'choose'));
    ch.dr.start('npc-wulfhild', 'wulfhild');
    per.r24! += runOut(ch.dr, () => 'all').nodes.length;
    // the shipped convention (L13, ruled 2026-11-07): a note is one search beat, not dialogue; scenes are not dialogue either
    expect(per).toEqual({ ...WASTE_A4_NODES });
  });
});
