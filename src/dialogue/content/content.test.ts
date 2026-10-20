import { describe, it, expect } from 'vitest';
import { dialogueDefs } from './index';
import { dialogueStrings, npcNameFallbackStrings } from '../strings.en';
import { questStrings } from '../../quests/strings.en';
import { validateDialogue } from '../validate';
import { computeVowTone, T04_DIALOGUE_ID } from './t04-vow.dialogue';
import { DialogueRunner } from '../DialogueRunner';
import { createEffectRunner } from '../../quests/effects';
import type { BusPort, StatePort, StringsPort } from '../../quests/ports';
import type { FlagValue } from '../../quests/types';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const hasKey = (k: string) => k in all;

describe('dialogue content', () => {
  it('ids are unique and roots exist', () => {
    const ids = dialogueDefs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ['npc-gaut', 'npc-edda', 'npc-stane', 'npc-aelfreda', 'npc-hob', 'npc-wynn', 'npc-tobb', 'npc-carter-1', 'npc-carter-2', 't04-vow']) expect(ids).toContain(r);
  });

  it.each(dialogueDefs.map((d) => [d.id, d] as const))('%s validates', (_id, def) => {
    const r = validateDialogue(def, hasKey);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('every root dialogue ends its start array with an always-true entry', () => {
    for (const d of dialogueDefs.filter((x) => x.id.startsWith('npc-'))) {
      expect(Array.isArray(d.start), d.id).toBe(true);
      const last = (d.start as { when: unknown; node: string }[]).at(-1)!;
      expect(last.when).toEqual({ all: [] });
      expect(last.node).toBe('idle');
    }
  });

  it('speakers are known', () => {
    for (const d of dialogueDefs) for (const n of d.nodes) expect(['gaut', 'edda', 'stane', 'aelfreda', 'hob', 'wynn', 'tobb', 'carter-1', 'carter-2', 'cael', 'rook', 'aldith', 'wystan', 'edric', 'vey', 'merrin', 'gerta', 'whitlock', 'pennard', 'ashdown', 'carter-3', 'aldwin', 'garrick', 'note',
      // density pass, batch 3
      'refugee-1', 'refugee-2', 'stallholder-1', 'stallholder-2', 'guild-doorman', 'pellam', 'sexton', 'fence', 'crabbe',
      // batch 4
      'armourer', 'keep-guard', 'grisel', 'clerk', 'wace']).toContain(n.speaker);
  });

  it('no literal Cael in strings', () => {
    for (const [k, v] of Object.entries(dialogueStrings)) expect(v, k).not.toMatch(/Cael/);
  });
});

function setup() {
  const flags = new Map<string, FlagValue>();
  const log: { type: string; payload: any }[] = [];
  const bus: BusPort = { on: () => () => {}, emit: (type, payload) => { log.push({ type, payload }); } };
  const state: StatePort = {
    getFlag: (k) => flags.get(k), setFlag: (k, v) => { flags.set(k, v); }, clearFlag: (k) => { flags.delete(k); },
    favourBand: () => 'banked', favour: () => 30, addFavour: () => 0,
  };
  const quests = { state: () => 'inactive' as const, objectiveDone: () => false, start: () => true, complete: () => true, completeObjective: () => true };
  const effects = createEffectRunner({ state, quests, bus, sourceId: 'test' });
  const strings: StringsPort = { t: (k, p) => (all[k] ?? `[[${k}]]`).replace('{name}', String(p?.name ?? 'Cael')), has: hasKey };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  return { flags, log, dr };
}

const TONES = ['earnest', 'wry', 'humble'];
const majority = (v: string[]) => {
  for (const t of TONES) if (v.filter((x) => x === t).length >= 2) return t;
  return v[2];
};

describe('T04 vow flow (real DialogueRunner)', () => {
  const combos: string[][] = [];
  for (const a of TONES) for (const b of TONES) for (const c of TONES) combos.push([a, b, c]);

  it.each(combos)('vows %s/%s/%s', (a, b, c) => {
    const { flags, log, dr } = setup();
    const vows = [a, b, c];
    expect(dr.start('t04-vow', 'aelfreda')).toBe(true);
    // defaults are set on entry
    expect(flags.get('tutorial.t04.tone')).toBe('earnest');
    let shownTone = 0;
    for (let i = 0; i < 40 && dr.isOpen; i++) {
      const v = dr.view()!;
      if (v.nodeId.startsWith('tone-')) shownTone++;
      const m = /^vow(\d)$/.exec(v.nodeId);
      if (m) dr.choose(TONES.indexOf(vows[Number(m[1]) - 1]) + 1);
      else dr.advance();
    }
    expect(dr.isOpen).toBe(false);
    expect(shownTone).toBe(1);
    expect(flags.get('tutorial.t04.vow1')).toBe(a);
    expect(flags.get('tutorial.t04.vow2')).toBe(b);
    expect(flags.get('tutorial.t04.vow3')).toBe(c);
    expect(flags.get('tutorial.t04.tone')).toBe(majority(vows));
    expect(log.some((e) => e.type === 'tutorial.vow.complete')).toBe(true);
  });

  it('computeVowTone over all 27 combos matches majority, vow3 on all-different', () => {
    for (const [a, b, c] of combos) expect(computeVowTone(a, b, c)).toBe(majority([a, b, c]));
    expect(computeVowTone('x', undefined, 'wry')).toBe('earnest');
    expect(computeVowTone(1, 'nope', null)).toBe('earnest');
    expect(T04_DIALOGUE_ID).toBe('t04-vow');
  });

  it('skip after two wry picks leaves vows wry,wry,earnest', () => {
    const { flags, dr } = setup();
    dr.start('t04-vow', 'aelfreda');
    for (let i = 0; i < 2; i++) {
      while (!/^vow\d$/.test(dr.view()!.nodeId)) dr.advance();
      dr.choose(2);
    }
    dr.close('skip');
    expect([1, 2, 3].map((n) => flags.get(`tutorial.t04.vow${n}`))).toEqual(['wry', 'wry', 'earnest']);
  });

  it('skipping early leaves earnest defaults', () => {
    const { flags, dr } = setup();
    dr.start('t04-vow', 'aelfreda');
    dr.close('skip');
    expect(['vow1', 'vow2', 'vow3', 'tone'].map((k) => flags.get(`tutorial.t04.${k}`))).toEqual(['earnest', 'earnest', 'earnest', 'earnest']);
  });
});
