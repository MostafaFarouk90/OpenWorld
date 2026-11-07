/**
 * The seven side quests the occupation stranded (R03, R04, D02, j05, j07, j08, j10; plans/open-followups.md) finish in the
 * world after the ending (Act 5 N13, plans/act5-N13.md section 5): one test each, each playing the shipped headless
 * driver (integration/phaseB.ts, integration/side.ts) on a booted game with every real plugin, as the Act 4 containment
 * and side-job e2e tests do (the quests need the whole city: its NPCs, interiors, spawners, dialogue and quests).
 *
 * The save: Act 4's committed M46 fixture (the city held since M38), with the seven quests and their story flags taken out
 * (the chain played R03, R04 and D02 in Act 1 and never the jobs; D02's test resets only D02, whose offer needs R03 and R04 done) and j04 marked done (j10's prerequisite), then the
 * ending's flags written as N11 and N12 write them. The failure path: the same save without `world.afterEnding`, where
 * the quests' people are gone and the city's gates are shut.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { playD02, playR03, playR04 } from '../integration/phaseB';
import { playJ05, playJ07, playJ08, playJ10 } from '../integration/side';
import * as THREE from 'three';
import { ARENA, GRIMTOOTH_BOSS_ID } from '../bosses/grimtooth/tuning';
import { ensure, runHealed } from '../integration/phaseA';
import type { ChapterHarness as Harness } from '../integration/chapterHarness';
import type { QuestTrail } from '../integration/phaseA';
import { fogOpenById } from '../region/fogWall';
import { WORKING_GATES } from '../harrowmark/act4/sites';
import { STRANDED, strandedSave } from './testing';

const TIMEOUT = 600_000;

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

async function boot(after: boolean, reset: readonly string[] = STRANDED) {
  h = await bootFromSave(await strandedSave(after, 'rekindle', reset), { models: true, virtualClock: true });
  expect(h.loaded, 'the save loaded').toBe(true);
  expect(h.statuses.filter((s) => s.state !== 'ok').map((s) => s.id)).toEqual([]);
  return h;
}

const trail = (): QuestTrail => ({ talks: [] });

/**
 * Grimtooth for a level 30-odd Cael: the shipped driver steps his phases with hits sized for Act 1 (a late-game hit skips a
 * phase), so this one walks into the arena through its real trigger, waits for his intro and puts him down with lethal
 * player hits (the `defeated` branch; the Calm release is Act 1's and is covered there).
 */
async function grimtoothLate(hh: Harness): Promise<void> {
  const ctx = hh.ctx;
  await hh.enterTrigger(ARENA.arenaTrigger);
  for (let i = 0; i < 20 && !ctx.bosses.state(GRIMTOOTH_BOSS_ID); i++) runHealed(hh, 0.5);
  ensure(ctx.bosses.state(GRIMTOOTH_BOSS_ID), 'Grimtooth registered after his intro');
  for (let i = 0; i < 12 && ctx.state.getFlag('boss.gaffer-grimtooth.outcome') !== 'defeated'; i++) {
    const s = ctx.bosses.state(GRIMTOOTH_BOSS_ID);
    if (s) ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: s.actorId, amount: 1e6, poise: 1e6, kind: 'melee', direction: new THREE.Vector3(0, 0, -1) });
    runHealed(hh, 3);
  }
}
const npcHere = (id: string) => [...h!.ctx.actors.all()].some((a) => a.kind === `npc:${id}`);
const state = (q: string) => h!.ctx.services.require('quests').state(q);
const gold = () => h!.ctx.services.require('inventory').gold;

describe('the stranded side quests after the ending (N13)', () => {
  it('fail path: without world.afterEnding the givers are gone and every working gate face is shut', async () => {
    await boot(false);
    for (const id of ['aldith', 'whitlock', 'stallholder-1', 'sexton', 'sergeant', 'crumb', 'chandler', 'guild-doorman', 'pellam', 'crabbe']) {
      expect(npcHere(id), `${id} is away while the city is held`).toBe(false);
    }
    for (const g of WORKING_GATES) expect(fogOpenById(`fog.harrowmark.gate.${g}`, h!.ctx.state), `${g} face`).toBe(false);
  }, TIMEOUT);

  it('R03 The Brewer\'s Debt completes (Aldith home, the thugs at the guildhall, one route each way)', async () => {
    await boot(true);
    const before = gold();
    await playR03(h!, trail(), 'collected');
    expect(state('r03')).toBe('completed');
    expect(gold()).toBeGreaterThan(before);
  }, TIMEOUT);

  it('R04 The Archivist\'s Missing Pages completes (Whitlock and the Archive open again)', async () => {
    await boot(true);
    await playR04(h!, trail(), 'expose');
    expect(state('r04')).toBe('completed');
  }, TIMEOUT);

  it('D02 Hounds of the Underways completes (Rook at the Bastion, the Underways door inside the walls)', async () => {
    // D02 opens only once every Act 1 M and R quest is done, so only D02 is reset here.
    await boot(true, ['d02']);
    await playD02(h!, trail(), 'defeated', async (hh) => grimtoothLate(hh));
    expect(state('d02')).toBe('completed');
  }, TIMEOUT);

  it('j05 Crumb completes (the stallholder and Crumb home)', async () => {
    await boot(true);
    await playJ05(h!, trail());
    expect(state('j05')).toBe('completed');
  }, TIMEOUT);

  it('j07 the chapel candles completes (the chandler and the sexton home)', async () => {
    await boot(true);
    await playJ07(h!, trail());
    expect(state('j07')).toBe('completed');
  }, TIMEOUT);

  it('j08 Watch Patrol completes (the sergeant home, the cutpurses in the lanes)', async () => {
    await boot(true);
    await playJ08(h!, trail());
    expect(state('j08')).toBe('completed');
  }, TIMEOUT);

  it('j10 Tobb\'s Second Verse completes (Tobb benched at the Anvil, the fire ring in its yard)', async () => {
    await boot(true);
    await playJ10(h!, trail(), 'gate');
    expect(state('j10')).toBe('completed');
  }, TIMEOUT);
});
