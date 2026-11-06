// The Harrowmark Act 4 quest dialogue on the real runner: every talk objective's dialogue opens on its own segment in the state
// where that objective is current, the briefs start their quests, the choices write their flags and favour once, the bribe
// spends its gold, and every string resolves.
import { describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../../DialogueRunner';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, StatePort, StringsPort } from '../../../../quests/ports';
import type { FlagValue, QuestState } from '../../../../quests/types';
import { dialogueDefs } from '../../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { HARROWMARK_A4_QUEST_DEFS } from '../../../../quests/content/act4/harrowmark/harrowmark.content';
import { R20_AT, R20_BRIBE, R20_BRIBE_BANKED, R20_CHOICE, R20_PASSED, R20_SERGEANT } from '../../../../quests/content/act4/harrowmark/r20.quest';
import { R19_CAPTAINS, R19_CHOICE, R19_MUSTER, R19_PAIRS } from '../../../../quests/content/act4/harrowmark/r19.quest';
import { R21_CHOICE } from '../../../../quests/content/act4/harrowmark/r21.quest';
import { R22_CHOICE } from '../../../../quests/content/act4/harrowmark/r22.quest';
import { R23_CHOICE } from '../../../../quests/content/act4/harrowmark/r23.quest';
import { HARROWMARK_A4_TALKS } from './talks';
import { SCENE_M39_BREATH, SCENE_M40_JUNCTIONS } from './council.dialogue';
import { SCENE_M38_BETRAYAL, SCENE_M39_FALL, SCENE_M41_CAMP } from '../../../../quests/content/act4/harrowmark/scenes';
import { HARROWMARK_A4_NODES } from '../../../../quests/content/act4/harrowmark/pacing';
import { HARROWMARK_A4_DIALOGUE_STRINGS, HARROWMARK_A4_EXTENSIONS, HARROWMARK_A4_NOTE_DIALOGUES, HARROWMARK_A4_TREES } from './index';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const GATE = 'story.gate.a4';
const DEFS = Object.fromEntries(HARROWMARK_A4_QUEST_DEFS.map((q) => [q.id, q]));

interface World { states?: Record<string, QuestState>; done?: Record<string, string[]>; flags?: Record<string, FlagValue>; gold?: number }

function setup(w: World = {}) {
  const flags = new Map<string, FlagValue>(Object.entries({ [GATE]: true, ...w.flags }));
  const favours: Array<[string, number]> = [];
  const events: Array<{ type: string; payload: any }> = [];
  const started: string[] = [];
  const spent: number[] = [];
  let gold = w.gold ?? 0;
  const bus: BusPort = { on: () => () => {}, emit: (type, payload) => { events.push({ type, payload }); } };
  const state: StatePort = {
    getFlag: (k) => flags.get(k), setFlag: (k, v) => { flags.set(k, v); }, clearFlag: (k) => { flags.delete(k); },
    favourBand: (t) => (t === 'oswin' && flags.get('test.banked') ? 'banked' : 'neutral') as never, favour: () => 0,
    addFavour: (t, d) => { favours.push([t, d]); return d; },
  };
  const quests = {
    state: (q: string) => w.states?.[q] ?? 'inactive',
    objectiveDone: (q: string, o: string) => w.done?.[q]?.includes(o) ?? false,
    start: (q: string) => { started.push(q); return true; }, complete: () => true, completeObjective: () => true,
  };
  const inventory = { get gold() { return gold; }, takeGold: (n: number) => { gold -= n; spent.push(n); return n; }, addGold: (n: number) => { gold += n; } };
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test', inventory: () => inventory } as never);
  const strings: StringsPort = { t: (k, p) => (all[k] ?? `[[${k}]]`).replace('{name}', String(p?.name ?? 'Ser')), has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests: quests as never, effects, strings, gold: () => gold });
  for (const d of dialogueDefs) dr.register(d);
  return { flags, favours, events, started, spent, dr, gold: () => gold };
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

const PREFER = ['accept', 'muster', 'ledger', 'page', 'letters', 'light', 'public', 'leaders', 'force', 'fight'];
const preferred = (ids: string[]) => PREFER.find((p) => ids.includes(p));

/** The world in which `quest`.`objective` is the current step (a brief: the quest not begun, its parents done). */
function worldAt(quest: string, objective: string, flags: Record<string, FlagValue> = {}): World {
  const def = DEFS[quest]!;
  const i = def.objectives.findIndex((o) => o.id === objective);
  const base: Record<string, FlagValue> = { ...(quest === 'd07' ? { 'story.r23.crucible': true } : {}), ...flags };
  // M39 and M41 are started by the director when the quest before them completes; their first step is current at once
  if (i === 0 && !DIRECTOR_STARTED.has(quest)) return { states: BRIEF_PARENTS[quest]!, flags: base };
  if (i === 0) return { states: { ...BRIEF_PARENTS[quest]!, [quest]: 'active' }, flags: base };
  return { states: { ...(BRIEF_PARENTS[quest] ?? {}), m35: 'completed', m36: 'completed', [quest]: 'active' }, done: { [quest]: def.objectives.slice(0, i).map((o) => o.id) }, flags: base };
}
const PHASE_G_BEFORE_COUNCIL = ['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07', 'm37'];
const done = (...ids: string[]): Record<string, QuestState> => Object.fromEntries(ids.map((q) => [q, 'completed' as QuestState]));
/** The quests done when each brief is first offered (each quest's start rule; R23 waits on D07's crucible flag). */
const BRIEF_PARENTS: Record<string, Record<string, QuestState>> = {
  m35: {}, m36: done('m35'), r19: done('m35'), r22: done('m35'), r23: done('m35'), r20: done('m35', 'm36'), r21: done('m35', 'm36'),
  d07: done('m35', 'r23'), m37: done('m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07'),
  m38: done(...PHASE_G_BEFORE_COUNCIL), m39: done(...PHASE_G_BEFORE_COUNCIL, 'm38'), m40: done(...PHASE_G_BEFORE_COUNCIL, 'm38', 'm39'),
  m41: done(...PHASE_G_BEFORE_COUNCIL, 'm38', 'm39', 'm40'),
};
const DIRECTOR_STARTED = new Set(['m39', 'm41']);
const npcOf = (tree: string) => (tree.startsWith('scene-') ? `scene.${tree.slice(6).replace(/-/g, '.')}` : tree.replace('npc-', ''));

describe('every talk objective opens its own segment', () => {
  it.each(HARROWMARK_A4_TALKS.map((t) => [`${t.quest}.${t.objective} (${t.tree})`, t] as const))('%s', (_n, t) => {
    const extra: Record<string, FlagValue> = t.objective !== 'report' ? {} : t.quest === 'r20' ? { [R20_CHOICE]: 'force' } : t.quest === 'r23' ? { [R23_CHOICE]: 'public' } : {};
    const { dr, started } = setup({ ...worldAt(t.quest, t.objective, extra), gold: 500 });
    expect(dr.start(t.tree, npcOf(t.tree))).toBe(true);
    expect(dr.view()!.nodeId).toBe(t.seg);
    const { nodes } = runOut(dr, preferred);
    expect(dr.isOpen).toBe(false);
    expect(nodes.length).toBeGreaterThan(1);
    if (t.objective === 'brief') expect(started).toEqual([t.quest]);
  });

  it('every talk objective of the nine quests has a row', () => {
    for (const q of HARROWMARK_A4_QUEST_DEFS) {
      for (const o of q.objectives.filter((x) => x.type === 'talk')) {
        expect(HARROWMARK_A4_TALKS.some((t) => t.quest === q.id && t.objective === o.id), `${q.id}.${o.id}`).toBe(true);
      }
    }
  });

  it('with no Harrowmark quest offered or under way, the extended trees open on their shipped lines', () => {
    for (const e of HARROWMARK_A4_EXTENSIONS) {
      const { dr } = setup({ flags: { [GATE]: false } });
      if (!dr.start(e.def.id, npcOf(e.def.id))) continue;
      expect(dr.view()!.nodeId.startsWith('a4-'), e.def.id).toBe(false);
    }
  });
});

describe('the choices write their flag once', () => {
  it('R20: each of Merrin\'s three ways sets the choice', () => {
    for (const way of ['bribe', 'stealth', 'force']) {
      const { dr, flags } = setup(worldAt('r20', 'brief'));
      dr.start('npc-merrin', 'merrin');
      runOut(dr, (ids) => (ids.includes('accept') ? 'accept' : ids.includes(way) ? way : undefined));
      expect(flags.get(R20_CHOICE)).toBe(way);
    }
  });

  it('R20: a brief cut off between accept and the way is asked again, and only until a way is set', () => {
    const cut = setup({ states: { m35: 'completed', m36: 'completed', r20: 'active' }, done: { r20: ['brief'] } });
    cut.dr.start('npc-merrin', 'merrin');
    expect(cut.dr.view()!.nodeId).toBe('a4-r20-way');
    runOut(cut.dr, (ids) => (ids.includes('stealth') ? 'stealth' : undefined));
    expect(cut.flags.get(R20_CHOICE)).toBe('stealth');
    const set = setup({ states: { m35: 'completed', m36: 'completed', r20: 'active' }, done: { r20: ['brief'] }, flags: { [R20_CHOICE]: 'force' } });
    set.dr.start('npc-merrin', 'merrin');
    expect(set.dr.view()!.nodeId).not.toBe('a4-r20-way');
    expect(runOut(set.dr).offered).not.toContain('bribe');
  });

  it('R20 bribe: a sergeant takes the price once, and the banked price with Oswin banked', () => {
    const cases: Array<[boolean, number, string]> = [[false, R20_BRIBE, 'pay'], [true, R20_BRIBE_BANKED, 'banked']];
    for (const [banked, price, pick] of cases) {
      const w = worldAt('r20', 'cp1', { [R20_CHOICE]: 'bribe', [R20_AT(1)]: true, ...(banked ? { 'test.banked': true } : {}) });
      const t = setup({ ...w, gold: 400 });
      t.dr.start(`npc-${R20_SERGEANT(1)}`, R20_SERGEANT(1));
      runOut(t.dr, (ids) => (ids.includes(pick) ? pick : undefined));
      expect(t.spent).toEqual([price]);
      expect(t.flags.get(R20_PASSED(1))).toBe(true);
    }
  });

  it('R20 bribe: without the gold the sergeant waits and nothing is spent', () => {
    const t = setup({ ...worldAt('r20', 'cp1', { [R20_CHOICE]: 'bribe', [R20_AT(1)]: true }), gold: 10 });
    t.dr.start(`npc-${R20_SERGEANT(1)}`, R20_SERGEANT(1));
    const { offered } = runOut(t.dr);
    expect(offered).not.toContain('pay');
    expect(t.spent).toEqual([]);
    expect(t.flags.get(R20_PASSED(1))).toBeUndefined();
  });

  it('R20 bribe: before the cart is parked short of the post, the sergeant only hails (no bargain, no gold)', () => {
    const t = setup({ ...worldAt('r20', 'cp1', { [R20_CHOICE]: 'bribe' }), gold: 400 });
    t.dr.start(`npc-${R20_SERGEANT(1)}`, R20_SERGEANT(1));
    expect(t.dr.view()!.nodeId).toBe('post');
    expect(runOut(t.dr).offered).toEqual([]);
    expect(t.spent).toEqual([]);
  });

  it('R19: a captain musters and the flag is set', () => {
    const c = R19_CAPTAINS[0]!;
    const t = setup(worldAt('r19', c.id));
    t.dr.start(`npc-${c.npc}`, c.npc);
    runOut(t.dr, (ids) => (ids.includes('muster') ? 'muster' : undefined));
    expect(t.flags.get(R19_MUSTER(c.id))).toBe(true);
  });

  it.each(R19_PAIRS.map((p) => [p]))('R19 report: Wystan names the %s pair (every pair has its own line)', (pair) => {
    const t = setup(worldAt('r19', 'report', { [R19_CHOICE]: pair }));
    t.dr.start('npc-wystan', 'wystan');
    const seen = runOut(t.dr).nodes;
    const others = R19_PAIRS.filter((x) => x !== pair);
    const keys = (dialogueDefs.find((d) => d.id === 'npc-wystan')!.nodes.filter((n) => seen.includes(n.id)).map((n) => JSON.stringify(n.when ?? null)));
    expect(keys.filter((w) => w.includes(`"${pair}"`))).toHaveLength(1);
    for (const o of others) expect(keys.some((w) => w.includes(`"${o}"`)), o).toBe(false);
  });

  it('R21: leaders or all, with favour once', () => {
    const lead = setup(worldAt('r21', 'brief'));
    lead.dr.start('npc-wenna', 'wenna');
    runOut(lead.dr, (ids) => (ids.includes('leaders') ? 'leaders' : undefined));
    expect(lead.flags.get(R21_CHOICE)).toBe('leaders');
    expect(lead.favours).toEqual([['grisel', 2]]);
    const every = setup(worldAt('r21', 'brief'));
    every.dr.start('npc-wenna', 'wenna');
    runOut(every.dr, (ids) => (ids.includes('all') ? 'all' : undefined));
    expect(every.flags.get(R21_CHOICE)).toBe('all');
    expect(every.favours).toEqual([['grisel', 6]]);
  });

  it('R22: the blade is chosen at the forge', () => {
    for (const b of ['light', 'heavy']) {
      const t = setup(worldAt('r22', 'choose'));
      t.dr.start('npc-dunstan', 'dunstan');
      runOut(t.dr, (ids) => (ids.includes(b) ? b : undefined));
      expect(t.flags.get(R22_CHOICE)).toBe(b);
    }
  });

  it('R23: public or private, with their favour; a made choice is not offered again', () => {
    const pub = setup(worldAt('r23', 'choose'));
    pub.dr.start('npc-rook', 'rook');
    runOut(pub.dr, (ids) => (ids.includes('public') ? 'public' : undefined));
    expect(pub.flags.get(R23_CHOICE)).toBe('public');
    expect(pub.favours).toEqual([['halvard', 5], ['oswin', -2]]);
    const priv = setup(worldAt('r23', 'choose'));
    priv.dr.start('npc-rook', 'rook');
    runOut(priv.dr, (ids) => (ids.includes('private') ? 'private' : undefined));
    expect(priv.flags.get(R23_CHOICE)).toBe('private');
    expect(priv.favours).toEqual([['oswin', 4]]);
    const again = setup(worldAt('r23', 'expose', { [R23_CHOICE]: 'private' }));
    again.dr.start('npc-rook', 'rook');
    expect(again.dr.view()!.nodeId).toBe('a4-r23-wait');
    expect(runOut(again.dr).offered).not.toContain('public');
  });
});

describe('strings', () => {
  it('every node and choice of the Harrowmark trees resolves, and no line says Cael or uses a dash', () => {
    const strings = { ...all, ...HARROWMARK_A4_DIALOGUE_STRINGS };
    const defs = [...HARROWMARK_A4_TREES.map((t) => t.def), ...HARROWMARK_A4_EXTENSIONS.map((t) => t.def), ...HARROWMARK_A4_NOTE_DIALOGUES];
    for (const d of defs) {
      for (const n of d.nodes) {
        expect(n.textKey in strings, n.textKey).toBe(true);
        for (const c of n.choices ?? []) expect(c.textKey in strings, c.textKey).toBe(true);
      }
    }
    for (const [k, v] of Object.entries(HARROWMARK_A4_DIALOGUE_STRINGS)) expect(v, k).not.toMatch(/\bCael\b|—|–/);
  });
});

describe('the pacing rows count the real trees', () => {
  it('each quest\'s nodes are its talks on the shorter branch plus the lines of the notes it reads', () => {
    const per: Record<string, number> = {};
    for (const t of HARROWMARK_A4_TALKS) {
      const extra: Record<string, FlagValue> = t.objective !== 'report' ? {} : t.quest === 'r20' ? { [R20_CHOICE]: 'force' } : t.quest === 'r23' ? { [R23_CHOICE]: 'public' } : {};
      const { dr } = setup({ ...worldAt(t.quest, t.objective, extra), gold: 500 });
      dr.start(t.tree, npcOf(t.tree));
      per[t.quest] = (per[t.quest] ?? 0) + runOut(dr, preferred).nodes.length;
    }
    const notes = new Map(HARROWMARK_A4_NOTE_DIALOGUES.map((d) => [d.id, d.nodes.length]));
    for (const q of HARROWMARK_A4_QUEST_DEFS) {
      for (const o of q.objectives) {
        const m = o.type === 'event' && o.target === 'dialogue.ended' ? (o.match as { npcId?: string[] } | undefined)?.npcId ?? [] : [];
        for (const id of m) per[q.id] = (per[q.id] ?? 0) + (notes.get(id) ?? 0);
      }
    }
    // the talks no objective names (Gaut between the waves, Edric at the three junctions) and the sequencer scenes' lines
    const lines = (d: { steps: readonly object[] }) => d.steps.filter((x) => 'line' in x).length;
    per.m38! += lines(SCENE_M38_BETRAYAL);
    per.m39! += SCENE_M39_BREATH.def.nodes.length + lines(SCENE_M39_FALL);
    per.m40! += SCENE_M40_JUNCTIONS.reduce((n, t) => n + t.def.nodes.length, 0);
    per.m41! += lines(SCENE_M41_CAMP);
    expect(per).toEqual({ ...HARROWMARK_A4_NODES });
  });
});
