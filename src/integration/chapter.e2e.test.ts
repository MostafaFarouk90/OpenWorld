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
  reachPhaseAStart, emptyTrails, type FieldBranch, type PriorBranch, type Trails,
} from './phaseA';
import { estimateTiming, timingMarkdown } from './timing';

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

async function chain(field: FieldBranch, prior: PriorBranch): Promise<Trails> {
  h = await bootChapter({ models: true, virtualClock: true });
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  await reachPhaseAStart(h);
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
  expect(fogStanding()).toBe(true); // Phase A: story.m05.complete does not open the wall

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
  expect(fogStanding()).toBe(true);
  expect(flag('story.slice.harrowmarkOpen')).toBeUndefined();
  expect(h.ctx.player.actor.dead).toBe(false);
  return t;
}

describe('Phase A chapter chain (all real plugins)', () => {
  it('Prior released, field saved: M03 -> M04 -> M05 -> R01 -> R02 -> D01', async () => {
    const trails = await chain('saved', 'released');
    // Timing estimate from the real anchors and the dialogue nodes this run read (src/integration/TIMING.md).
    const rows = estimateTiming(h!, trails);
    console.log(timingMarkdown(rows));
    expect(rows.map((r) => r.quest)).toEqual([...PHASE_A_ORDER]);
  }, 120_000);

  it('Prior defeated, field scorched', async () => {
    await chain('scorched', 'defeated');
  }, 120_000);
});
