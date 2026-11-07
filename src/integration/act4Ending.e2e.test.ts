/**
 * "The Road to the Rim" on the real plugins (L13 PR 2, brief "the ending fires once: M46 then D08 by injection, with a save
 * and load between, and a load after the card and before the camp"): from the committed m46 fixture (D08 done, M46 not) and
 * d08 fixture (neither), the act ends exactly once, sets `story.gate.a5` once, shows L0's card, fades the party to the
 * Rimfoot fire and plays `scene-act4-camp` there once; a load between the two, or between the card and the camp, never
 * fires it twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { readAct4Fixture } from '../save/__fixtures__/act4';
import { saveFixture } from './fixtureDeterminism';
import { ACT4_ENDING } from './act4Ending.plugin';
import { ACT4_CAMP_DIALOGUE, ACT4_CAMP_LINES } from '../dialogue/content/act4/campScene.dialogue';
import { readOpen } from './phaseEDriver';
import type { PhaseCTrail } from './phaseC';

let h: (ChapterHarness & { loaded: boolean }) | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const GATE = ACT4_ENDING.gateFlag;
const trail = (): PhaseCTrail => ({ talks: [], reads: [], scripted: [] }) as unknown as PhaseCTrail;

async function boot(file: unknown) {
  h = await bootFromSave(file, { models: false, virtualClock: true });
  expect(h.loaded).toBe(true);
  await h.runAsync(10);
  // The hearth check below proves a move only if the boot puts the player well away from it.
  const hearth = h.ctx.anchors.find(ACT4_ENDING.campAnchorId!)!.position;
  const f0 = h.ctx.player.feet;
  if (h.ctx.state.getFlag(ACT4_ENDING.campSeenFlag) !== true && h.ctx.state.getFlag(ACT4_ENDING.cardSeenFlag) !== true) {
    expect(Math.hypot(f0.x - hearth.x, f0.z - hearth.z), 'the boot is away from the fire').toBeGreaterThan(25);
  }
  return h;
}

/** Counts every `true` write of the gate, so a second `setFlag` of the same value still shows. */
function watchGate(t: ChapterHarness): () => number {
  let n = 0;
  const set = t.ctx.state.setFlag.bind(t.ctx.state);
  (t.ctx.state as { setFlag: typeof set }).setFlag = ((k: string, v: unknown) => {
    if (k === GATE && v === true) n++;
    return set(k as never, v as never);
  }) as typeof set;
  return () => n;
}

const card = (t: ChapterHarness) => t.ctx.services.require('actEndingCard');
const ended = (t: ChapterHarness) => t.of('act.ended').filter((e) => e.act === 4);

/** Completes a quest through the quests service (the chain tests play the objectives; here the order is the point). */
function complete(t: ChapterHarness, id: string): void {
  const q = t.ctx.services.require('quests');
  if (q.state(id) === 'inactive') expect(q.start(id), `${id} starts`).toBe(true);
  expect(q.complete(id), `${id} completes`).toBe(true);
}

/** Shows the card (the HUD updates on render), closes it, waits out the fade and reads the camp scene through. */
async function throughCamp(t: ChapterHarness): Promise<{ camps: number; nodes: number }> {
  const dialogue = t.ctx.services.require('dialogue');
  let nodes = 0;
  for (let i = 0; i < 200 && t.ctx.state.getFlag(ACT4_ENDING.campSeenFlag) !== true; i++) {
    t.ctx.hud.update(0.5);
    if (card(t).active()) card(t).dismiss();
    if (dialogue.active) nodes += readOpen(t, trail(), ACT4_CAMP_DIALOGUE);
    await t.runAsync(15);
  }
  // Recorded from the boot on, so a camp the director started during the load's first ticks counts too.
  const camps = t.of('dialogue.started').filter((e) => e.dialogueId === ACT4_CAMP_DIALOGUE).length;
  return { camps, nodes };
}

function expectEndedOnce(t: ChapterHarness, gateWrites: number): void {
  expect(ended(t)).toEqual([{ act: 4, endingId: ACT4_ENDING.endingId }]);
  expect(gateWrites).toBe(1);
  expect(t.ctx.state.getFlag(GATE)).toBe(true);
}

async function expectCampAtHearth(t: ChapterHarness, endedHere = 1): Promise<void> {
  const r = await throughCamp(t);
  expect(r.camps, 'the camp scene played once').toBe(1);
  expect(r.nodes).toBe(ACT4_CAMP_LINES.length);
  expect(t.ctx.state.getFlag(ACT4_ENDING.campSeenFlag)).toBe(true);
  expect(t.ctx.state.getFlag(ACT4_ENDING.cardSeenFlag)).toBe(true);
  const hearth = t.ctx.anchors.find(ACT4_ENDING.campAnchorId!)!.position;
  const f = t.ctx.player.feet;
  expect(Math.hypot(f.x - hearth.x, f.z - hearth.z), `the camp plays at the Rimfoot fire (${JSON.stringify(f)})`).toBeLessThan(20);
  // Nothing more: no second camp, no second ending.
  await t.runAsync(120);
  expect(ended(t)).toHaveLength(endedHere);
}

describe('The Road to the Rim fires exactly once', () => {
  it('D08 then M46: one act.ended, one gate write, the card, the fade to the Rimfoot fire, one camp scene', async () => {
    const t = await boot(await readAct4Fixture('m46'));
    const gate = watchGate(t);
    expect(t.ctx.services.require('quests').state('d08')).toBe('completed');
    expect(ended(t)).toEqual([]);
    expect(t.ctx.state.getFlag(GATE)).toBeUndefined();
    complete(t, 'm46');
    await t.runAsync(5);
    expectEndedOnce(t, gate());
    t.ctx.hud.update(0.5);
    expect(card(t).active()).toBe(true);
    await expectCampAtHearth(t);
  }, 120_000);

  it('M46 then D08 (by injection): nothing ends on M46 alone; the act ends once when D08 follows', async () => {
    const t = await boot(await readAct4Fixture('d08'));
    const gate = watchGate(t);
    // M46 waits for D08 in play; its completion witness written first stands in for the other order.
    t.ctx.state.setFlag('story.m46.complete', true);
    await t.runAsync(5);
    expect(ended(t)).toEqual([]);
    expect(t.ctx.state.getFlag(GATE)).toBeUndefined();
    complete(t, 'd08');
    await t.runAsync(5);
    expectEndedOnce(t, gate());
    await expectCampAtHearth(t);
  }, 120_000);

  it('M46 by injection, a save and load, then D08: still once', async () => {
    const first = await boot(await readAct4Fixture('d08'));
    first.ctx.state.setFlag('story.m46.complete', true);
    await first.runAsync(30);
    expect(ended(first)).toEqual([]);
    const mid = await saveFixture(first);
    first.dispose();
    h = null;
    const t = await boot(mid);
    const gate = watchGate(t);
    expect(ended(t)).toEqual([]);
    complete(t, 'd08');
    await t.runAsync(5);
    expectEndedOnce(t, gate());
    await expectCampAtHearth(t);
  }, 120_000);

  it('a load after the card and before the camp: no second act.ended or card; the camp is owed and plays once', async () => {
    const first = await boot(await readAct4Fixture('m46'));
    complete(first, 'm46');
    await first.runAsync(5);
    first.ctx.hud.update(0.5);
    expect(card(first).active()).toBe(true);
    expect(first.ctx.state.getFlag(ACT4_ENDING.cardSeenFlag)).toBe(true);
    const mid = await saveFixture(first);
    first.dispose();
    h = null;
    const t = await boot(mid);
    const gate = watchGate(t);
    t.ctx.hud.update(0.5);
    expect(card(t).active(), 'the card is not shown again').toBe(false);
    await expectCampAtHearth(t, 0);
    expect(gate()).toBe(0);
    // A later load after the camp plays nothing.
    const after = await saveFixture(t);
    t.dispose();
    h = null;
    const u = await boot(after);
    await u.runAsync(120);
    expect(ended(u)).toEqual([]);
    expect(u.of('dialogue.started').filter((e) => e.dialogueId === ACT4_CAMP_DIALOGUE)).toEqual([]);
    u.ctx.hud.update(0.5);
    expect(card(u).active()).toBe(false);
  }, 180_000);
});
