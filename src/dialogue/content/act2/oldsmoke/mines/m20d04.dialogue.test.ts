// M20 and D04 trees through the real DialogueRunner: which state opens which segment, what a hand-in writes, the node counts
// pacing relies on, that the extensions clash with nothing, and that Wenna's and Slagg's other states open as before.
import { describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../../../DialogueRunner';
import { createEffectRunner } from '../../../../../quests/effects';
import { evalCondition } from '../../../../../quests/conditions';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../../../quests/ports';
import type { DialogueDef, FlagValue } from '../../../../../quests/types';
import { validateDialogue } from '../../../../validate';
import { extendTree } from '../../build';
import { WENNA } from '../wenna.dialogue';
import { SLAGG } from '../slagg.dialogue';
import { M20D04_TREES, M20D04_EXTENSIONS } from './m20d04.dialogue';
import { M20D04_QUEST_STRINGS } from '../../../../../quests/content/act2/oldsmoke/mines/m20d04.text';
import { M20D04_NPC_STRINGS } from '../../../../../quests/content/act2/oldsmoke/mines/m20d04.npcs';

type QS = 'inactive' | 'active' | 'completed';
const BASES: Record<string, { def: DialogueDef; strings: Record<string, string> }> = { 'npc-wenna': WENNA, 'npc-slagg': SLAGG };
const extended = M20D04_EXTENSIONS.map(({ baseId, ext }) => extendTree(BASES[baseId].def, ext));
const strings: Record<string, string> = {
  ...WENNA.strings, ...SLAGG.strings, ...M20D04_QUEST_STRINGS, ...M20D04_NPC_STRINGS,
  ...Object.assign({}, ...extended.map((e) => e.strings)), ...Object.assign({}, ...M20D04_TREES.map((t) => t.strings)),
};

function world() {
  const flags = new Map<string, FlagValue>();
  const qstate = new Map<string, QS>();
  const odone = new Set<string>();
  const log: string[] = [];
  const emitted: string[] = [];
  const bus = { on: () => () => {}, emit: (type: string) => void emitted.push(type) } as unknown as BusPort;
  const state = {
    getFlag: (k: string) => flags.get(k),
    setFlag: (k: string, v: FlagValue) => { flags.set(k, v); log.push(`set ${k}=${String(v)}`); },
    clearFlag: (k: string) => { flags.delete(k); },
    favourBand: () => 'banked',
    favour: () => 0,
    addFavour: (t: string, d: number) => { log.push(`favour ${t} ${d}`); return 0; },
  } as unknown as StatePort;
  const quests: QuestReader & Record<string, any> = {
    state: (id: string) => qstate.get(id) ?? 'inactive',
    objectiveDone: (q: string, o: string) => odone.has(`${q}.${o}`),
    start: (id: string) => { log.push(`start ${id}`); qstate.set(id, 'active'); return true; },
    complete: (id: string) => { log.push(`complete ${id}`); return true; },
    completeObjective: () => true,
  };
  const effects = createEffectRunner({ state, quests: quests as any, bus, sourceId: 'test', inventory: () => ({ gold: 0, takeGold: () => 0, add: (id: string, n: number) => { log.push(`give ${id} ${n}`); return n; } }) } as any);
  const text: StringsPort = { t: (k) => strings[k] ?? `[[${k}]]`, has: (k) => k in strings };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings: text, evalCondition, gold: () => 0 } as any);
  for (const e of extended) dr.register(e.def);
  for (const t of M20D04_TREES) dr.register(t.def);
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
    seen.push(w.dr.view()!.nodeId);
    if (w.dr.view()!.choices.length) w.dr.choose(1); else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}

const all = [...extended.map((e) => e.def), ...M20D04_TREES.map((t) => t.def)];

describe('M20 and D04 trees: shape', () => {
  it('the extensions extend Wenna and Slagg and clash with nothing', () => {
    expect(M20D04_EXTENSIONS.map((e) => e.baseId)).toEqual(['npc-wenna', 'npc-slagg']);
    for (const { baseId, ext } of M20D04_EXTENSIONS) {
      expect(ext.def.id).toBe(baseId);
      expect(() => extendTree(BASES[baseId].def, ext)).not.toThrow();
      for (const n of ext.def.nodes) expect(n.id, n.id).toMatch(/^a2-(m20|d04)-/);
    }
    expect(M20D04_TREES.map((t) => t.def.id)).toEqual(['npc-steward-captain', 'npc-wyrmling-keeper']);
  });

  it('every tree validates, every text key has a string, every start rule points at a node', () => {
    for (const d of all) {
      const r = validateDialogue(d, (k) => k in strings);
      expect(r.errors, d.id).toEqual([]);
    }
  });

  it('prose rules: {name} for the player, no literal Cael, no em or en dashes', () => {
    for (const [k, v] of Object.entries({ ...Object.assign({}, ...extended.map((e) => e.strings)), ...Object.assign({}, ...M20D04_TREES.map((t) => t.strings)) }) as [string, string][]) {
      if (!/^dialogue\.npc-(wenna|slagg)\.a2-/.test(k) && !/^dialogue\.npc-(steward-captain|wyrmling-keeper)\./.test(k)) continue;
      expect(v, k).not.toMatch(/Cael/);
      expect(v, k).not.toMatch(/[–—]/);
    }
    for (const v of [...Object.values(M20D04_QUEST_STRINGS), ...Object.values(M20D04_NPC_STRINGS)]) expect(v).not.toMatch(/[–—]|Cael/);
  });

  it('the new NPC trees take their dialogue ids from the NPC defs', () => {
    for (const t of M20D04_TREES) expect(t.def.id).toMatch(/^npc-(steward-captain|wyrmling-keeper)$/);
  });
});

describe('Wenna: M20', () => {
  const cases: Array<[string, (w: Wd) => void, string]> = [
    ['M19 done, M20 not started', (w) => w.set('m19', 'completed'), 'a2-m20-offer'],
    ['M20 started', (w) => w.set('m20', 'active'), 'a2-m20-wait'],
    ['M20 stewards and chains done, Orsk not yet gone', (w) => w.set('m20', 'active', 'brief', 'stewards', 'captain', 'chains'), 'a2-m20-wait'],
    ['Orsk gone, aftermath open', (w) => w.set('m20', 'active', 'gone'), 'a2-m20-aftermath'],
    ['M20 done and M21 not started: M21 (the base tree) takes over', (w) => { w.set('m19', 'completed'); w.set('m20', 'completed'); }, 'm21-offer'],
    ['M19 not done: nothing of M20', (w) => w.set('m19', 'active'), 'idle'],
    ['nothing', () => {}, 'idle'],
  ];
  it.each(cases)('%s', (_n, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-wenna', 'wenna')).toBe(node);
  });

  it('the offer starts M20 once, in its last node', () => {
    const w = world();
    w.set('m19', 'completed');
    const seen = play(w, 'npc-wenna', 'wenna');
    expect(w.log.filter((l) => l === 'start m20')).toHaveLength(1);
    expect(seen).toHaveLength(8);
    expect(seen[0]).toBe('a2-m20-offer');
  });

  it('the aftermath is ten nodes and pays nothing itself (the quest pays, once)', () => {
    const w = world();
    w.set('m20', 'active', 'gone');
    const seen = play(w, 'npc-wenna', 'wenna');
    expect(seen).toHaveLength(10);
    expect(w.log).toEqual([]);
  });

  it('M21 and M16 states still open as before with the extension in place', () => {
    const w = world();
    w.set('m21', 'active', 'counsel');
    expect(opens(w, 'npc-wenna', 'wenna')).toBe('m21-wait');
    const w2 = world();
    w2.set('m16', 'active', 'silence');
    expect(opens(w2, 'npc-wenna', 'wenna')).toBe('m16-aside');
  });
});

describe('the steward-captain and the wyrmling-keeper', () => {
  it('the captain speaks once the stewards are down, waits during the quest, and is idle outside it', () => {
    const w = world();
    w.set('m20', 'active', 'brief', 'stewards');
    expect(opens(w, 'npc-steward-captain', 'steward-captain')).toBe('a2-m20-captain');
    expect(play(w, 'npc-steward-captain', 'steward-captain')).toHaveLength(8);
    const w2 = world();
    w2.set('m20', 'active', 'brief');
    expect(opens(w2, 'npc-steward-captain', 'steward-captain')).toBe('a2-m20-captain-wait');
    expect(opens(world(), 'npc-steward-captain', 'steward-captain')).toBe('idle');
  });

  it('the keeper speaks after the searches, waits before them, and is idle outside the quest', () => {
    const w = world();
    w.set('m20', 'active', 'brief', 'stewards', 'captain', 'chains', 'search');
    expect(opens(w, 'npc-wyrmling-keeper', 'wyrmling-keeper')).toBe('a2-m20-keeper');
    expect(play(w, 'npc-wyrmling-keeper', 'wyrmling-keeper')).toHaveLength(6);
    const w2 = world();
    w2.set('m20', 'active', 'brief', 'stewards', 'captain');
    expect(opens(w2, 'npc-wyrmling-keeper', 'wyrmling-keeper')).toBe('a2-m20-keeper-wait');
    expect(opens(world(), 'npc-wyrmling-keeper', 'wyrmling-keeper')).toBe('idle');
  });

  it('neither writes a flag, a favour or an item', () => {
    for (const [id, npc, state] of [['npc-steward-captain', 'steward-captain', ['stewards']], ['npc-wyrmling-keeper', 'wyrmling-keeper', ['stewards', 'captain', 'chains', 'search']]] as const) {
      const w = world();
      w.set('m20', 'active', 'brief', ...state);
      play(w, id, npc);
      expect(w.log).toEqual([]);
    }
  });
});

describe('Slagg: D04', () => {
  const cases: Array<[string, (w: Wd) => void, string]> = [
    ['M20 done, D04 not started', (w) => w.set('m20', 'completed'), 'a2-d04-offer'],
    ['D04 started', (w) => w.set('d04', 'active', 'brief'), 'a2-d04-wait'],
    ['D04 survey read, pools open', (w) => w.set('d04', 'active', 'brief', 'survey'), 'a2-d04-wait-pools'],
    ['D04 pools done, arena open', (w) => w.set('d04', 'active', 'survey', 'pool1', 'pool2'), 'a2-d04-wait-arena'],
    ['the Slagmaw down', (w) => w.set('d04', 'active', 'survey', 'pool1', 'pool2', 'slagmaw'), 'a2-d04-report'],
    ['M20 not done: nothing of D04', (w) => w.set('m20', 'active'), 'idle'],
    ['R10 open: the base tree answers', (w) => w.set('r10', 'active'), 'r10-wait'],
  ];
  it.each(cases)('%s', (_n, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-slagg', 'slagg')).toBe(node);
  });

  it('the offer starts D04 once, in its last node, eight nodes long', () => {
    const w = world();
    w.set('m20', 'completed');
    const seen = play(w, 'npc-slagg', 'slagg');
    expect(seen).toHaveLength(8);
    expect(w.log.filter((l) => l === 'start d04')).toHaveLength(1);
  });

  it('the report is twelve nodes and writes nothing: no spare, no mercy, no favour, no Act 3 gate, no second hand-in', () => {
    const w = world();
    w.set('d04', 'active', 'survey', 'pool1', 'pool2', 'slagmaw');
    const seen = play(w, 'npc-slagg', 'slagg');
    expect(seen).toHaveLength(12);
    expect(w.log).toEqual([]);
    expect(w.emitted.filter((t) => !t.startsWith('dialogue.'))).toEqual([]);
    expect(w.flags.has('story.gate.a3')).toBe(false);
  });

  it('with R09 and R10 open for offers, a finished M20 still offers D04 first', () => {
    const w = world();
    w.set('m16', 'completed');
    w.set('m17', 'completed');
    w.set('m20', 'completed');
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('a2-d04-offer');
  });

  it('after D04 the base offers are back', () => {
    const w = world();
    w.set('m16', 'completed');
    w.set('m20', 'completed');
    w.set('d04', 'completed');
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('offer-r09');
  });
});

describe('node counts on the shortest path (the pacing rows)', () => {
  it('M20 reads 32 nodes and D04 20', () => {
    const wenna = (seg: string) => extended[0].def.nodes.filter((n) => n.id === seg || new RegExp(`^${seg}-\\d+$`).test(n.id)).length;
    const slagg = (seg: string) => extended[1].def.nodes.filter((n) => n.id === seg || new RegExp(`^${seg}-\\d+$`).test(n.id)).length;
    const tree = (id: string, seg: string) => M20D04_TREES.find((t) => t.def.id === id)!.def.nodes.filter((n) => n.id === seg || new RegExp(`^${seg}-\\d+$`).test(n.id)).length;
    expect(wenna('a2-m20-offer') + tree('npc-steward-captain', 'a2-m20-captain') + tree('npc-wyrmling-keeper', 'a2-m20-keeper') + wenna('a2-m20-aftermath')).toBe(32);
    expect(slagg('a2-d04-offer') + slagg('a2-d04-report')).toBe(20);
  });
});

