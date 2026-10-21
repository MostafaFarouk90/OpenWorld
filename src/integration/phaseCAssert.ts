import { expect } from 'vitest';
import type { ChapterHarness } from './chapterHarness';
import { PHASE_C_ORDER } from './phaseC';

/** What run A (every first branch) and run B (every second branch) leave behind. */
export const PHASE_C_OUTCOMES = {
  A: { 'story.r05.choice': 'safe', 'story.r06.choice': 'cleansed', 'story.r07.choice': 'spared', 'story.r11.choice': 'slain', 'story.d03.outcome': 'defeated' },
  B: { 'story.r05.choice': 'fox', 'story.r06.choice': 'sealed', 'story.r07.choice': 'culled', 'story.r11.choice': 'spared', 'story.d03.outcome': 'spared' },
} as const;

/** The state after the whole of Phase C was played (or loaded): quests, branch flags, companions, rewards, gates. */
export function expectPhaseCComplete(h: ChapterHarness, run: 'A' | 'B'): void {
  const quests = h.ctx.services.require('quests');
  for (const q of PHASE_C_ORDER) expect(quests.state(q), q).toBe('completed');
  for (const [flag, value] of Object.entries(PHASE_C_OUTCOMES[run])) expect(h.ctx.state.getString(flag), flag).toBe(value);
  expect(h.ctx.state.getBool('story.m13.hrolfJoined')).toBe(true);
  expect(h.ctx.state.getBool('story.m14.aelfredaJoined')).toBe(true);
  expect(h.ctx.state.getBool('story.gate.a2')).toBe(true);
  const inv = h.ctx.services.require('inventory');
  expect(inv.count('redmanes-lance'), 'the D03 lance').toBe(1);
  expect(inv.count('wyrmling-scale'), 'the M15 scale').toBe(1);
  expect(inv.count(run === 'A' ? 'brothers-axe-full' : 'brothers-axe-lesser'), 'the R11 axe').toBe(1);
  expect(inv.count('pup-companion'), 'the R07 pup').toBe(run === 'A' ? 1 : 0);
  expect(h.ctx.services.require('progression').level).toBeGreaterThanOrEqual(8);
}
