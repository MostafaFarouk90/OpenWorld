/**
 * Slice 2 Phase A, "The Dead Road", played end to end on a headless game with EVERY real plugin
 * (src/integration/chapterHarness.ts), from "tutorial complete, M01 and M02 completed" through
 * M03 -> M04 -> M05 -> R01 -> R02 -> D01, once per branch pair (Prior released + field saved, Prior defeated + field
 * scorched). The quest script is src/integration/phaseA.ts; it throws at the first hand-off that does not happen.
 *
 * Driven for real (real services, real input through the InputManager window, real trigger volumes):
 * - every talk objective and quest offer: `dialogue.start` then KeyF / Digit1 presses until the dialogue closes, so
 *   node effects run for real (Aelfreda's `leap` grants the Surge Leap, `release` unlocks Release; Gaut's
 *   `m04-spare` unlocks Spare; the carter frees the carters; Tobb's join choice starts M05);
 * - the tutorial: the director's Kettlewick start and its own skip (no flags written by hand);
 * - M03 o2 shard study (F on the interactable), o4 a real Surge Leap (V) from the launch anchor onto the ledge;
 * - goTo objectives: teleport into the real trigger volume, the trigger system reports the entry;
 * - spawns: churchyard wraiths (on the Release flag), ford Footmen (M04 + Spare), toll post, scarecrows (R01), the
 *   yard's blocking dummies (R02), the vault and the Prior all come from their real spawners/plugins; characters use
 *   the real GLB models read from public/assets (so the auto spawners start as in the browser);
 * - M05 wardstones: key 1 pressed on the beat of the shrine's own metronome (performance.now() is a virtual clock that
 *   advances one fixed step per tick, so the beat can be hit exactly), three strikes per stone, west to east;
 *   the Quenchstone rekindled by holding F at its waystone;
 * - R01 scorched: the torch lit at a brazier (F) and carried into each scarecrow (4 s burn); saved: a real Surge (G)
 *   next to each scarecrow, resting at the nearest lit waystone (hold F) when Burn is high;
 * - R02 o2: real sword swings (key 1) on an open guard; o3: real parries (right mouse just before each telegraphed
 *   swing lands); o4: real heavy chops (key 3) on raised guards; M04's toll post falls to real chops too (12 of
 *   them: 120 health, 10 per chop). The player stands 0.45 m left of the target: the right-handed chop lands about
 *   half a metre right of where the Knight faces;
 * - D01: the vault entered and left through the door interactables (F), the arena trigger, the Prior's shields
 *   dropped by a real Surge (G), the release by the real mercy hold (T) on the boss interactable;
 * - Tobb follows as the real companion; NPC posts (Gaut at the ford, Aelfreda at the vault) move by the post rules.
 *
 * Shortcuts (produced through the owning service's public API at the moment the game would produce them):
 * - M01 and M02 are completed with `quests.complete` (the brief's start state; M02's hearth-stone take warns);
 * - kills (one churchyard wraith, two ford soldiers) are `ctx.damage.apply` from the player with a lethal amount: the
 *   real `actor.died` carries the killer and spawn tag; Spare/Release on them are not played;
 * - the Prior's health and poise breaks are `ctx.damage.apply` hits as in src/bosses/prior/prior.plugin.test.ts;
 *   the defeated branch ends him with one lethal hit after the window opened.
 * The player is healed between beats (enemies keep swinging at someone who stands still).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootChapter, type ChapterHarness } from './chapterHarness';
import {
  enterVaultForD01, finishD01, objectiveDone, PHASE_A_ORDER, playM03, playM04, playM05, playR01, playR02,
  reachPhaseAStart, emptyTrails, type FieldBranch, type PriorBranch, type QuestTrail, type Trails,
} from './phaseA';
import { estimateTiming, estimateTimingFor, OPENING_PLAN, PHASE_B_PLAN, timingMarkdown } from './timing';

let h: ChapterHarness | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const flag = (k: string) => h!.ctx.state.getFlag(k);
const qstate = (id: string) => h!.ctx.services.require('quests').state(id);
const fogStanding = () => h!.triggerCentre('trg.fog.harrowmark') !== null && h!.ctx.scene.getObjectByName('fog-wall') !== undefined;

let opening: Record<'m01' | 'm02', QuestTrail> | null = null;

async function chain(field: FieldBranch, prior: PriorBranch): Promise<Trails> {
  h = await bootChapter({ models: true, virtualClock: true });
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  // M01 and M02 are played (the density pass); their trails feed the timing estimate
  const pre: Record<'m01' | 'm02', QuestTrail> = { m01: { talks: [] }, m02: { talks: [] } };
  opening = pre;
  await reachPhaseAStart(h, { play: pre });
  // Start state: tutorial complete, M01 and M02 completed, nothing of Phase A started, mercy locked.
  expect(h.director().complete).toBe(true);
  expect([qstate('m01'), qstate('m02')]).toEqual(['completed', 'completed']);
  for (const q of PHASE_A_ORDER) expect(qstate(q), q).toBe('inactive');
  expect(h.ctx.state.getBool('enemies.mercy.release')).toBe(false);
  expect(h.ctx.state.getBool('enemies.mercy.spare')).toBe(false);
  expect(h.ctx.services.require('companions').active()).toEqual([]);
  expect(fogStanding()).toBe(true);

  const t = emptyTrails();
  await playM03(h, t.m03);
  expect(qstate('m03')).toBe('completed');
  expect(h.ctx.state.getBool('enemies.mercy.release')).toBe(true);
  expect(h.ctx.state.getBool('enemies.mercy.spare')).toBe(false); // Spare waits for Gaut

  await playM04(h, t.m04);
  expect(qstate('m04')).toBe('completed');
  expect(h.ctx.state.getBool('enemies.mercy.spare')).toBe(true);
  expect(flag('story.m04.cartersFreed')).toBe(true);

  await playM05(h, t.m05);
  expect(qstate('m05')).toBe('completed');
  expect(flag('story.m05.complete')).toBe(true);
  expect(fogStanding()).toBe(false); // the wall drops when M05 completes

  await playR01(h, t.r01, field);
  expect(flag('world.brightwater.barley')).toBe(field);
  expect(flag('story.r01.torchUsed') === true).toBe(field === 'scorched');

  await playR02(h, t.r02);
  expect(qstate('r02')).toBe('completed');

  await enterVaultForD01(h, t.d01);
  expect(h.ctx.services.require('interiors').current).toBe('chapel-vault');
  expect(objectiveDone(h, 'd01', 'o1')).toBe(true);
  await finishD01(h, t.d01, prior);

  // The end state.
  for (const q of PHASE_A_ORDER) expect(qstate(q), q).toBe('completed');
  expect(flag('boss.ashen-prior.outcome')).toBe(prior);
  expect(flag('story.m05.complete')).toBe(true);
  const companions = h.ctx.services.require('companions');
  expect(companions.active()).toEqual(['tobb']);
  const tobb = h.ctx.actors.get(companions.actorId('tobb')!)!;
  expect(tobb.root!.position.distanceTo(h.ctx.player.feet)).toBeLessThan(12);
  expect(fogStanding()).toBe(false);
  expect(flag('story.slice.harrowmarkOpen')).toBeUndefined();
  expect(h.ctx.player.actor.dead).toBe(false);
  return t;
}

describe('Phase A chapter chain (all real plugins)', () => {
  it('Prior released, field saved: M03 -> M04 -> M05 -> R01 -> R02 -> D01', async () => {
    const trails = await chain('saved', 'released');
    // Timing estimate from the real anchors and the dialogue nodes this run read (src/integration/TIMING.md).
    const rows = estimateTiming(h!, trails);
    const openingRows = estimateTimingFor(h!, OPENING_PLAN, opening!);
    console.log(timingMarkdown(openingRows));
    console.log(timingMarkdown(rows));
    expect(openingRows.map((r) => r.quest)).toEqual(['m01', 'm02']);
    expect(rows.map((r) => r.quest)).toEqual([...PHASE_A_ORDER]);
  }, 120_000);

  it('Prior defeated, field scorched', async () => {
    await chain('scorched', 'defeated');
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
// Act 1, Phase B (Harrowmark) through "Smoke Over Harrowmark" (thread 21), src/integration/phaseB.ts.
//
// Each run starts from a real Phase A end save (bootFromSave, so the Phase A to Phase B migration is exercised too).
// Driven for real, as in Phase A: every talk, offer and choice through the dialogue service and key presses; goTo
// objectives through the real triggers; the interiors (Keep hall, Counting-House, Underways) through their door
// interactables; the satchel, the copper, the R04 pages and the M09 invoices pressed with F; the M06 and M09 stealth
// sections walked on thread 18's scripted routes (sneak held) and cleared by the real section exit; the M10 chase
// started from its start box and run along thread 18's chase line until the courier is caught; Rook's D02 offer
// (bread, Calm, the Underways door); the kennel hounds from their real spawners; the Act 1 ending director, the
// HUD's card (shown; codex.actEndingSeen), thread 17's world change and the camp scene read to its end.
//
// Shortcuts (each through the owning service's public API):
// - M06 bribe and persuasion gold is granted by the harness (HARNESS_BRIBE_GOLD / HARNESS_TIP_GOLD); thread 19's purses
//   and chests are not farmed;
// - the stealth sections run with thread 18's makeUndetectable (detection has its own tests in src/stealth);
// - kills (cutpurses, guildhall thugs, kennel hounds) are lethal ctx.damage.apply hits from the player;
// - the class choice calls classes.choose (the trainer desk is a DOM modal) and classes.skipDrill;
// - if the walk ends with the courier still running, thread 18's catchCourierForTest (the normal chase.caught path);
// - Gaffer Grimtooth (thread 3b's real boss) is broken by damage hits (grimtooth.ts), then the real Calm hold (T,
//   Hearth Bread) or a lethal hit;
// - the card has no key target headless: the HUD's actEndingCard.dismiss() closes it as its key would.

import { bootFromSave } from './chapterHarness';
import { PHASE_A_FIXTURES, readPhaseAFixture } from '../save/__fixtures__/phaseA';
import { HARNESS_TIP_GOLD, PHASE_B_ORDER, playM06, playPhaseB, reachSouthGate, type PhaseBOptions } from './phaseB';
import { fightGrimtooth } from './grimtooth';

const RUN_A: PhaseBOptions = { route: 'bribe', classId: 'knight', debt: 'forgiven', steward: 'expose', stance: 'steady', grimtooth: 'released' };
const RUN_B: PhaseBOptions = { route: 'stealth', classId: 'warden', debt: 'collected', steward: 'shield', stance: 'bold', grimtooth: 'defeated' };

const CAMP_LINES: Record<'A' | 'B', string[]> = {
  A: ['gate-bribe', 'prior-released', 'grim-released', 'steward-expose', 'debt-forgiven'],
  B: ['gate-stealth', 'prior-defeated', 'grim-defeated', 'steward-shield', 'debt-collected'],
};
const CAMP_NOT: Record<'A' | 'B', string[]> = {
  A: ['gate-stealth', 'gate-persuasion', 'prior-defeated', 'prior-rumour', 'grim-defeated', 'steward-shield', 'debt-collected'],
  B: ['gate-bribe', 'gate-persuasion', 'prior-released', 'prior-rumour', 'grim-released', 'steward-expose', 'debt-forgiven'],
};

async function act1(run: 'A' | 'B') {
  const opts = run === 'A' ? RUN_A : RUN_B;
  const fixture = run === 'A' ? PHASE_A_FIXTURES.releasedSaved : PHASE_A_FIXTURES.defeatedScorched;
  h = await bootFromSave(await readPhaseAFixture(fixture), { models: true, virtualClock: true });
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const gateStates: string[] = [];
  const harrowmark = () => h!.ctx.services.require('harrowmark');
  gateStates.push(harrowmark().southGate.state());
  const trails = await playPhaseB(h, { ...opts, after: () => void gateStates.push(harrowmark().southGate.state()) }, fightGrimtooth);
  for (const q of PHASE_B_ORDER) expect(qstate(q), q).toBe('completed');
  return { trails, gateStates };
}

describe('Act 1: Harrowmark through "Smoke Over Harrowmark" (all real plugins)', () => {
  it('run A (bribe, Knight, forgiven, expose, steady, Grimtooth calmed): the whole act, the ending once, then a reload', async () => {
    const { gateStates, trails } = await act1('A');
    // Harrowmark timing estimate on this run's dialogue nodes (src/integration/TIMING.md).
    const rows = estimateTimingFor(h!, PHASE_B_PLAN, trails);
    console.log(timingMarkdown(rows));
    expect(rows.map((r) => r.quest)).toEqual(Object.keys(PHASE_B_PLAN));
    expect(gateStates[0]).toBe('closed');
    expect(gateStates.slice(1).every((s) => s === 'open')).toBe(true);
    expect(flag('story.m06.route')).toBe('bribe');
    expect(h!.ctx.services.require('classes').current()).toBe('knight');
    expect(flag('boss.gaffer-grimtooth.outcome')).toBe('released');
    expect(h!.of('mercy').some((e) => (e as { ledgerId?: string }).ledgerId === 'D02')).toBe(true);
    // The ending: once, in order (act.ended before the camp), the card seen, the world change, the camp lines.
    expect(h!.of('act.ended')).toEqual([{ act: 1, endingId: 'smoke-over-harrowmark' }]);
    const types = h!.events.map((e) => e.type as string);
    expect(types.indexOf('act.ended')).toBeLessThan(types.indexOf('hud.actEnding.closed'));
    expect(types.indexOf('hud.actEnding.closed')).toBeLessThan(types.lastIndexOf('story.act1.camp.begin' as never));
    const dialogue = h!.ctx.services.require('dialogue');
    for (const n of CAMP_LINES.A) expect(dialogue.hasSeen(n), n).toBe(true);
    for (const n of CAMP_NOT.A) expect(dialogue.hasSeen(n), n).toBe(false);
    expect(flag('codex.actEndingSeen')).toBe(true);
    expect(flag('story.d02.campSeen')).toBe(true);
    // Nothing of Act 2 opened.
    expect([...h!.ctx.state.flagsWith('story.m11'), ...h!.ctx.state.flagsWith('story.gate.a3')]).toEqual([]);

    // A save after the ending loads with the world change standing, no card, no camp, no second act.ended.
    await h!.runAsync(5);
    expect((await h!.ctx.services.require('save').saveNow('manual')).ok).toBe(true);
    await h!.flush();
    const saved = JSON.parse(JSON.stringify(h!.fake.peek('slot-0')));
    h!.dispose();
    const r = await bootFromSave(saved, { models: true, virtualClock: true });
    h = r;
    expect(r.loaded).toBe(true);
    for (let i = 0; i < 120; i++) {
      r.run(1);
      r.ctx.hud.update(1 / 60);
    }
    expect(r.of('act.ended')).toEqual([]);
    expect(r.ctx.services.require('dialogue').active).toBe(false);
    expect(r.of('dialogue.started')).toEqual([]);
    expect(flag('story.gate.a2')).toBe(true);
    const wc = (r.ctx.services.require('harrowmark') as unknown as { worldChange(): { active: boolean; banners: number; braziers: number } }).worldChange();
    expect(wc).toEqual({ active: true, banners: 10, braziers: 21 });
  }, 300_000);

  it('run B (stealth, Warden, collected, shield, bold, Grimtooth defeated)', async () => {
    const { gateStates } = await act1('B');
    expect(gateStates[0]).toBe('closed');
    expect(gateStates[1]).toBe('open');
    expect(flag('story.m06.route')).toBe('stealth');
    expect(h!.ctx.services.require('classes').current()).toBe('warden');
    expect(flag('story.m08.stance')).toBe('bold');
    expect(h!.of('act.ended')).toHaveLength(1);
    const dialogue = h!.ctx.services.require('dialogue');
    for (const n of CAMP_LINES.B) expect(dialogue.hasSeen(n), n).toBe(true);
    for (const n of CAMP_NOT.B) expect(dialogue.hasSeen(n), n).toBe(false);
  }, 300_000);

  it('M06 reachability: walking up the road (held move key), Rook is talkable outside the shut portcullis and F opens his offer', async () => {
    h = await bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved), { models: true, virtualClock: true });
    const ctx = h.ctx;
    expect(ctx.services.require('harrowmark').southGate.state()).toBe('closed');
    expect(qstate('m06')).toBe('inactive');
    const rookPost = h.anchor('npc-post.rook.gate');
    await h.runAsync(30);
    const rook = ctx.services.require('npcs').position('rook')!;
    expect(Math.hypot(rook.x - rookPost.x, rook.z - rookPost.z)).toBeLessThan(1);
    expect(rook.z).toBeLessThan(1250); // the road side of the portcullis
    // From 40 m down the road, walk north (+Z) until he is in focus. Headless there is no camera rig, so movement is in
    // the world frame (forward is -Z): back walks north; the facing follows the movement.
    await h.teleport({ x: rook.x, z: rook.z - 40 }, 10, Math.PI);
    const focus = () => (ctx.interaction as unknown as { focusFor(a: string): { id: string } | null }).focusFor('interact')?.id;
    h.key('keydown', 'KeyS');
    let seen: string | undefined;
    for (let i = 0; i < 60 * 15 && seen !== 'npc:rook'; i++) {
      h.run(1);
      seen = focus();
    }
    h.key('keyup', 'KeyS');
    expect(seen, JSON.stringify({ feet: ctx.player.feet, rook, yaw: (ctx.player as unknown as { yaw?: number }).yaw })).toBe('npc:rook');
    expect(ctx.player.feet.z).toBeLessThan(1250);
    h.run(10);
    if (focus() === 'npc:rook') h.press('KeyF');
    expect(ctx.services.require('dialogue').active).toBe(true);
    expect(h.of('dialogue.started').at(-1)).toEqual({ dialogueId: 'npc-rook', npcId: 'rook' });
  }, 60_000);

  it('M06 by persuasion: the tipped argument at Halvard Banked with 25 gold, the gate closed then open', async () => {
    h = await bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved), { models: true, virtualClock: true });
    await reachSouthGate(h);
    await playM06(h, { talks: [] }, 'persuasion');
    expect(flag('story.m06.route')).toBe('persuasion');
    expect(h.ctx.services.require('inventory').gold).toBe(0);
    expect(h.of('gold.spent').at(-1)).toMatchObject({ amount: HARNESS_TIP_GOLD, reason: 'persuasion' });
  }, 120_000);
});
