// The "peaks are next" card (K16) on a reduced manifest: core, hud and phase-e.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../core/testing/bootPlugins';
import hudPlugin from '../hud/hud.plugin';
import { textOf } from '../hud/dom';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import phaseE, { type PhaseECardHandle } from './phaseE.plugin';
import { DRAGONSPINE_OPEN_FLAG } from '../quests/act3Jump';
import { PEAKS_CARD_SEEN_FLAG, PEAKS_CARD_TRIGGER_FLAG, PHASE_E_STRINGS_EN } from './phaseECard';
import { ACT3_FLAG_OWNERS } from '../quests/lint/act3Flags';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  phaseE.dispose?.();
  vi.restoreAllMocks();
});

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, hudPlugin, phaseE]);
  expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const ctx = game.ctx;
  const card = (globalThis as { __phaseECard?: PhaseECardHandle }).__phaseECard!;
  const dialogue = { active: false };
  (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('dialogue', dialogue);
  return { game, ctx, card, dialogue };
}

describe('the "peaks are next" card', () => {
  it('stays hidden until D05 is done, then shows once with the Phase E line and sets its once-flag', async () => {
    const { ctx, card } = await boot();
    expect(card.visible).toBe(false);
    expect(ctx.state.getBool(PEAKS_CARD_SEEN_FLAG)).toBe(false);
    ctx.state.setFlag(PEAKS_CARD_TRIGGER_FLAG, true);
    expect(card.visible).toBe(true);
    expect(ctx.state.getBool(PEAKS_CARD_SEEN_FLAG)).toBe(true);
    const text = textOf(card.element);
    expect(text).toContain(PHASE_E_STRINGS_EN['hud.phaseE.peaks.title']);
    expect(text).toContain(PHASE_E_STRINGS_EN['hud.phaseE.peaks.line.held']);
    card.dismiss();
    expect(card.visible).toBe(false);
    expect(card.active).toBe(false);
    // Clearing and setting the flag again never brings it back.
    ctx.state.setFlag(PEAKS_CARD_TRIGGER_FLAG, false);
    ctx.state.setFlag(PEAKS_CARD_TRIGGER_FLAG, true);
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('waits behind the hand-in dialogue and shows when it closes', async () => {
    const { ctx, card, dialogue } = await boot();
    dialogue.active = true;
    ctx.state.setFlag(PEAKS_CARD_TRIGGER_FLAG, true);
    card.update(0.016);
    expect(card.active).toBe(true);
    expect(card.visible).toBe(false);
    expect(ctx.state.getBool(PEAKS_CARD_SEEN_FLAG)).toBe(false);
    dialogue.active = false;
    card.update(0.016);
    expect(card.visible).toBe(true);
    expect(ctx.state.getBool(PEAKS_CARD_SEEN_FLAG)).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('drops the "later update" clause once the Dragonspine is open', async () => {
    const { ctx, card } = await boot();
    ctx.state.setFlag(DRAGONSPINE_OPEN_FLAG, true);
    ctx.state.setFlag(PEAKS_CARD_TRIGGER_FLAG, true);
    const text = textOf(card.element);
    expect(text).toContain(PHASE_E_STRINGS_EN['hud.phaseE.peaks.line.open']);
    expect(text).not.toContain('later update');
  }, PLUGIN_TEST_TIMEOUT);

  it('a load with D05 done and the card unseen shows it; a load with it seen does not', async () => {
    const { ctx, card } = await boot();
    const base = ctx.state.serialize();
    ctx.state.load({ ...base, flags: { ...base.flags, [PEAKS_CARD_TRIGGER_FLAG]: true } });
    ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card.visible).toBe(true);
    card.dismiss();
    const { ctx: ctx2, card: card2 } = await boot();
    const b2 = ctx2.state.serialize();
    ctx2.state.load({ ...b2, flags: { ...b2.flags, [PEAKS_CARD_TRIGGER_FLAG]: true, [PEAKS_CARD_SEEN_FLAG]: true } });
    ctx2.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card2.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a load of a save without D05 hides a card that was waiting', async () => {
    const { ctx, card, dialogue } = await boot();
    dialogue.active = true;
    ctx.state.setFlag(PEAKS_CARD_TRIGGER_FLAG, true);
    expect(card.active).toBe(true);
    const base = ctx.state.serialize();
    const flags = { ...base.flags };
    delete flags[PEAKS_CARD_TRIGGER_FLAG];
    ctx.state.load({ ...base, flags });
    ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('its once-flag is K16\'s in the Act 3 flag table', () => {
    expect(ACT3_FLAG_OWNERS.find((o) => o.pattern === PEAKS_CARD_SEEN_FLAG)?.owner).toBe('K16');
  });
});
