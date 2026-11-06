// Act 4 L7 (plan 2.8): Rook at the refuge gives Gaut's Knight book once and opens the Knight desk, through the real
// DialogueRunner and effect runner.
import { describe, expect, it } from 'vitest';
import { createEffectRunner } from '../../../quests/effects';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../quests/ports';
import { questStrings } from '../../../quests/strings.en';
import type { DialogueDef, FlagValue } from '../../../quests/types';
import { DialogueRunner } from '../../DialogueRunner';
import { dialogueStrings, npcNameFallbackStrings } from '../../strings.en';
import { dialogueDefs } from '../index';
import { npcRook } from '../npc-rook.dialogue';
import { ACT4_ROOK_STRINGS, ROOK_REFUGE, withAct4Rook } from './rook.trainer';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const BOOK = 'trainer.knight.masterBook';

function world(flags: Record<string, FlagValue> = {}) {
  const store = new Map<string, FlagValue>(Object.entries(flags));
  const emitted: { t: string; p: unknown }[] = [];
  const bus = { on: () => () => {}, emit: (t: string, p: unknown) => void emitted.push({ t, p }) } as unknown as BusPort;
  const state = {
    getFlag: (k: string) => store.get(k),
    setFlag: (k: string, v: FlagValue) => void store.set(k, v),
    clearFlag: (k: string) => void store.delete(k),
    favourBand: () => 'banked',
    favour: () => 30,
    addFavour: () => 0,
  } as unknown as StatePort;
  const quests = { state: () => 'completed', objectiveDone: () => true, start: () => true, complete: () => true, completeObjective: () => true } as unknown as QuestReader;
  const effects = createEffectRunner({ state, quests: quests as never, bus, sourceId: 'test', inventory: () => ({ add: (_i: string, n: number) => n }) } as never);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  return { dr, store, emitted };
}

const rook = (): DialogueDef => dialogueDefs.find((d) => d.id === 'npc-rook')!;
const REFUGE = { 'story.gate.a4': true, 'story.m38.complete': true, 'story.m39.complete': true, 'story.m41.complete': true };

function playTo(w: ReturnType<typeof world>, choice: string): string[] {
  expect(w.dr.start('npc-rook', 'npc-rook')).toBe(true);
  const seen: string[] = [];
  while (w.dr.isOpen && seen.length < 6) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length > 0) {
      w.dr.choose(v.choices.findIndex((c) => c.id === choice) + 1);
      break;
    }
    w.dr.advance();
  }
  return seen;
}

describe("Rook's refuge lines", () => {
  it('gives the Knight book once, then opens the Knight desk', () => {
    const w = world(REFUGE);
    expect(playTo(w, 'train')).toEqual(['a4-book', 'a4-book-2', 'a4-book-3']);
    expect(w.store.get(BOOK)).toBe(true);
    expect(w.emitted.filter((e) => e.t === 'trainer.masterBook')).toHaveLength(1);
    expect(w.emitted.find((e) => e.t === 'classes.trainer.open')?.p).toEqual({ classId: 'knight' });
    if (w.dr.isOpen) w.dr.close('skip');
    expect(playTo(w, 'train')).toEqual(['a4-train']);
    expect(w.emitted.filter((e) => e.t === 'trainer.masterBook')).toHaveLength(1);
  });
  it('a player who already has the book from Gaut gets the desk only', () => {
    const w = world({ ...REFUGE, [BOOK]: true });
    expect(playTo(w, 'leave')).toEqual(['a4-train']);
    expect(w.emitted.some((e) => e.t === 'classes.trainer.open')).toBe(false);
  });
  it('before M41 Rook speaks his Act 1 to 3 lines (the extension does not match)', () => {
    const w = world({ 'story.gate.a4': true });
    expect(w.dr.start('npc-rook', 'npc-rook')).toBe(true);
    expect(w.dr.view()!.nodeId.startsWith('a4-')).toBe(false);
  });
  it('keeps every base node, adds only a4- nodes, and registers its strings', () => {
    const ext = rook();
    const base = withAct4Rook([npcRook])[0];
    expect(base.nodes.slice(0, npcRook.nodes.length)).toEqual(npcRook.nodes);
    expect(ext.nodes.filter((n) => n.id.startsWith('a4-')).length).toBe(ROOK_REFUGE.def.nodes.length);
    for (const [k, v] of Object.entries(ACT4_ROOK_STRINGS)) expect(dialogueStrings[k], k).toBe(v);
    for (const n of ROOK_REFUGE.def.nodes) expect(all[n.textKey], n.textKey).toBeTruthy();
  });
});
