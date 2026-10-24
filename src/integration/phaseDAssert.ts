import { expect } from 'vitest';
import type { ChapterHarness } from './chapterHarness';
import { ACT2_CAMP_DIALOGUE, ACT2_ENDING_ID, ACT2_GATE_FLAG } from './act2Ending';
import { PHASE_D_ORDER } from './phaseD';

/** What run A (normal) and run B (mercy-heavy) leave behind in Phase D. */
export const PHASE_D_OUTCOMES = {
  A: { 'story.r09.choice': 'stewards', 'story.r10.choice': 'miners', 'story.m21.choice': 'confront', 'story.d04.outcome': 'defeated' },
  B: { 'story.r09.choice': 'miners', 'story.r10.choice': 'compromise', 'story.m21.choice': 'spy', 'story.d04.outcome': 'defeated' },
} as const;

/** The state after the whole of Phase D was played: quests, branch flags, rewards, and the act's ending having fired once. */
export function expectPhaseDComplete(h: ChapterHarness, run: 'A' | 'B'): void {
  const quests = h.ctx.services.require('quests');
  for (const q of PHASE_D_ORDER) {
    expect(quests.state(q), q).toBe('completed');
    expect(h.ctx.state.getBool(`story.${q}.complete`), `story.${q}.complete`).toBe(true);
  }
  for (const [flag, value] of Object.entries(PHASE_D_OUTCOMES[run])) expect(h.ctx.state.getString(flag), flag).toBe(value);
  const inv = h.ctx.services.require('inventory');
  for (const item of ['grisel-writ', 'miners-helm', 'picketts-lantern', 'orsks-cinder', 'slag-core', 'house-pledge-banner']) expect(inv.count(item), item).toBe(1);
  expect(h.ctx.services.require('progression').level).toBeGreaterThanOrEqual(17);
  expect(h.ctx.services.require('progression').level).toBeLessThanOrEqual(19);
}

/** The ending fired exactly once, set the gate, shows the card, opened the second seat and the camp scene is the next thing. */
export function expectEndingFiredOnce(h: ChapterHarness): void {
  expect(h.of('act.ended').filter((e) => e.act === 2)).toEqual([{ act: 2, endingId: ACT2_ENDING_ID }]);
  expect(h.ctx.state.getBool(ACT2_GATE_FLAG)).toBe(true);
  expect(h.ctx.services.require('actEndingCard').active()).toBe(true);
  expect(h.ctx.services.require('companions').maxActive()).toBe(2);
  expect(ACT2_CAMP_DIALOGUE).toBe('scene-act2-camp');
}
