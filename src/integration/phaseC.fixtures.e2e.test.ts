/**
 * Phase C from its saves: each fixture loads clean, and the quest it stopped in plays on from there, so a reload at
 * those moments (the first Cinderreach save, a raid in progress, the Anvil rekindled, the keep ahead) is proven and the
 * branches that differ only at the end (Redmane) cost one fight instead of a whole run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture, type Act2CFixture } from '../save/__fixtures__/act2c';
import { emptyPhaseCTrail, playPhaseCQuest } from './phaseC';

let h: ChapterHarness | null = null;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

async function load(name: Act2CFixture): Promise<ChapterHarness> {
  h = await bootFromSave(await readAct2CFixture(name), { models: true, virtualClock: true });
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  return h;
}
const state = (id: string) => h!.ctx.services.require('quests').state(id);
// Headless GLB loads cannot decode textures; that is the only error noise a clean load has.
const errors = () => (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => !String(c[0]).includes("Couldn't load texture"));

describe('Phase C fixtures load and play on', () => {
  it('act2-m11-start: Act 1 done, M11 not begun, River Gate open', async () => {
    await load(ACT2_C_FIXTURES.m11Start);
    expect(state('m11')).toBe('inactive');
    expect(state('d02')).toBe('completed');
    expect(h!.ctx.state.getBool('story.gate.a2')).toBe(true);
    expect(errors()).toEqual([]);
  }, 60_000);

  it('act2-m12-start: M11 done, M12 offered next; the game plays M12 from here', async () => {
    await load(ACT2_C_FIXTURES.m12Start);
    expect(state('m11')).toBe('completed');
    expect(state('m12')).toBe('inactive');
    await playPhaseCQuest(h!, emptyPhaseCTrail(), 'm12');
    expect(state('m12')).toBe('completed');
  }, 120_000);

  it('act2-m12-mid-wave: a raid in progress reloads and still ends (the A12 x A7 double-start seam)', async () => {
    await load(ACT2_C_FIXTURES.m12MidWave);
    expect(state('m12')).toBe('active');
    await playPhaseCQuest(h!, emptyPhaseCTrail(), 'm12');
    expect(state('m12')).toBe('completed');
    // The raid ended once: no raider of the set is left standing over the finished quest.
    expect([...h!.ctx.actors.all()].filter((a) => !a.dead && (a as { spawnTag?: string }).spawnTag === 'm12')).toEqual([]);
  }, 120_000);

  it('act2-m14-hushed-anvil: the Anvil rekindled; murals, keeper and tempering finish M14', async () => {
    await load(ACT2_C_FIXTURES.m14HushedAnvil);
    expect(state('m14')).toBe('active');
    await playPhaseCQuest(h!, emptyPhaseCTrail(), 'm14');
    expect(state('m14')).toBe('completed');
    expect(h!.ctx.state.getBool('story.m14.aelfredaJoined')).toBe(true);
  }, 120_000);

  it('R06 splits by class: an Emberwright cleanses the well with fire and skips the rite; the Knight runs the rite', async () => {
    await load(ACT2_C_FIXTURES.m12Start);
    await playPhaseCQuest(h!, emptyPhaseCTrail(), 'm12');
    // The trainer menu's permit, held for the change.
    const release = h!.ctx.services.require('progression').allowRespec('trainer');
    expect(h!.ctx.services.require('classes').change('emberwright')).toEqual({ ok: true });
    release();
    h!.run(2);
    expect(h!.ctx.state.getBool('story.r06.emberwright')).toBe(true);
    const trail = emptyPhaseCTrail();
    await playPhaseCQuest(h!, trail, 'r06');
    expect(state('r06')).toBe('completed');
    expect(trail.order).toContain('r06.fire');
    expect(trail.order).not.toContain('r06.rite');
    expect(h!.ctx.state.getString('story.r06.choice')).toBe('cleansed');
  }, 120_000);

  for (const outcome of ['spared', 'defeated'] as const) {
    it(`act2-d03-scorchhold: Redmane ${outcome}, then the prisoners, the testimony (if spared) and Osgar`, async () => {
      await load(ACT2_C_FIXTURES.d03Scorchhold);
      expect(state('d03')).toBe('active');
      await playPhaseCQuest(h!, emptyPhaseCTrail(), 'd03', { choices: { 'd03.boss': outcome === 'spared' ? [1] : [] } });
      expect(state('d03')).toBe('completed');
      expect(h!.ctx.state.getString('story.d03.outcome')).toBe(outcome);
      expect(h!.ctx.services.require('inventory').count('redmanes-lance')).toBe(1);
    }, 120_000);
  }

  it('D03 done shows the "Act 2 continues" card once while Oldsmoke is held, and a reload does not show it again', async () => {
    await load(ACT2_C_FIXTURES.d03Scorchhold);
    const card = h!.ctx.services.require('actEndingCard');
    expect(card.active()).toBe(false);
    await playPhaseCQuest(h!, emptyPhaseCTrail(), 'd03');
    for (let i = 0; i < 10; i++) {
      h!.run(1);
      h!.ctx.hud.update(1 / 60);
    }
    expect(card.active(), 'the card is up').toBe(true);
    expect(h!.ctx.state.getBool('codex.actEnding.a2c.seen')).toBe(true);
    // It is its own card: the real Act 2 ending did not fire.
    expect(h!.of('act.ended')).toEqual([]);
    expect(h!.ctx.state.getBool('story.gate.a3')).toBeFalsy();
    card.dismiss();
    expect(card.active()).toBe(false);
    // A load never re-derives it (the card answers only D03's completion): a complete save shows nothing.
    h!.dispose();
    await load(ACT2_C_FIXTURES.completeDefeated);
    for (let i = 0; i < 10; i++) {
      h!.run(1);
      h!.ctx.hud.update(1 / 60);
    }
    expect(h!.ctx.services.require('actEndingCard').active()).toBe(false);
  }, 120_000);

  it('the two complete fixtures load with every Phase C quest done and the branches kept', async () => {
    await load(ACT2_C_FIXTURES.completeDefeated);
    expect(h!.ctx.state.getString('story.d03.outcome')).toBe('defeated');
    expect(state('d03')).toBe('completed');
    // Both Act 2 companions have a display name in the loaded game (the party screen and the portrait read them).
    for (const key of ['companion.hrolf.name', 'companion.aelfreda.name']) expect(h!.ctx.strings.t(key), key).not.toBe(key);
    h!.dispose();
    await load(ACT2_C_FIXTURES.completeSpared);
    expect(h!.ctx.state.getString('story.d03.outcome')).toBe('spared');
    expect(h!.ctx.state.getString('story.r07.choice')).toBe('culled');
    expect(warn).toBeDefined();
    expect(errors()).toEqual([]);
  }, 60_000);
});
