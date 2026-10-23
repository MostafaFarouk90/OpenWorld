/**
 * Drives a Phase C complete game through the Phase D quest states the fixtures capture, at service level: each quest is
 * started on the real quests service and its objectives and completion go through the same calls the effects use, so every
 * director (A13's story flags, the posts, the ending) reacts exactly as in play. The playable Phase D chain is
 * `phaseD.ts`; this is the cheap, deterministic route to a checkpoint save (used by fixtures.genD.test.ts and the
 * migration tests).
 */
import type { ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import { ACT2_QUEST_DEFS } from '../quests/content/act2';
import { ACT2_PREREQS } from '../quests/actJump';

const quests = (h: ChapterHarness) => h.ctx.services.require('quests');

/** Starts a quest (if it is not) and completes its listed objectives, in order. */
export function begin(h: ChapterHarness, id: string, objectives: readonly string[] = []): void {
  const qs = quests(h);
  if (qs.state(id) === 'inactive') ensure(qs.start(id), `${id} started`);
  for (const o of objectives) ensure(qs.completeObjective(id, o), `${id}.${o} completed`);
  h.run(2);
}

/** Starts a quest and plays out every objective, then completes it. */
export function finish(h: ChapterHarness, id: string): void {
  const qs = quests(h);
  if (qs.state(id) === 'completed') return;
  const def = ACT2_QUEST_DEFS.find((d) => d.id === id);
  ensure(def, `${id} has a def`);
  begin(h, id);
  for (const o of def!.objectives) if (!qs.objectiveDone(id, o.id)) qs.completeObjective(id, o.id);
  if (qs.state(id) !== 'completed') ensure(qs.complete(id), `${id} completed`);
  h.run(2);
}

/** Completes, in order, every quest in the row of `last` that is not done yet (a Phase C complete save has the earlier ones). */
export function finishThrough(h: ChapterHarness, last: string): void {
  const row = ACT2_PREREQS[last];
  ensure(row, `${last} has a prerequisite row`);
  for (const q of row) finish(h, q);
}

/** Dismisses the ending card and reads the camp scene to its end (a player's key presses). */
export function playEndingCamp(h: ChapterHarness): void {
  h.ctx.services.require('actEndingCard').dismiss();
  h.run(5);
  const dlg = h.ctx.services.require('dialogue');
  ensure(dlg.active, 'the camp scene started');
  for (let i = 0; i < 40 && dlg.active; i++) {
    h.press('KeyF');
    h.run(10);
  }
  ensure(!dlg.active, 'the camp scene ended');
}
