// M18 and M19 trees through the real DialogueRunner: which state opens which segment, that the extension of Wenna's tree
// merges cleanly and leaves M16 and M21 alone, what the offers and scenes write, the node counts the pacing rows assume,
// and that the text obeys the content rules.
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
import { WENNA } from '../wenna.dialogue';
import { OLDSMOKE_NPC_DEFS } from '../../../../../oldsmoke/npcDefs';
import { M18M19, M18M19_NPC_DEFS, M18M19_NPCS, M18M19_NPC_STRINGS, M18M19_PACE } from '../../../../../quests/content/act2/oldsmoke/mines/m18m19.content';
import { M18M19_EXTENSIONS, M18M19_TREES } from './m18m19.dialogue';

const merged = M18M19_EXTENSIONS.map((e) => extendTree(WENNA.def, e.ext));
const treeStrings: Record<string, string> = Object.assign({}, ...M18M19_TREES.map((t) => t.strings), ...M18M19_EXTENSIONS.map((e) => e.ext.strings));
const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings, ...M18M19.strings, ...M18M19_NPC_STRINGS, ...WENNA.strings, ...treeStrings };
const defs: DialogueDef[] = [...M18M19_TREES.map((t) => t.def), ...merged.map((m) => m.def)];
const baseOnly: DialogueDef[] = [WENNA.def];
type QS = 'inactive' | 'active' | 'completed';

function world(registered: DialogueDef[] = defs) {
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
  for (const d of registered) dr.register(d);
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

  it('the Wenna extension only adds a2-m19 nodes and merges without a clash', () => {
    const ext = M18M19_EXTENSIONS[0];
    expect(M18M19_EXTENSIONS).toHaveLength(1);
    expect(ext.baseId).toBe('npc-wenna');
    expect(ext.ext.def.id).toBe('npc-wenna');
    for (const n of ext.ext.def.nodes) expect(n.id).toMatch(/^a2-m19-/);
    for (const k of Object.keys(ext.ext.strings)) expect(k in WENNA.strings, k).toBe(false);
    expect(merged[0].def.nodes.length).toBe(WENNA.def.nodes.length + ext.ext.def.nodes.length);
  });

  it('every new tree\'s nodes start a2-m18 or a2-m19, and the tree ids are the NPC dialogue ids or scene ids', () => {
    expect(M18M19_TREES.map((t) => t.def.id)).toEqual(['npc-pike', 'npc-pike-apprentice', 'scene-m18-breath', 'scene-m19-nursery', ...[1, 2, 3, 4, 5, 6].map((n) => `scene-m19-bark-${n}`)]);
    // the always-true fallback is named 'idle' (content.test.ts requires it of every root npc- tree); every other node is a2-m18 or a2-m19
    for (const t of M18M19_TREES) for (const n of t.def.nodes) expect(n.id, t.def.id).toMatch(/^(idle$|a2-m(18|19)-)/);
  });

  it('no string has a dash or the literal player name', () => {
    for (const [k, v] of Object.entries({ ...treeStrings, ...M18M19_NPC_STRINGS, ...M18M19.strings })) {
      expect(v, k).not.toMatch(/[‒-―]| - /);
      expect(v, k).not.toMatch(/Cael/);
    }
  });

  it('the new NPC has a def, a spec with a post and a name; Pike\'s def points at his tree', () => {
    expect(M18M19_NPC_DEFS.map((d) => d.id)).toEqual(['pike-apprentice']);
    expect(M18M19_NPC_DEFS[0].dialogueId).toBe('npc-pike-apprentice');
    expect(M18M19_NPCS.find((s) => s.id === 'pike-apprentice')?.post).toBeTruthy();
    expect(M18M19_NPC_STRINGS['npc.pike-apprentice.name']).toBeTruthy();
    expect(OLDSMOKE_NPC_DEFS.find((d) => d.id === 'pike')!.dialogueId).toBe('npc-pike');
    expect(OLDSMOKE_NPC_DEFS.some((d) => d.id === 'pike-apprentice')).toBe(false);
  });

  it('the node counts match the pacing rows', () => {
    const walk = (id: string, s: (w: Wd) => void, npc: string) => { const w = world(); s(w); return play(w, id, npc).length; };
    const pike = (s: (w: Wd) => void) => walk('npc-pike', s, 'pike');
    const m18 =
      pike((w) => w.set('m17', 'completed')) +
      walk('npc-pike-apprentice', (w) => w.set('m18', 'active', 'brief', 'plaque', 'pipes'), 'pike-apprentice') +
      pike((w) => w.set('m18', 'active', 'brief', 'plaque', 'pipes', 'apprentice')) +
      walk('scene-m18-breath', () => {}, 'scene.m18') +
      pike((w) => w.set('m18', 'active', 'breathe'));
    expect(m18).toBe(M18M19_PACE[0].nodes);
    const wenna = (s: (w: Wd) => void) => walk('npc-wenna', s, 'wenna');
    const m19 =
      wenna((w) => w.set('m18', 'completed')) +
      [1, 2, 3, 4, 5, 6].reduce((n, i) => n + walk(`scene-m19-bark-${i}`, () => {}, 'scene.m19.bark'), 0) +
      walk('scene-m19-nursery', () => {}, 'scene.m19') +
      wenna((w) => w.set('m19', 'active', 'reveal')) +
      wenna((w) => w.set('m19', 'active', 'nursery'));
    expect(m19).toBe(M18M19_PACE[1].nodes);
  });
});

describe('Pike opens on the right segment', () => {
  const cases: Array<[string, (w: Wd) => void, string]> = [
    ['M17 done, M18 not begun', (w) => w.set('m17', 'completed'), 'a2-m18-offer'],
    ['M18 begun, brief not credited', (w) => w.set('m18', 'active'), 'a2-m18-brief-again'],
    ['M18 reading', (w) => w.set('m18', 'active', 'brief'), 'a2-m18-wait-read'],
    ['M18 apprentice heard', (w) => w.set('m18', 'active', 'brief', 'plaque', 'pipes', 'apprentice'), 'a2-m18-lore'],
    ['M18 crawlers', (w) => w.set('m18', 'active', 'brief', 'plaque', 'pipes', 'apprentice', 'lore'), 'a2-m18-wait-crawlers'],
    ['M18 valves', (w) => w.set('m18', 'active', 'brief', 'plaque', 'pipes', 'apprentice', 'lore', 'crawlers'), 'a2-m18-wait-valves'],
    ['M18 lit, scene not played', (w) => w.set('m18', 'active', 'brief', 'plaque', 'pipes', 'apprentice', 'lore', 'crawlers', 'solve', 'rekindle'), 'a2-m18-wait-breath'],
    ['M18 breathed', (w) => w.set('m18', 'active', 'solve', 'rekindle', 'breathe'), 'a2-m18-report'],
    ['M18 done', (w) => w.set('m18', 'completed'), 'a2-m18-after'],
    ['nothing', () => {}, 'idle'],
    ['M17 not done', (w) => w.set('m17', 'active'), 'idle'],
  ];
  it.each(cases)('%s', (_n, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-pike', 'pike')).toBe(node);
  });

  it('the offer starts M18 once, and nothing else', () => {
    const w = world();
    w.set('m17', 'completed');
    play(w, 'npc-pike', 'pike');
    expect(w.log.filter((l) => l.startsWith('start '))).toEqual(['start m18']);
    expect(w.log.filter((l) => !l.startsWith('start '))).toEqual([]);
  });

  it('the hand-in writes nothing: the XP is the quest\'s, the blessing is A9\'s', () => {
    const w = world();
    w.set('m18', 'active', 'solve', 'rekindle', 'breathe');
    play(w, 'npc-pike', 'pike');
    expect(w.log).toEqual([]);
  });

  it('the apprentice opens during M18 and chats afterwards', () => {
    const w = world();
    w.set('m18', 'active', 'brief', 'plaque', 'pipes');
    expect(opens(w, 'npc-pike-apprentice', 'pike-apprentice')).toBe('a2-m18-apprentice');
    const w2 = world();
    w2.set('m18', 'completed');
    expect(opens(w2, 'npc-pike-apprentice', 'pike-apprentice')).toBe('a2-m18-apprentice-after');
    expect(opens(world(), 'npc-pike-apprentice', 'pike-apprentice')).toBe('idle');
  });
});

describe('Wenna opens on the right segment', () => {
  const cases: Array<[string, (w: Wd) => void, string]> = [
    ['M18 done, M19 not begun', (w) => w.set('m18', 'completed'), 'a2-m19-offer'],
    ['M19 begun, confession not credited', (w) => w.set('m19', 'active'), 'a2-m19-again'],
    ['M19 leading', (w) => w.set('m19', 'active', 'confession'), 'a2-m19-wait-lead'],
    ['M19 in the stealth section', (w) => w.set('m19', 'active', 'confession', 'route'), 'a2-m19-wait-lead'],
    ['M19 at the door', (w) => w.set('m19', 'active', 'confession', 'route', 'stealth'), 'a2-m19-wait-door'],
    ['M19 door open', (w) => w.set('m19', 'active', 'confession', 'route', 'stealth', 'doors'), 'a2-m19-wait-reveal'],
    ['M19 nursery revealed', (w) => w.set('m19', 'active', 'confession', 'route', 'stealth', 'doors', 'reveal'), 'a2-m19-nursery'],
    ['M19 ready to report', (w) => w.set('m19', 'active', 'reveal', 'nursery'), 'a2-m19-report'],
  ];
  it.each(cases)('%s', (_n, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-wenna', 'wenna')).toBe(node);
  });

  it('the Act 2 states Wenna already had open as before', () => {
    const base: Array<[string, (w: Wd) => void]> = [
      ['M16 aside', (w) => w.set('m16', 'active', 'silence')],
      ['M16 wait', (w) => w.set('m16', 'active')],
      ['M21 offer', (w) => { w.set('m19', 'completed'); w.set('m20', 'completed'); }],
      ['M21 counsel', (w) => w.set('m21', 'active')],
      ['M21 report', (w) => w.set('m21', 'active', 'aftermath')],
      ['idle', () => {}],
    ];
    for (const [name, arrange] of base) {
      const plain = world(baseOnly);
      arrange(plain);
      const ext = world();
      arrange(ext);
      expect(opens(ext, 'npc-wenna', 'wenna'), name).toBe(opens(plain, 'npc-wenna', 'wenna'));
    }
  });

  it('M19 done with nothing after falls through to her idle line', () => {
    const w = world();
    w.set('m19', 'completed');
    expect(opens(w, 'npc-wenna', 'wenna')).toBe('idle');
  });

  it('the confession starts M19 on its last line, once, and writes nothing else', () => {
    const w = world();
    w.set('m18', 'completed');
    const seen = play(w, 'npc-wenna', 'wenna');
    expect(seen).toHaveLength(14);
    expect(w.log).toEqual(['start m19']);
  });

  it('the nursery talk and the hand-in write nothing (the XP is the quest\'s)', () => {
    const w = world();
    w.set('m19', 'active', 'reveal');
    play(w, 'npc-wenna', 'wenna');
    w.set('m19', 'active', 'reveal', 'nursery');
    play(w, 'npc-wenna', 'wenna');
    expect(w.log).toEqual([]);
  });
});

describe('the scenes', () => {
  it('the Bellows scene is two nodes and writes story.m18.set on its last', () => {
    const w = world();
    expect(play(w, 'scene-m18-breath', 'scene.m18')).toHaveLength(2);
    expect(w.flags.get('story.m18.set')).toBe(true);
  });

  it('the nursery scene is three nodes and writes story.m19.set on its last', () => {
    const w = world();
    expect(play(w, 'scene-m19-nursery', 'scene.m19')).toHaveLength(3);
    expect(w.flags.get('story.m19.set')).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6])('route bark %i is two Wenna lines and writes nothing', (n) => {
    const w = world();
    expect(play(w, `scene-m19-bark-${n}`, 'scene.m19.bark')).toHaveLength(2);
    expect(w.log).toEqual([]);
  });

  it('a scene that is skipped writes no flag (the quest credits only a completed end)', () => {
    const w = world();
    w.dr.start('scene-m19-nursery', 'scene.m19');
    w.dr.close('skip');
    expect(w.flags.has('story.m19.set')).toBe(false);
  });
});
