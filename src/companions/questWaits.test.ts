// The wait every companion obeys during R18's egg climb (K13): derived from the quest alone, so an abandon or a load releases him.
import { describe, expect, it } from 'vitest';
import { QUEST_WAITS, deriveWait, ruleHolds, type WaitView } from './WaitDirector';

const rule = QUEST_WAITS[0]!;
const view = (quest: string | undefined, done: string[], o: Partial<WaitView> = {}): WaitView => ({
  questState: (q) => (q === 'r18' ? quest : undefined),
  objectiveDone: (q, id) => q === 'r18' && done.includes(id),
  interior: null,
  anchorExists: () => true,
  ...o,
});

describe('R18 companion hold', () => {
  it('is the cliff-foot post, a stealth wait, from the camp search to the nest', () => {
    expect(rule).toMatchObject({ reason: 'stealth', anchorId: 'dragonspine.hawk.companion-hold', quest: 'r18', from: 'camp', until: 'nested' });
  });

  it('does not hold before the camp is searched, holds while the eggs are being carried, and lets go when the nest is full', () => {
    expect(ruleHolds(rule, view('active', ['brief', 'thief']))).toBe(false);
    expect(ruleHolds(rule, view('active', ['brief', 'thief', 'excuse', 'camp']))).toBe(true);
    expect(ruleHolds(rule, view('active', ['brief', 'thief', 'excuse', 'camp', 'nested']))).toBe(false);
    expect(deriveWait(QUEST_WAITS, view('active', ['camp']))).toEqual({ reason: 'stealth', anchorId: 'dragonspine.hawk.companion-hold' });
  });

  it('is released by an abandon, a failure, a completion and a world without the quest (nothing is stored: a load re-derives it)', () => {
    for (const state of ['inactive', 'failed', 'completed', undefined]) expect(ruleHolds(rule, view(state, ['camp'])), String(state)).toBe(false);
    expect(deriveWait(QUEST_WAITS, view('inactive', ['camp']))).toBeNull();
  });

  it('is skipped when the anchor is not defined', () => {
    expect(deriveWait(QUEST_WAITS, view('active', ['camp'], { anchorExists: () => false }))).toBeNull();
  });

  it('rules without `from` behave as before', () => {
    const plain = { reason: 'gate' as const, anchorId: 'a', quest: 'q', until: 'o' };
    expect(ruleHolds(plain, { questState: () => 'active', objectiveDone: () => false, interior: null, anchorExists: () => true })).toBe(true);
  });
});
