/**
 * "The Coal-Mother's Oath" on the real plugins (K16 PR 2, brief "the ending fires once on M34 and D06 in either completion
 * order and after a load between them"): from the committed d06 fixture (M34 done, D06 not), the act ends exactly once,
 * sets `story.gate.a4` once, shows K15's card, fades the party to the Wyrmwatch Lodge hearth and plays `scene-act3-camp`
 * there once; a load between M34 and D06, or between the card and the camp, never fires it twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { readAct3Fixture } from '../save/__fixtures__/act3';
import { saveFixture } from './fixtureDeterminism';
import { ACT3_ENDING } from './act3Ending.plugin';
import { ACT3_CAMP_DIALOGUE, ACT3_CAMP_LINES } from '../dialogue/content/act3/campScene.dialogue';
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

const GATE = ACT3_ENDING.gateFlag;
const trail = (): PhaseCTrail => ({ talks: [], reads: [], scripted: [] }) as unknown as PhaseCTrail;

async function boot(file: unknown) {
  h = await bootFromSave(file, { models: false, virtualClock: true });
  expect(h.loaded).toBe(true);
  await h.runAsync(10);
  // The hearth check below proves a move only if the boot puts the player well away from it.
  const hearth = h.ctx.anchors.find(ACT3_ENDING.campAnchorId!)!.position;
  const f0 = h.ctx.player.feet;
  if (h.ctx.state.getFlag(ACT3_ENDING.campSeenFlag) !== true && h.ctx.state.getFlag(ACT3_ENDING.cardSeenFlag) !== true) {
    expect(Math.hypot(f0.x - hearth.x, f0.z - hearth.z), 'the boot is away from the hearth').toBeGreaterThan(25);
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
const ended = (t: ChapterHarness) => t.of('act.ended').filter((e) => e.act === 3);

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
  for (let i = 0; i < 200 && t.ctx.state.getFlag(ACT3_ENDING.campSeenFlag) !== true; i++) {
    t.ctx.hud.update(0.5);
    if (card(t).active()) card(t).dismiss();
    if (dialogue.active) nodes += readOpen(t, trail(), ACT3_CAMP_DIALOGUE);
    await t.runAsync(15);
  }
  // Recorded from the boot on, so a camp the director started during the load's first ticks counts too.
  const camps = t.of('dialogue.started').filter((e) => e.dialogueId === ACT3_CAMP_DIALOGUE).length;
  return { camps, nodes };
}

function expectEndedOnce(t: ChapterHarness, gateWrites: number): void {
  expect(ended(t)).toEqual([{ act: 3, endingId: ACT3_ENDING.endingId }]);
  expect(gateWrites).toBe(1);
  expect(t.ctx.state.getFlag(GATE)).toBe(true);
}

async function expectCampAtHearth(t: ChapterHarness, endedHere = 1): Promise<void> {
  const r = await throughCamp(t);
  expect(r.camps, 'the camp scene played once').toBe(1);
  expect(r.nodes).toBe(ACT3_CAMP_LINES.length);
  expect(t.ctx.state.getFlag(ACT3_ENDING.campSeenFlag)).toBe(true);
  expect(t.ctx.state.getFlag(ACT3_ENDING.cardSeenFlag)).toBe(true);
  const hearth = t.ctx.anchors.find(ACT3_ENDING.campAnchorId!)!.position;
  const f = t.ctx.player.feet;
  expect(Math.hypot(f.x - hearth.x, f.z - hearth.z), `the camp plays at the lodge hearth (${JSON.stringify(f)})`).toBeLessThan(20);
  // Nothing more: no second camp, no second ending.
  await t.runAsync(120);
  expect(ended(t)).toHaveLength(endedHere);
}

describe("The Coal-Mother's Oath fires exactly once", () => {
  it('M34 then D06: one act.ended, one gate write, the card, the fade to the hearth, one camp scene', async () => {
    const t = await boot(await readAct3Fixture('greyfen', 'd06'));
    const gate = watchGate(t);
    expect(t.ctx.services.require('quests').state('m34')).toBe('completed');
    expect(ended(t)).toEqual([]);
    complete(t, 'd06');
    await t.runAsync(5);
    expectEndedOnce(t, gate());
    t.ctx.hud.update(0.5);
    expect(card(t).active()).toBe(true);
    await expectCampAtHearth(t);
  }, 120_000);

  it('D06 then M34: nothing ends on D06 alone; the act ends once when M34 follows', async () => {
    const t = await boot(await readAct3Fixture('greyfen', 'm34'));
    const gate = watchGate(t);
    // D06 waits for M34 in play; its completion witness written first stands in for the other order.
    t.ctx.state.setFlag('story.d06.complete', true);
    await t.runAsync(5);
    expect(ended(t)).toEqual([]);
    expect(t.ctx.state.getFlag(GATE)).toBeUndefined();
    complete(t, 'm34');
    await t.runAsync(5);
    expectEndedOnce(t, gate());
    await expectCampAtHearth(t);
  }, 120_000);

  it('a save and load between M34 and D06, then D06: still once', async () => {
    const first = await boot(await readAct3Fixture('greyfen', 'd06'));
    await first.runAsync(30);
    const mid = await saveFixture(first);
    first.dispose();
    h = null;
    const t = await boot(mid);
    const gate = watchGate(t);
    expect(ended(t)).toEqual([]);
    complete(t, 'd06');
    await t.runAsync(5);
    expectEndedOnce(t, gate());
    await expectCampAtHearth(t);
  }, 120_000);

  it('a load after the card and before the camp: no second act.ended or card; the camp is owed and plays once', async () => {
    const first = await boot(await readAct3Fixture('greyfen', 'd06'));
    complete(first, 'd06');
    await first.runAsync(5);
    first.ctx.hud.update(0.5);
    expect(card(first).active()).toBe(true);
    // Saved with the card up (shown, so marked seen) and the camp not yet played: the player closes the game here.
    expect(first.ctx.state.getFlag(ACT3_ENDING.cardSeenFlag)).toBe(true);
    const mid = await saveFixture(first);
    first.dispose();
    h = null;
    const t = await boot(mid);
    const gate = watchGate(t);
    t.ctx.hud.update(0.5);
    expect(card(t).active(), 'the card is not shown again').toBe(false);
    await expectCampAtHearth(t, 0);
    expect(gate()).toBe(0);
  }, 120_000);
});
