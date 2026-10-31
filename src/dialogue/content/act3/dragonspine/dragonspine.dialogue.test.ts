// The lower Dragonspine dialogue on the real runner: every talk objective's dialogue opens on the right segment, the briefs start
// their quests, the two choices (R15 lodge or hut, R16 give or keep) write their flags and favour once, "reset haul" is offered
// only while a sled is out, and every string resolves.
import { describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../../DialogueRunner';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, StatePort, StringsPort } from '../../../../quests/ports';
import type { FlagValue, QuestState } from '../../../../quests/types';
import { dialogueDefs } from '../../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { ACT3_DIRECT, DRAGONSPINE_OPEN_FLAG } from '../../../../quests/act3Jump';
import { DRAGONSPINE_QUEST_DEFS } from '../../../../quests/content/act3/dragonspine/dragonspine.content';
import { DRAGONSPINE_TALKS } from './talks';
import { DRAGONSPINE_DIALOGUES, DRAGONSPINE_DIALOGUE_STRINGS } from './index';
import { R15_CHOICE, R15_SLEDS, R15_HAUL_ID, R15_SCENE, R15_SCENE_NPC } from '../../../../quests/content/act3/dragonspine/r15.quest';
import { R16_CAVE_NPC, R16_CHOICE, R16_FAVOURED, R16_KEEP_FAVOUR } from '../../../../quests/content/act3/dragonspine/r16.quest';
import { HAUL_OUT } from './thorgar.dialogue';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const hasKey = (k: string) => k in all;
const GATE = 'story.gate.a3';
const OPEN = DRAGONSPINE_OPEN_FLAG;

interface World { states?: Record<string, QuestState>; done?: Record<string, string[]>; flags?: Record<string, FlagValue> }

function setup(w: World = {}) {
  const flags = new Map<string, FlagValue>(Object.entries(w.flags ?? {}));
  const favours: Array<[string, number]> = [];
  const events: Array<{ type: string; payload: any }> = [];
  const started: string[] = [];
  const bus: BusPort = { on: () => () => {}, emit: (type, payload) => { events.push({ type, payload }); } };
  const state: StatePort = {
    getFlag: (k) => flags.get(k), setFlag: (k, v) => { flags.set(k, v); }, clearFlag: (k) => { flags.delete(k); },
    favourBand: () => 'banked', favour: () => 30, addFavour: (t, d) => { favours.push([t, d]); return d; },
  };
  const quests = {
    state: (q: string) => w.states?.[q] ?? 'inactive',
    objectiveDone: (q: string, o: string) => w.done?.[q]?.includes(o) ?? false,
    start: (q: string) => { started.push(q); return true; }, complete: () => true, completeObjective: () => true,
  };
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test' });
  const strings: StringsPort = { t: (k, p) => (all[k] ?? `[[${k}]]`).replace('{name}', String(p?.name ?? 'Ser')), has: hasKey };
  const dr = new DialogueRunner({ bus, state, quests: quests as never, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  return { flags, favours, events, started, dr };
}

/** Runs the open dialogue to its end, choosing by id when a choice id is given, else the first visible one. */
function runOut(dr: DialogueRunner, pick: (ids: string[]) => string | undefined = () => undefined): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 80 && dr.isOpen; i++) {
    const v = dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) {
      const id = pick(v.choices.map((c) => c.id));
      dr.choose((v.choices.find((c) => c.id === id) ?? v.choices[0]!).number);
    } else dr.advance();
  }
  return seen;
}

/** The world in which `quest`.`objective` is the current step (a brief is offered: the quest not begun, its parents done). */
function worldAt(quest: string, objective: string): World {
  const def = DRAGONSPINE_QUEST_DEFS.find((d) => d.id === quest)!;
  const i = def.objectives.findIndex((o) => o.id === objective);
  if (i === 0) {
    const states: Record<string, QuestState> = {};
    for (const p of ACT3_DIRECT[quest] ?? []) states[p] = 'completed';
    // Thorgar offers R15 first; R18 is his next job once R15 is done (or from the R15 wait menu, tested below)
    if (quest === 'r18') states.r15 = 'completed';
    return { states, flags: { [GATE]: true, [OPEN]: true } };
  }
  return { states: { [quest]: 'active' }, done: { [quest]: def.objectives.slice(0, i).map((o) => o.id) }, flags: { [GATE]: true, [OPEN]: true } };
}

describe('every talk objective opens its own segment', () => {
  it.each(DRAGONSPINE_TALKS.map((t) => [`${t.quest}.${t.objective}`, t] as const))('%s', (_n, t) => {
    const w = worldAt(t.quest, t.objective);
    const { dr, started } = setup(w);
    expect(dr.start(t.tree, t.tree.startsWith('scene-') ? `scene.${t.tree.slice(6)}` : t.tree.replace('npc-', ''))).toBe(true);
    expect(dr.view()!.nodeId).toBe(t.seg);
    const seen = runOut(dr, (ids) => (ids.includes('accept') ? 'accept' : ids.includes('give') ? 'give' : ids.includes('lodge') ? 'lodge' : undefined));
    expect(dr.isOpen).toBe(false);
    expect(seen.length).toBeGreaterThan(1);
    if (t.objective === 'brief') expect(started).toEqual([t.quest]);
  });

  it('every talk objective of the seven quests has a row (scenes and NPC talks both)', () => {
    for (const q of DRAGONSPINE_QUEST_DEFS) {
      for (const o of q.objectives.filter((x) => x.type === 'talk')) {
        expect(DRAGONSPINE_TALKS.some((t) => t.quest === q.id && t.objective === o.id), `${q.id}.${o.id}`).toBe(true);
      }
    }
  });
});

describe('M28 is offered only with the Dragonspine open', () => {
  it('Thorgar does not open the brief on the Act 3 gate alone, and does with the phase flag too', () => {
    const w = worldAt('m28', 'brief');
    const shut = setup({ ...w, flags: { [GATE]: true } });
    shut.dr.start('npc-thorgar', 'thorgar');
    expect(shut.dr.view()?.nodeId).not.toBe('m28-brief');
    const open = setup(w);
    open.dr.start('npc-thorgar', 'thorgar');
    expect(open.dr.view()!.nodeId).toBe('m28-brief');
  });
});

describe('R15: the lodge or the hut', () => {
  it.each([['lodge'], ['hut']])('choosing %s writes the flag and nothing else (no favour)', (pick) => {
    const { dr, flags, favours } = setup({ ...worldAt('r15', 'choice') });
    dr.start(R15_SCENE, R15_SCENE_NPC);
    runOut(dr, (ids) => (ids.includes(pick) ? pick : undefined));
    expect(flags.get(R15_CHOICE)).toBe(pick);
    expect(favours).toEqual([]);
  });

  it('a made choice cannot be flipped by running the scene again', () => {
    const { dr, flags } = setup({ ...worldAt('r15', 'choice'), flags: { [GATE]: true, [R15_CHOICE]: 'hut' } });
    dr.start(R15_SCENE, R15_SCENE_NPC);
    const ids: string[][] = [];
    runOut(dr, (c) => { ids.push(c); return undefined; });
    expect(ids.flat()).not.toContain('lodge');
    expect(flags.get(R15_CHOICE)).toBe('hut');
  });
});

describe('R16: give or keep', () => {
  const choose = (pick: 'give' | 'keep', again = false) => {
    const w = worldAt('r16', 'choice');
    const t = setup(again ? { ...w, flags: { ...w.flags, [R16_FAVOURED]: true } } : w);
    t.dr.start('npc-eadgyth', 'eadgyth');
    runOut(t.dr, (ids) => (ids.includes(pick) ? pick : undefined));
    return t;
  };
  it('give: the flag, no favour in PR 1 (M32 pays it)', () => {
    const t = choose('give');
    expect(t.flags.get(R16_CHOICE)).toBe('give');
    expect(t.favours).toEqual([]);
    expect(t.flags.get(R16_FAVOURED)).toBeUndefined();
  });
  it('keep: the flag and the dragons lose 4, once', () => {
    const t = choose('keep');
    expect(t.flags.get(R16_CHOICE)).toBe('keep');
    expect(t.favours).toEqual([['dragons', R16_KEEP_FAVOUR]]);
    expect(R16_KEEP_FAVOUR).toBe(-4);
    expect(t.flags.get(R16_FAVOURED)).toBe(true);
    // a second keep (a replayed scene, a reload) costs nothing
    const again = choose('keep', true);
    expect(again.favours).toEqual([]);
  });
  it('the other branch is not offered once one is made', () => {
    const w = worldAt('r16', 'choice');
    const { dr } = setup({ ...w, flags: { ...w.flags, [R16_CHOICE]: 'keep' } });
    dr.start('npc-eadgyth', 'eadgyth');
    const offered: string[] = [];
    runOut(dr, (ids) => { offered.push(...ids); return undefined; });
    expect(offered).not.toContain('give');
  });
  it('the cave lines scene starts and ends', () => {
    const { dr } = setup(worldAt('r16', 'lines'));
    expect(dr.start('scene-r16-cave', R16_CAVE_NPC)).toBe(true);
    runOut(dr);
    expect(dr.isOpen).toBe(false);
  });
});

describe('R18 can be taken while R15 is under way', () => {
  it("Thorgar's R15 wait menu offers the other work and the brief starts R18", () => {
    const { dr, started } = setup({ states: { m28: 'completed', r15: 'active' }, done: { r15: ['brief'] }, flags: { [GATE]: true } });
    dr.start('npc-thorgar', 'thorgar');
    expect(dr.view()!.nodeId).toBe('r15-wait');
    dr.advance();
    dr.choose(dr.view()!.choices.find((c) => c.id === 'eggs')!.number);
    expect(dr.view()!.nodeId).toBe('r18-brief');
    runOut(dr, (ids) => (ids.includes('accept') ? 'accept' : undefined));
    expect(started).toContain('r18');
  });
});

describe('"reset haul"', () => {
  const choicesOf = (w: World) => {
    const t = setup(w);
    t.dr.start('npc-thorgar', 'thorgar');
    const offered: string[] = [];
    // walk the idle tree to its menu
    for (let i = 0; i < 12 && t.dr.isOpen; i++) {
      const v = t.dr.view()!;
      if (v.choices.length) { offered.push(...v.choices.map((c) => c.id)); break; }
      t.dr.advance();
    }
    return { ...t, offered };
  };
  it('is offered while a sled is out and sends K7 the id of that sled', () => {
    for (const sled of R15_SLEDS) {
      const t = choicesOf({ states: { m28: 'completed', r15: 'active' }, done: { r15: ['brief', 'hand1', 'hand2'] }, flags: { [GATE]: true, [HAUL_OUT]: true, [R15_HAUL_ID]: sled } });
      expect(t.offered).toContain('reset');
      const v = t.dr.view()!;
      t.dr.choose(v.choices.find((c) => c.id === 'reset')!.number);
      expect(t.events.filter((e) => e.type === 'npc.carry.resetHaul').map((e) => e.payload)).toEqual([{ id: sled }]);
    }
  });
  it('is not offered with no sled out', () => {
    const t = choicesOf({ states: { m28: 'completed', r15: 'active' }, done: { r15: ['brief', 'hand1', 'hand2'] }, flags: { [GATE]: true } });
    expect(t.offered).not.toContain('reset');
  });
});

describe('strings', () => {
  it('every dialogue node and choice of the seven resolves, and nothing says Cael', () => {
    const strings = { ...all, ...DRAGONSPINE_DIALOGUE_STRINGS };
    for (const d of DRAGONSPINE_DIALOGUES) {
      for (const n of d.nodes) {
        expect(n.textKey in strings, n.textKey).toBe(true);
        for (const c of n.choices ?? []) expect(c.textKey in strings, c.textKey).toBe(true);
      }
    }
    for (const [k, v] of Object.entries(DRAGONSPINE_DIALOGUE_STRINGS)) expect(v, k).not.toMatch(/Cael|—|–/);
  });
});
