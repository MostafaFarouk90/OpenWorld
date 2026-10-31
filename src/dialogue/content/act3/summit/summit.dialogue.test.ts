// The summit dialogue on the real runner: every talk objective opens its own segment, the briefs start their quests, M31's after-scene follows the choice,
// M32's axe scene reads R16 both ways (the deferred +6 once), the M33 witness count is named, the extensions do not shadow the lower trees, and every string resolves.
import { describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../../DialogueRunner';
import { createEffectRunner } from '../../../../quests/effects';
import type { BusPort, StatePort, StringsPort } from '../../../../quests/ports';
import type { FlagValue, QuestState } from '../../../../quests/types';
import { dialogueDefs } from '../../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { ACT3_DIRECT } from '../../../../quests/act3Jump';
import { SUMMIT_QUEST_DEFS } from '../../../../quests/content/act3/summit/summit.content';
import { SUMMIT_TALKS } from './talks';
import { SUMMIT_TREES, SUMMIT_EXTENSIONS } from './index';
import { r15, R15_HAUL_ID, R15_SLEDS } from '../../../../quests/content/act3/dragonspine/r15.quest';
import { r18 } from '../../../../quests/content/act3/dragonspine/r18.quest';
import { HAUL_OUT } from '../dragonspine/thorgar.dialogue';
import { R16_CHOICE } from '../../../../quests/content/act3/dragonspine/r16.quest';
import { M31_AFTER_SCENE, M31_CHOICE, M31_GATE_MET } from '../../../../quests/content/act3/summit/m31.quest';
import { M32_AXE_FAVOUR, M32_AXE_GIVEN, M32_AXE_SCENE } from '../../../../quests/content/act3/summit/m32.quest';
import { M33_AFTERMATH_SCENE, M33_WITNESSES } from '../../../../quests/content/act3/summit/m33.quest';
import { D06_OUTCOME_SCENE, D06_SKARL_OUTCOME } from '../../../../quests/content/act3/summit/d06.quest';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const hasKey = (k: string) => k in all;

interface World { states?: Record<string, QuestState>; done?: Record<string, string[]>; flags?: Record<string, FlagValue> }

function setup(w: World = {}) {
  const flags = new Map<string, FlagValue>(Object.entries(w.flags ?? {}));
  const favours: Array<[string, number]> = [];
  const events: Array<{ type: string; payload: any }> = [];
  const started: string[] = [];
  const taken: Array<[string, number]> = [];
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
  const inventory = { has: () => true, count: () => 1, add: () => 1, remove: (id: string, n: number) => { taken.push([id, n]); return true; } };
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test', inventory: () => inventory as never });
  const strings: StringsPort = { t: (k, p) => (all[k] ?? `[[${k}]]`).replace('{name}', String(p?.name ?? 'Ser')), has: hasKey };
  const dr = new DialogueRunner({ bus, state, quests: quests as never, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  return { flags, favours, events, started, taken, dr };
}

function runOut(dr: DialogueRunner, pick: (ids: string[]) => string | undefined = () => undefined): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 120 && dr.isOpen; i++) {
    const v = dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) {
      const id = pick(v.choices.map((c) => c.id));
      dr.choose((v.choices.find((c) => c.id === id) ?? v.choices[0]!).number);
    } else dr.advance();
  }
  return seen;
}

/** Advances until a node whose choices satisfy `stop`. */
function runOutTo(dr: DialogueRunner, stop: (ids: string[]) => boolean): void {
  for (let i = 0; i < 120 && dr.isOpen; i++) {
    const v = dr.view()!;
    if (v.choices.length && stop(v.choices.map((c) => c.id))) return;
    if (v.choices.length) dr.choose(v.choices[0]!.number);
    else dr.advance();
  }
}

/** Every summit prerequisite done (the first quest's parents) so a brief is offered. */
const parentsDone = (quest: string): Record<string, QuestState> => Object.fromEntries((ACT3_DIRECT[quest] ?? []).map((p) => [p, 'completed' as QuestState]));

function worldAt(quest: string, objective: string): World {
  const def = SUMMIT_QUEST_DEFS.find((d) => d.id === quest)!;
  const i = def.objectives.findIndex((o) => o.id === objective);
  if (i === 0) return { states: parentsDone(quest) };
  const done: Record<string, string[]> = { [quest]: def.objectives.slice(0, i).map((o) => o.id) };
  const flags: Record<string, FlagValue> = {};
  if (quest === 'm31' && i > 8) flags[M31_CHOICE] = 'yielded';
  if (quest === 'm31' && objective === 'gatetalk') flags[M31_GATE_MET] = false;
  if (quest === 'd06' && objective === 'outcome') flags[D06_SKARL_OUTCOME] = 'spared';
  return { states: { [quest]: 'active' }, done, flags };
}

describe('every talk objective opens its own segment', () => {
  it.each(SUMMIT_TALKS.map((t) => [`${t.quest}.${t.objective}`, t] as const))('%s', (_n, t) => {
    const w = worldAt(t.quest, t.objective);
    if (t.quest === 'd06' && t.objective === 'report') w.flags = { ...w.flags, [D06_SKARL_OUTCOME]: 'spared' };
    if (t.quest === 'm32' && t.objective === 'axe') w.flags = { ...w.flags, [R16_CHOICE]: 'give' };
    if (t.quest === 'm33' && t.objective === 'report') w.flags = { ...w.flags, [M33_WITNESSES]: 0 };
    const { dr, started } = setup(w);
    const npc = t.tree.startsWith('scene-') ? `scene.${t.tree.slice(6)}` : t.tree.replace('npc-', '');
    expect(dr.start(t.tree, npc)).toBe(true);
    if (t.tree === 'npc-thorgar' && t.objective === 'report' && t.quest === 'm33') expect(dr.view()!.nodeId.startsWith('s33-report')).toBe(true);
    else expect(dr.view()!.nodeId).toBe(t.seg);
    const seen = runOut(dr, (ids) => (ids.includes('accept') ? 'accept' : ids.includes('give') ? 'give' : undefined));
    expect(dr.isOpen).toBe(false);
    expect(seen.length).toBeGreaterThan(1);
    if (t.objective === 'brief' || (t.quest === 'm32' && t.objective === 'speak') || (t.quest === 'm34' && t.objective === 'oath')) expect(started).toEqual([t.quest]);
  });

  it('every talk objective of the five quests has a row', () => {
    for (const q of SUMMIT_QUEST_DEFS) {
      for (const o of q.objectives.filter((x) => x.type === 'talk')) {
        expect(SUMMIT_TALKS.some((t) => t.quest === q.id && t.objective === o.id), `${q.id}.${o.id}`).toBe(true);
      }
    }
  });
});

describe('the extensions do not shadow the lower slope trees', () => {
  it("Eadgyth with nothing of the summit to say opens her lower tree's own greeting", () => {
    const base = setup({});
    base.dr.start('npc-eadgyth', 'eadgyth');
    const node = base.dr.view()!.nodeId;
    expect(node.startsWith('s3')).toBe(false);
  });
  it("Thorgar with nothing of the summit to say opens his lower tree's own greeting", () => {
    const base = setup({});
    base.dr.start('npc-thorgar', 'thorgar');
    expect(base.dr.view()!.nodeId.startsWith('s3') || base.dr.view()!.nodeId.startsWith('d06')).toBe(false);
  });
  it('the extension trees add no start rule that always holds', () => {
    for (const e of SUMMIT_EXTENSIONS) {
      const rules = e.def.start as Array<{ when: unknown }>;
      for (const r of rules) expect(JSON.stringify(r.when), e.def.id).not.toBe('{"all":[]}');
    }
  });
  it('M31 is offered at the shelter once R16 and the rest are done, and accepting starts it', () => {
    const t = setup({ states: parentsDone('m31') });
    t.dr.start('npc-eadgyth', 'eadgyth');
    expect(t.dr.view()!.nodeId).toBe('s31-offer');
    runOut(t.dr, (ids) => (ids.includes('accept') ? 'accept' : undefined));
    expect(t.started).toEqual(['m31']);
  });
  it('declining the offer starts nothing', () => {
    const t = setup({ states: parentsDone('m31') });
    t.dr.start('npc-eadgyth', 'eadgyth');
    runOut(t.dr, (ids) => (ids.includes('later') ? 'later' : undefined));
    expect(t.started).toEqual([]);
  });
  it('the gate talk sets the gate-met flag on its last line', () => {
    const t = setup(worldAt('m31', 'gatetalk'));
    t.dr.start('npc-eadgyth', 'eadgyth');
    runOut(t.dr);
    expect(t.flags.get(M31_GATE_MET)).toBe(true);
  });
});

describe('M31 after the trial', () => {
  it.each([['yielded', 16], ['won', 10]])('%s plays its own segment (%i lines)', (choice, lines) => {
    const t = setup({ states: { m31: 'active' }, flags: { [M31_CHOICE]: choice } });
    t.dr.start(M31_AFTER_SCENE, 'scene.m31.after');
    const seen = runOut(t.dr);
    expect(seen.length).toBe(lines);
  });
});

describe('M32 reads R16 both ways', () => {
  const play = (choice: string, extra: Record<string, FlagValue> = {}) => {
    const t = setup({ states: { m32: 'active' }, flags: { [R16_CHOICE]: choice, ...extra } });
    t.dr.start(M32_AXE_SCENE, 'scene.m32.axe');
    runOut(t.dr);
    return t;
  };
  it('give: dragons +6, once, the flag and the axe taken', () => {
    const t = play('give');
    expect(t.favours).toEqual([['dragons', M32_AXE_FAVOUR]]);
    expect(M32_AXE_FAVOUR).toBe(6);
    expect(t.flags.get(M32_AXE_GIVEN)).toBe(true);
    expect(t.taken).toEqual([['frostbrows-axe', 1]]);
    const again = play('give', { [M32_AXE_GIVEN]: true });
    expect(again.favours).toEqual([]);
    expect(again.taken).toEqual([]);
  });
  it('keep: a cold line, no favour, no flag, no axe taken', () => {
    const t = play('keep');
    expect(t.favours).toEqual([]);
    expect(t.flags.get(M32_AXE_GIVEN)).toBeUndefined();
    expect(t.taken).toEqual([]);
  });
  it('a missing choice flag plays the cold line and does not block the scene', () => {
    const t = setup({ states: { m32: 'active' } });
    t.dr.start(M32_AXE_SCENE, 'scene.m32.axe');
    runOut(t.dr);
    expect(t.dr.isOpen).toBe(false);
    expect(t.favours).toEqual([]);
  });
});

describe("Thorgar's summit rules leave his lower-slope tree reachable", () => {
  const m33Open = parentsDone('m33');
  const choices = (t: ReturnType<typeof setup>): string[] => t.dr.view()!.choices.map((c) => c.id);
  it('an R15 or R18 hand-in wins over the M33 brief and wait', () => {
    for (const [quest, seg] of [['r15', 'r15-report'], ['r18', 'r18-report']] as const) {
      const def = [r15, r18].find((d) => d.id === quest)!;
      const done = { [quest]: def.objectives.slice(0, -1).map((o) => o.id) };
      for (const m33 of ['inactive', 'active'] as const) {
        const t = setup({ states: { ...m33Open, [quest]: 'active', m33 }, done });
        t.dr.start('npc-thorgar', 'thorgar');
        expect(t.dr.view()!.nodeId, `${quest} with m33 ${m33}`).toBe(seg);
      }
    }
  });
  it('the M33 brief and wait offer the haul reset (R15 active) and the lodge counter', () => {
    for (const m33 of ['inactive', 'active'] as const) {
      const t = setup({ states: { ...m33Open, r15: 'active', m33 }, flags: { [HAUL_OUT]: true, [R15_HAUL_ID]: R15_SLEDS[0]! } });
      t.dr.start('npc-thorgar', 'thorgar');
      expect(t.dr.view()!.nodeId.startsWith('s33-')).toBe(true);
      runOutTo(t.dr, (ids) => ids.includes('haul'));
      expect(choices(t)).toContain('haul');
      t.dr.choose(t.dr.view()!.choices.find((c) => c.id === 'haul')!.number);
      expect(t.dr.view()!.nodeId).toBe('r15-wait');
      runOutTo(t.dr, (ids) => ids.includes('reset'));
      t.dr.choose(t.dr.view()!.choices.find((c) => c.id === 'reset')!.number);
      expect(t.events.some((e) => e.type === 'npc.carry.resetHaul')).toBe(true);
    }
  });
  it('the lodge counter (shop, smith, sockets) stays reachable through M33 and D06', () => {
    const worlds: World[] = [
      { states: { ...m33Open, m33: 'active' } },
      { states: { ...m33Open } },
      { states: { ...parentsDone('d06'), d06: 'active' }, done: { d06: [] } },
      { states: parentsDone('d06') },
    ];
    for (const w of worlds) {
      const t = setup(w);
      t.dr.start('npc-thorgar', 'thorgar');
      runOutTo(t.dr, (ids) => ids.includes('other'));
      t.dr.choose(t.dr.view()!.choices.find((c) => c.id === 'other')!.number);
      expect(t.dr.view()!.nodeId).toBe('idle');
      expect(choices(t)).toContain('trade');
    }
  });
});

describe('M33: the spared hunters are named', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('Thorgar names %i witnesses', (n) => {
    const t = setup({ states: { m33: 'active' }, done: { m33: ['brief', 'rigger', 'camp', 'anchors', 'packs', 'handler', 'flight', 'aftermath'] }, flags: n === 0 ? {} : { [M33_WITNESSES]: n } });
    t.dr.start('npc-thorgar', 'thorgar');
    expect(t.dr.view()!.nodeId).toBe(`s33-report-${n}`);
    runOut(t.dr);
  });
  it('the aftermath scene has the spared-hunter line only with a witness', () => {
    const lines = (n: number) => {
      const t = setup({ states: { m33: 'active' }, flags: n ? { [M33_WITNESSES]: n } : {} });
      t.dr.start(M33_AFTERMATH_SCENE, 'scene.m33.aftermath');
      return runOut(t.dr).length;
    };
    expect(lines(1)).toBe(lines(0) + 1);
    expect(lines(5)).toBe(lines(1));
  });
});

describe('D06: the outcome scene and the report follow Skarl', () => {
  it.each([['spared'], ['defeated']])('%s: its own segment of the outcome scene', (out) => {
    const t = setup({ states: { d06: 'active' }, flags: { [D06_SKARL_OUTCOME]: out } });
    t.dr.start(D06_OUTCOME_SCENE, 'scene.d06.outcome');
    expect(t.dr.view()!.nodeId).toBe(out);
    runOut(t.dr);
  });
  it.each([['spared', 'd06-report-spared'], ['defeated', 'd06-report-defeated']])('Thorgar reports %s', (out, seg) => {
    const w = worldAt('d06', 'report');
    const t = setup({ ...w, flags: { ...w.flags, [D06_SKARL_OUTCOME]: out } });
    t.dr.start('npc-thorgar', 'thorgar');
    expect(t.dr.view()!.nodeId).toBe(seg);
  });
});

describe('strings and names', () => {
  it('every node of the summit trees has its text, and no literal Cael or dash', () => {
    for (const t of [...SUMMIT_TREES, ...SUMMIT_EXTENSIONS]) {
      for (const n of t.def.nodes) expect(hasKey(n.textKey), n.textKey).toBe(true);
      for (const [k, v] of Object.entries(t.strings)) {
        expect(v, k).not.toMatch(/Cael/);
        expect(v, k).not.toMatch(/—|–/);
      }
    }
  });
});
