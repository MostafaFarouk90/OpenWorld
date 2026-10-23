// M17 and R08 trees through the real DialogueRunner: which state opens which segment, that the extension of Slagg's tree
// merges cleanly and leaves R09 and R10 alone, what each hand-in writes, and that the text obeys the content rules.
import { describe, expect, it } from 'vitest';
import { dialogueStrings, npcNameFallbackStrings } from '../../../../strings.en';
import { questStrings } from '../../../../../quests/strings.en';
import { DialogueRunner } from '../../../../DialogueRunner';
import { createEffectRunner } from '../../../../../quests/effects';
import { evalCondition } from '../../../../../quests/conditions';
import { validateDialogue } from '../../../../validate';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../../../quests/ports';
import type { DialogueDef, FlagValue } from '../../../../../quests/types';
import { extendTree } from '../../build';
import { SLAGG } from '../slagg.dialogue';
import { M17R08, M17R08_NPC_DEFS, M17R08_NPCS, M17R08_NPC_STRINGS } from '../../../../../quests/content/act2/oldsmoke/mines/m17r08.content';
import { M17R08_EXTENSIONS, M17R08_TREES } from './m17r08.dialogue';

const merged = M17R08_EXTENSIONS.map((e) => extendTree(SLAGG.def, e.ext));
const treeStrings: Record<string, string> = Object.assign({}, ...M17R08_TREES.map((t) => t.strings), ...M17R08_EXTENSIONS.map((e) => e.ext.strings));
const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings, ...M17R08.strings, ...M17R08_NPC_STRINGS, ...SLAGG.strings, ...treeStrings };
const defs: DialogueDef[] = [...M17R08_TREES.map((t) => t.def), ...merged.map((m) => m.def)];
type QS = 'inactive' | 'active' | 'completed';

function world() {
  const flags = new Map<string, FlagValue>();
  const qstate = new Map<string, QS>();
  const odone = new Set<string>();
  const log: string[] = [];
  const emitted: { type: string; payload?: unknown }[] = [];
  const bus = { on: () => () => {}, emit: (type: string, payload?: unknown) => void emitted.push({ type, payload }) } as unknown as BusPort;
  const state: StatePort = {
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => { flags.set(k, v); log.push(`set ${k}=${String(v)}`); },
    clearFlag: (k) => { flags.delete(k); },
    favourBand: () => 'banked',
    favour: () => 30,
    addFavour: (t: string, d: number) => { log.push(`favour ${t} ${d}`); return 0; },
  } as StatePort;
  const quests: QuestReader & Record<string, any> = {
    state: (id: string) => qstate.get(id) ?? 'inactive',
    objectiveDone: (q: string, o: string) => odone.has(`${q}.${o}`),
    start: (id: string) => { log.push(`start ${id}`); qstate.set(id, 'active'); return true; },
    complete: () => true,
    completeObjective: () => true,
  };
  const inventory = () => ({ get gold() { return 100; }, takeGold: (n: number) => n, add: (id: string, n: number) => { log.push(`give ${id} ${n}`); return n; } });
  const effects = createEffectRunner({ state, quests: quests as any, bus, sourceId: 'test', inventory } as any);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings, evalCondition, gold: () => 100 } as any);
  for (const d of defs) dr.register(d);
  const set = (q: string, s: QS, ...done: string[]) => { qstate.set(q, s); for (const o of done) odone.add(`${q}.${o}`); };
  return { flags, dr, set, log, emitted };
}
type Wd = ReturnType<typeof world>;

function opens(w: Wd, dialogueId: string, npc: string): string {
  expect(w.dr.start(dialogueId, npc), `${dialogueId} starts`).toBe(true);
  const id = w.dr.view()!.nodeId;
  w.dr.close('skip');
  return id;
}
function play(w: Wd, dialogueId: string, npc: string): string[] {
  expect(w.dr.start(dialogueId, npc)).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 80 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) w.dr.choose(1); else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}

describe('content rules', () => {
  it.each(defs.map((d) => [d.id, d] as const))('%s validates clean', (_id, def) => {
    const r = validateDialogue(def, (k) => k in all);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('the Slagg extension only adds a2-m17 nodes and merges without a clash', () => {
    const ext = M17R08_EXTENSIONS[0];
    expect(ext.baseId).toBe('npc-slagg');
    expect(ext.ext.def.id).toBe('npc-slagg');
    for (const n of ext.ext.def.nodes) expect(n.id).toMatch(/^a2-(m17|r08)-/);
    for (const k of Object.keys(ext.ext.strings)) expect(k in SLAGG.strings, k).toBe(false);
    expect(merged[0].def.nodes.length).toBe(SLAGG.def.nodes.length + ext.ext.def.nodes.length);
  });

  it('no string has a dash or the literal player name, and each speaks as the player where it should', () => {
    for (const [k, v] of Object.entries({ ...treeStrings, ...M17R08_NPC_STRINGS })) {
      expect(v, k).not.toMatch(/[‒-―]| - /);
      expect(v, k).not.toMatch(/Cael/);
    }
  });

  it('every new tree has an NPC def and a spec with a post, and the ghosts go when R08 is done', () => {
    for (const t of M17R08_TREES) {
      const id = t.def.id.replace(/^npc-/, '');
      expect(M17R08_NPC_DEFS.find((d) => d.id === id)?.dialogueId, id).toBe(t.def.id);
      expect(M17R08_NPCS.find((s) => s.id === id)?.post, id).toBeTruthy();
      expect(M17R08_NPC_STRINGS[`npc.${id}.name`], id).toBeTruthy();
    }
    expect(M17R08_NPCS.find((s) => s.id === 'pickett')!.absentWhen).toBe('story.r08.laid');
    expect(M17R08_NPCS.find((s) => s.id === 'shift-crew')!.absentWhen).toBe('story.r08.laid');
    expect(M17R08_NPCS.find((s) => s.id === 'miner-hale')!.presentWhen).toBe('story.m17.miner1.delivered');
    expect(M17R08_NPCS.find((s) => s.id === 'miner-brig')!.presentWhen).toBe('story.m17.miner2.delivered');
    expect(new Set(M17R08_NPC_DEFS.map((d) => d.id)).size).toBe(M17R08_NPC_DEFS.length);
  });
});

describe('Slagg opens on the right segment', () => {
  const cases: Array<[string, (w: Wd) => void, string]> = [
    ['M16 done, M17 not begun', (w) => w.set('m16', 'completed'), 'a2-m17-brief'],
    ['M17 ready to report', (w) => { w.set('m16', 'completed'); w.set('m17', 'active', 'thanks'); }, 'a2-m17-report'],
    ['M17 mid-quest falls through to the base tree (R09 offer, R10 not yet open)', (w) => { w.set('m16', 'completed'); w.set('m17', 'active', 'brief'); }, 'offer-r09'],
    ['M17 done offers R09 and R10 as before', (w) => { w.set('m16', 'completed'); w.set('m17', 'completed'); }, 'offers'],
    ['before M16 Slagg only idles', () => {}, 'idle'],
    ['R10 active still has its own segment', (w) => { w.set('m17', 'completed'); w.set('r10', 'active'); }, 'r10-wait'],
    ['R09 report keeps its segment', (w) => { w.set('m16', 'completed'); w.set('m17', 'active', 'brief'); w.set('r09', 'active', 'choice'); }, 'r09-report'],
  ];
  it.each(cases)('%s', (_n, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-slagg', 'slagg')).toBe(node);
  });

  it('the offer takes ten nodes, starts M17 exactly once at its last line, and the report takes seven', () => {
    const w = world();
    w.set('m16', 'completed');
    const seen = play(w, 'npc-slagg', 'slagg');
    expect(seen).toHaveLength(10);
    expect(w.log.filter((l) => l === 'start m17')).toHaveLength(1);
    expect(w.log[w.log.length - 1]).toBe('start m17');
    const w2 = world();
    w2.set('m16', 'completed');
    w2.set('m17', 'active', 'thanks');
    expect(play(w2, 'npc-slagg', 'slagg')).toHaveLength(7);
    expect(w2.log.filter((l) => l.startsWith('favour'))).toEqual([]);
  });
});

describe('the winch-wright and the miners', () => {
  it('the wright opens by step, waits through the parts and idles after', () => {
    const cases: Array<[(w: Wd) => void, string]> = [
      [(w) => w.set('m17', 'active', 'brief'), 'm17-wright'],
      [(w) => w.set('m17', 'active', 'brief', 'wright'), 'm17-wait'],
      [(w) => w.set('m17', 'active', 'brief', 'wright', 'parts', 'search', 'winch', 'ride'), 'm17-working'],
      [(w) => w.set('m17', 'completed'), 'idle'],
      [() => {}, 'idle'],
    ];
    for (const [arrange, node] of cases) {
      const w = world();
      arrange(w);
      expect(opens(w, 'npc-winch-wright', 'winch-wright')).toBe(node);
    }
    const w = world();
    w.set('m17', 'active', 'brief');
    expect(play(w, 'npc-winch-wright', 'winch-wright')).toHaveLength(7);
  });

  it.each([['miner-hale'], ['miner-brig']])('%s thanks Cael in four nodes once the ride up is done, and idles before', (id) => {
    const w = world();
    w.set('m17', 'active', 'miners');
    expect(opens(w, `npc-${id}`, id)).toBe('idle');
    w.set('m17', 'active', 'miners', 'up');
    expect(opens(w, `npc-${id}`, id)).toBe('m17-thanks');
    expect(play(w, `npc-${id}`, id)).toHaveLength(4);
    const w2 = world();
    w2.set('m17', 'completed');
    expect(opens(w2, `npc-${id}`, id)).toBe('idle');
  });
});

describe('Pickett and the shift crew', () => {
  it('Pickett offers R08 after M17, only once, and starts it at the last line', () => {
    const w = world();
    w.set('m17', 'completed');
    expect(opens(w, 'npc-pickett', 'pickett')).toBe('r08-brief');
    const seen = play(w, 'npc-pickett', 'pickett');
    expect(seen).toHaveLength(12);
    expect(w.log.filter((l) => l === 'start r08')).toHaveLength(1);
    expect(opens(w, 'npc-pickett', 'pickett')).toBe('r08-wait');
  });

  it('before M17 is done he only says he is not ready', () => {
    const w = world();
    w.set('m17', 'active');
    expect(opens(w, 'npc-pickett', 'pickett')).toBe('idle');
  });

  it('the rest segment opens only when the letter is read, is ten nodes and writes no favour', () => {
    const w = world();
    w.set('m17', 'completed');
    w.set('r08', 'active', 'brief', 'relics', 'tasks', 'wraiths', 'crew');
    expect(opens(w, 'npc-pickett', 'pickett')).toBe('r08-wait');
    w.set('r08', 'active', 'brief', 'relics', 'tasks', 'wraiths', 'crew', 'letter');
    expect(opens(w, 'npc-pickett', 'pickett')).toBe('r08-rest');
    expect(play(w, 'npc-pickett', 'pickett')).toHaveLength(10);
    expect(w.log.filter((l) => l.startsWith('favour'))).toEqual([]);
  });

  it('the crew speak after the wraiths, in six nodes, and idle otherwise', () => {
    const w = world();
    w.set('r08', 'active', 'brief', 'relics', 'tasks');
    expect(opens(w, 'npc-shift-crew', 'shift-crew')).toBe('idle');
    w.set('r08', 'active', 'brief', 'relics', 'tasks', 'wraiths');
    expect(opens(w, 'npc-shift-crew', 'shift-crew')).toBe('r08-crew');
    expect(play(w, 'npc-shift-crew', 'shift-crew')).toHaveLength(6);
  });

  it('the quest\'s talk-node counts match the pacing rows', () => {
    // M17: Slagg 10 + 7, wright 7, Hale 4, Brig 4. R08: Pickett 12 + 10, crew 6 (the letter is a note beat)
    const n = (id: string, seg: string) => defs.find((d) => d.id === id)!.nodes.filter((x) => x.id === seg || x.id.startsWith(`${seg}-`)).length;
    expect(n('npc-slagg', 'a2-m17-brief') + n('npc-slagg', 'a2-m17-report') + n('npc-winch-wright', 'm17-wright') + n('npc-miner-hale', 'm17-thanks') + n('npc-miner-brig', 'm17-thanks')).toBe(32);
    expect(n('npc-pickett', 'r08-brief') + n('npc-pickett', 'r08-rest') + n('npc-shift-crew', 'r08-crew')).toBe(28);
  });
});
