// The Rim trees on the real DialogueRunner: every talk objective opens its own segment in the state it is current in (each
// quest's `at` rule); briefs start their quest on accept; the R26 master's choice writes the road and Oswin's favour once;
// shipped trees open on their own lines outside Act 5; strings resolve with no dash and no literal player name; the pacing rows'
// node counts are the real trees'.
import { describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../../DialogueRunner';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, StatePort, StringsPort } from '../../../../quests/ports';
import type { Condition, FlagValue, QuestState } from '../../../../quests/types';
import { dialogueDefs } from '../../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { RIM_A5_QUEST_DEFS } from '../../../../quests/content/act5/rim/rim.content';
import { R26_CHOICE, R26_FAST, R26_LONG, R26_MASTER } from '../../../../quests/content/act5/rim/r26.quest';
import { M49_FORECAST, M49_TABLE_DIALOGUE, M49_TABLE_NPC } from '../../../../quests/content/act5/rim/m49.quest';
import { M52_STOOD, M52_WOUNDED } from '../../../../quests/content/act5/rim/m52.quest';
import { RIM_A5_NODES } from '../../../../quests/content/act5/rim/pacing';
import { RIM_A5_TALKS } from './talks';
import { RIM_A5_DIALOGUE_STRINGS, RIM_A5_EXTENSIONS, RIM_A5_NOTE_DIALOGUES, RIM_A5_TREES } from './index';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const DEFS = Object.fromEntries(RIM_A5_QUEST_DEFS.map((q) => [q.id, q]));

interface World { states?: Record<string, QuestState>; done?: Record<string, string[]>; flags?: Record<string, FlagValue> }

function setup(w: World = {}) {
  const flags = new Map<string, FlagValue>(Object.entries({ 'story.gate.a5': true, ...w.flags }));
  const favours: Array<[string, number]> = [];
  const started: string[] = [];
  const bus: BusPort = { on: () => () => {}, emit: () => {} };
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
  return { flags, favours, started, dr };
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
const CAMP = done('m47', 'm48', 'm49');
/** The quests done when each brief is first offered (each quest's start rule). */
const PARENTS: Record<string, Record<string, QuestState>> = { m47: {}, m48: done('m47'), m49: done('m47', 'm48'), r26: CAMP, r29: CAMP, m50: CAMP, m51: CAMP, m52: done('m47', 'm48', 'm49', 'm50', 'm51', 'r26') };
/** M47 starts by itself on the Act 5 gate: its first talk is a step, not a brief. */
const AUTO = new Set(['m47']);

/** The flags a `when` asks for (every flag test inside `all`, set to the value it wants). */
function flagsFor(c: Condition | undefined, out: Record<string, FlagValue> = {}): Record<string, FlagValue> {
  const x = c as { all?: Condition[]; flag?: string; equals?: FlagValue } | undefined;
  if (!x) return out;
  if (x.all) for (const y of x.all) flagsFor(y, out);
  else if (x.flag && x.equals !== undefined) out[x.flag] = x.equals;
  return out;
}

/** The world in which `quest`.`objective` is the current step (a brief: the quest not begun, its parents done). */
function worldAt(quest: string, objective: string, npc?: string): World {
  const def = DEFS[quest]!;
  const i = def.objectives.findIndex((o) => o.id === objective);
  if (i === 0 && !AUTO.has(quest)) return { states: PARENTS[quest]! };
  // the steps before, except the other road's optional ones
  const before = def.objectives.slice(0, i).filter((o) => !o.optional).map((o) => o.id);
  // M52's wounded talk is the companion N4 sat out (`siege.m52.wounded` holds their id)
  const extra: Record<string, FlagValue> = quest === 'm52' && objective === 'wounded' && npc ? { [M52_WOUNDED]: npc } : {};
  return { states: { ...PARENTS[quest]!, [quest]: 'active' }, done: { [quest]: before }, flags: { ...flagsFor(def.objectives[i]!.when), ...extra } };
}
const pick = (quest: string) => (ids: string[]) => (ids.includes('accept') ? 'accept' : ids.includes(quest) ? quest : undefined);
const isBrief = (quest: string, objective: string): boolean => DEFS[quest]!.objectives[0]!.id === objective && !AUTO.has(quest);

describe('every talk objective opens its own segment', () => {
  it.each(RIM_A5_TALKS.map((t) => [`${t.quest}.${t.objective} (${t.tree})`, t] as const))('%s', (_n, t) => {
    const { dr, started } = setup(worldAt(t.quest, t.objective, t.npc));
    expect(dr.start(t.tree, t.npc)).toBe(true);
    expect(dr.view()!.nodeId).toBe(t.seg);
    runOut(dr, pick(t.quest));
    expect(dr.isOpen).toBe(false);
    if (isBrief(t.quest, t.objective)) expect(started).toEqual([t.quest]);
  });

  // the four camp quests run side by side: another one under way must not hide this one's step behind its wait line
  const SIDE = ['r26', 'r29', 'm50', 'm51'];
  it.each(RIM_A5_TALKS.filter((t) => SIDE.includes(t.quest) && !isBrief(t.quest, t.objective)).map((t) => [`${t.quest}.${t.objective}`, t] as const))('%s with the other camp quests under way', (_n, t) => {
    const w = worldAt(t.quest, t.objective, t.npc);
    for (const q of SIDE) if (q !== t.quest) w.states![q] = 'active';
    const { dr } = setup(w);
    expect(dr.start(t.tree, t.npc)).toBe(true);
    expect(dr.view()!.nodeId).toBe(t.seg);
  });

  it('every talk objective of the seven quests has a row', () => {
    for (const q of RIM_A5_QUEST_DEFS) {
      for (const o of q.objectives.filter((x) => x.type === 'talk')) {
        expect(RIM_A5_TALKS.some((t) => t.quest === q.id && t.objective === o.id), `${q.id}.${o.id}`).toBe(true);
      }
    }
  });

  it('the shipped trees open on their own lines before Act 5', () => {
    for (const e of RIM_A5_EXTENSIONS) {
      const { dr } = setup({ flags: { 'story.gate.a5': false } });
      if (!dr.start(e.def.id, e.def.id.replace('npc-', ''))) continue;
      expect(dr.view()!.nodeId.startsWith('a5r-'), e.def.id).toBe(false);
    }
  });
});

describe('the choices and the forecast', () => {
  it('R26: the stairs give Oswin -3, the flank +3; each writes the road once', () => {
    for (const [way, delta] of [[R26_FAST, -3], [R26_LONG, 3]] as const) {
      const { dr, flags, favours } = setup(worldAt('r26', 'master'));
      dr.start(`npc-${R26_MASTER}`, R26_MASTER);
      runOut(dr, (ids) => (ids.includes(way) ? way : undefined));
      expect(flags.get(R26_CHOICE)).toBe(way);
      expect(favours).toEqual([['oswin', delta]]);
    }
  });

  it('the war table says what the forecast says', () => {
    const quiet = setup(worldAt('m49', 'table'));
    quiet.dr.start(M49_TABLE_DIALOGUE, M49_TABLE_NPC);
    const a = runOut(quiet.dr).nodes.length;
    const loud = setup({ ...worldAt('m49', 'table'), flags: { [M49_FORECAST('dragons')]: true, [M49_FORECAST('named')]: true } });
    loud.dr.start(M49_TABLE_DIALOGUE, M49_TABLE_NPC);
    expect(runOut(loud.dr).nodes.length).toBeGreaterThan(a);
  });
});

describe('M52', () => {
  it('Wystan\'s report says what stood: more lines when more stood', () => {
    const few = setup(worldAt('m52', 'report'));
    few.dr.start('npc-wystan', 'wystan');
    const a = runOut(few.dr).nodes;
    const many = setup({ ...worldAt('m52', 'report'), flags: { [M52_STOOD('halvard')]: true, [M52_STOOD('ashwalker')]: true, [M52_STOOD('dragons')]: true } });
    many.dr.start('npc-wystan', 'wystan');
    expect(runOut(many.dr).nodes.length).toBe(a.length + 3);
  });

  it('only the wounded companion has the aid-tent line', () => {
    for (const c of ['hrolf', 'aelfreda', 'tobb']) {
      const { dr } = setup({ ...worldAt('m52', 'wounded', 'tobb') });
      dr.start(`npc-${c}`, c);
      expect(dr.view()?.nodeId === 'a5r-m52-wounded', c).toBe(c === 'tobb');
    }
  });
});

describe('strings', () => {
  it('every node and choice of the Rim trees resolves, and no line says Cael or uses a dash', () => {
    const strings = { ...all, ...RIM_A5_DIALOGUE_STRINGS };
    const defs = [...RIM_A5_TREES.map((t) => t.def), ...RIM_A5_EXTENSIONS.map((t) => t.def), ...RIM_A5_NOTE_DIALOGUES];
    for (const d of defs) {
      for (const n of d.nodes) {
        expect(n.textKey in strings, n.textKey).toBe(true);
        for (const c of n.choices ?? []) expect(c.textKey in strings, c.textKey).toBe(true);
      }
    }
    for (const [k, v] of Object.entries(RIM_A5_DIALOGUE_STRINGS)) expect(v, k).not.toMatch(/\bCael\b|—|–/);
  });
});

describe('the pacing rows count the real trees', () => {
  it('each quest\'s nodes are its talks on the shorter branch (notes and scene lines are not counted)', () => {
    const per: Record<string, number> = {};
    // an optional talk (Maud with F4 Cleanse) is not on the shorter branch
    for (const t of RIM_A5_TALKS.filter((x) => !DEFS[x.quest]!.objectives.find((o) => o.id === x.objective)!.optional)) {
      const { dr } = setup(worldAt(t.quest, t.objective, t.npc));
      dr.start(t.tree, t.npc);
      per[t.quest] = (per[t.quest] ?? 0) + runOut(dr, pick(t.quest)).nodes.length;
    }
    expect(per).toEqual({ ...RIM_A5_NODES });
  });
});
