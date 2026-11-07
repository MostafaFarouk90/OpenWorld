// The "Waste is next" card (L13, Phase G) on a reduced manifest: core, hud and phase-g.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../core/testing/bootPlugins';
import hudPlugin from '../hud/hud.plugin';
import { textOf } from '../hud/dom';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import phaseG, { type PhaseGCardHandle } from './phaseG.plugin';
import { WASTE_OPEN_FLAG } from '../quests/act4Jump';
import { WASTE_CARD_SEEN_FLAG, WASTE_CARD_TRIGGER_FLAG, PHASE_G_STRINGS_EN } from './phaseGCard';
import { ACT4_FLAG_OWNERS } from '../quests/lint/act4Flags';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  phaseG.dispose?.();
  vi.restoreAllMocks();
});

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, hudPlugin, phaseG]);
  expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const ctx = game.ctx;
  const card = (globalThis as { __phaseGCard?: PhaseGCardHandle }).__phaseGCard!;
  const dialogue = { active: false };
  const scenes = { active: null as string | null };
  (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('dialogue', dialogue);
  (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('scenes', scenes);
  return { game, ctx, card, dialogue, scenes };
}

describe('the "Waste is next" card', () => {
  it('stays hidden until M41 is done, then shows once with the held line and sets its once-flag', async () => {
    const { ctx, card } = await boot();
    expect(card.visible).toBe(false);
    expect(ctx.state.getBool(WASTE_CARD_SEEN_FLAG)).toBe(false);
    ctx.state.setFlag(WASTE_CARD_TRIGGER_FLAG, true);
    expect(card.visible).toBe(true);
    expect(ctx.state.getBool(WASTE_CARD_SEEN_FLAG)).toBe(true);
    const text = textOf(card.element);
    expect(text).toContain(PHASE_G_STRINGS_EN['hud.phaseG.waste.title']);
    expect(text).toContain(PHASE_G_STRINGS_EN['hud.phaseG.waste.line']);
    // the hold is retired (L13 PR 2): the line no longer says the way in is shut
    expect(text).not.toContain('not yet open');
    expect(text).not.toContain('later update');
    card.dismiss();
    expect(card.visible).toBe(false);
    expect(card.active).toBe(false);
    // Clearing and setting the flag again never brings it back.
    ctx.state.setFlag(WASTE_CARD_TRIGGER_FLAG, false);
    ctx.state.setFlag(WASTE_CARD_TRIGGER_FLAG, true);
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('waits behind the hand-in dialogue and shows when it closes', async () => {
    const { ctx, card, dialogue } = await boot();
    dialogue.active = true;
    ctx.state.setFlag(WASTE_CARD_TRIGGER_FLAG, true);
    card.update(0.016);
    expect(card.active).toBe(true);
    expect(card.visible).toBe(false);
    expect(ctx.state.getBool(WASTE_CARD_SEEN_FLAG)).toBe(false);
    dialogue.active = false;
    card.update(0.016);
    expect(card.visible).toBe(true);
    expect(ctx.state.getBool(WASTE_CARD_SEEN_FLAG)).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('waits behind a running scene (M41\'s camp) and shows when it ends', async () => {
    const { ctx, card, scenes } = await boot();
    scenes.active = 'scene-m41-camp';
    ctx.state.setFlag(WASTE_CARD_TRIGGER_FLAG, true);
    card.update(0.016);
    expect(card.visible).toBe(false);
    expect(ctx.state.getBool(WASTE_CARD_SEEN_FLAG)).toBe(false);
    scenes.active = null;
    card.update(0.016);
    expect(card.visible).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('does not show for the retired hold flag alone (an old save may carry it), only for M41', async () => {
    const { ctx, card } = await boot();
    ctx.state.setFlag(WASTE_OPEN_FLAG, true);
    card.update(0.016);
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a load with M41 done and the card unseen shows it; a load with it seen does not', async () => {
    const { ctx, card } = await boot();
    const base = ctx.state.serialize();
    ctx.state.load({ ...base, flags: { ...base.flags, [WASTE_CARD_TRIGGER_FLAG]: true } });
    ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card.visible).toBe(true);
    card.dismiss();
    const { ctx: ctx2, card: card2 } = await boot();
    const b2 = ctx2.state.serialize();
    ctx2.state.load({ ...b2, flags: { ...b2.flags, [WASTE_CARD_TRIGGER_FLAG]: true, [WASTE_CARD_SEEN_FLAG]: true } });
    ctx2.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card2.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a load of a save without M41 hides a card that was waiting', async () => {
    const { ctx, card, dialogue } = await boot();
    dialogue.active = true;
    ctx.state.setFlag(WASTE_CARD_TRIGGER_FLAG, true);
    expect(card.active).toBe(true);
    const base = ctx.state.serialize();
    const flags = { ...base.flags };
    delete flags[WASTE_CARD_TRIGGER_FLAG];
    ctx.state.load({ ...base, flags });
    ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('its once-flag is L13\'s in the Act 4 flag table', () => {
    expect(ACT4_FLAG_OWNERS.find((o) => o.pattern === WASTE_CARD_SEEN_FLAG)?.owner).toBe('L13');
  });
});
