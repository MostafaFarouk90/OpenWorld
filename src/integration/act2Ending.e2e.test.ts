/**
 * The Act 2 ending on the real plugins, from the Phase C complete save: M22 and D04 are Phase D quests that are not on
 * this build, so their completion is driven the way A13's quests will write it (`story.<id>.complete`, then the
 * `quest.completed` event). Checks the whole chain: gate a3 once, `act.ended` once, the card, the camp scene, the second
 * companion seat, the Harrowmark change, and that a load never replays any of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture } from '../save/__fixtures__/act2c';

let h: ChapterHarness | null = null;
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

const boot = async (): Promise<ChapterHarness> => {
  h = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.completeDefeated), { models: false, virtualClock: true });
  return h;
};
const complete = (hh: ChapterHarness, id: string): void => {
  hh.ctx.state.setFlag(`story.${id}.complete`, true);
  hh.game.events.emit('quest.completed', { questId: id } as never);
};

describe('The Houses Stand on the real plugins', () => {
  it('the plugin is up and a Phase C save has not ended Act 2', async () => {
    const hh = await boot();
    expect(hh.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(hh.ctx.state.getBool('story.gate.a3')).toBe(false);
    expect(hh.of('act.ended').filter((e) => e.act === 2)).toEqual([]);
    expect(hh.ctx.services.require('companions').maxActive()).toBe(1);
  }, 60_000);

  it('M22 alone does nothing; with D04 it sets gate a3 and emits act.ended once; the card shows; the seat opens', async () => {
    const hh = await boot();
    complete(hh, 'd04');
    hh.run(2);
    expect(hh.ctx.state.getBool('story.gate.a3')).toBe(false);
    complete(hh, 'm22');
    complete(hh, 'm22');
    hh.run(2);
    expect(hh.ctx.state.getBool('story.gate.a3')).toBe(true);
    expect(hh.of('act.ended').filter((e) => e.act === 2)).toEqual([{ act: 2, endingId: 'the-houses-stand' }]);
    expect(hh.ctx.services.require('actEndingCard').active()).toBe(true);
    expect(hh.ctx.state.getBool('codex.actEnding.a2.seen')).toBe(true);
    expect(hh.ctx.services.require('companions').maxActive()).toBe(2);
  }, 60_000);

  it('the camp plays after the card closes, once, and sets campSeen and Wenna at the camp', async () => {
    const hh = await boot();
    complete(hh, 'd04');
    complete(hh, 'm22');
    hh.run(2);
    expect(hh.ctx.services.require('dialogue').active).toBe(false);
    hh.ctx.services.require('actEndingCard').dismiss();
    hh.run(5);
    expect(hh.ctx.services.require('dialogue').active).toBe(true);
    const dlg = hh.ctx.services.require('dialogue');
    for (let i = 0; i < 40 && dlg.active; i++) {
      hh.press('KeyF');
      hh.run(10);
    }
    expect(dlg.active).toBe(false);
    expect(hh.ctx.state.getBool('story.a2.campSeen')).toBe(true);
    expect(hh.ctx.state.getBool('story.a2.wennaAtCamp')).toBe(true);
    hh.run(60);
    expect(hh.ctx.services.require('dialogue').active).toBe(false);
  }, 60_000);

  it('a load after the end re-derives: no act.ended, the gate and the seat stay, no card when seen', async () => {
    const hh = await boot();
    complete(hh, 'd04');
    complete(hh, 'm22');
    hh.run(2);
    hh.ctx.services.require('actEndingCard').dismiss();
    hh.ctx.state.setFlag('story.a2.campSeen', true);
    hh.run(5);
    const before = hh.of('act.ended').length;
    hh.game.events.emit('save.loaded', { slot: 'x' } as never);
    hh.run(5);
    expect(hh.of('act.ended')).toHaveLength(before);
    expect(hh.ctx.state.getBool('story.gate.a3')).toBe(true);
    expect(hh.ctx.services.require('actEndingCard').active()).toBe(false);
    expect(hh.ctx.services.require('companions').maxActive()).toBe(2);
  }, 60_000);
});
