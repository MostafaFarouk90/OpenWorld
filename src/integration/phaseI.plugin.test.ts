// "The Rim holds" (N12 PR 1, Phase I) on a reduced manifest: core, hud and phase-i.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../core/testing/bootPlugins';
import hudPlugin from '../hud/hud.plugin';
import { textOf } from '../hud/dom';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import phaseI, { type PhaseICardHandle } from './phaseI.plugin';
import { PHASE_I_STRINGS_EN, RIM_CARD_SEEN_FLAG, RIM_CARD_TRIGGER_FLAG, RIM_LINE_KEY, RIM_TITLE_KEY } from './phaseICard';
import { ACT5_FLAG_OWNERS } from '../quests/lint/act5Flags';
import { FOUNDRY_OPEN_FLAG } from '../region/act5Regions';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  phaseI.dispose?.();
  vi.restoreAllMocks();
});

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, hudPlugin, phaseI]);
  expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const ctx = game.ctx;
  const card = (globalThis as { __phaseICard?: PhaseICardHandle }).__phaseICard!;
  const dialogue = { active: false };
  const scenes = { active: null as string | null };
  (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('dialogue', dialogue);
  (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('scenes', scenes);
  return { game, ctx, card, dialogue, scenes };
}

describe('"The Rim holds" card', () => {
  it('stays hidden until M52 is done, then shows once with the held line and sets its once-flag', async () => {
    const { ctx, card } = await boot();
    expect(card.visible).toBe(false);
    ctx.state.setFlag(RIM_CARD_TRIGGER_FLAG, true);
    expect(card.visible).toBe(true);
    expect(ctx.state.getBool(RIM_CARD_SEEN_FLAG)).toBe(true);
    const text = textOf(card.element);
    expect(text).toContain(PHASE_I_STRINGS_EN[RIM_TITLE_KEY]);
    expect(text).toContain(PHASE_I_STRINGS_EN[RIM_LINE_KEY]);
    // Phase I: the hold stands, so the line says the Foundry's door stays shut, and names the Foundry as next
    expect(text).toContain('Foundry');
    expect(text).toContain('stays shut for now');
    card.dismiss();
    expect(card.active).toBe(false);
    ctx.state.setFlag(RIM_CARD_TRIGGER_FLAG, false);
    ctx.state.setFlag(RIM_CARD_TRIGGER_FLAG, true);
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it("waits behind M52's hand-in dialogue and a running scene, then shows", async () => {
    const { ctx, card, dialogue, scenes } = await boot();
    dialogue.active = true;
    scenes.active = 'scene-m52-gate-holds';
    ctx.state.setFlag(RIM_CARD_TRIGGER_FLAG, true);
    card.update(0.016);
    expect(card.active).toBe(true);
    expect(card.visible).toBe(false);
    expect(ctx.state.getBool(RIM_CARD_SEEN_FLAG)).toBe(false);
    dialogue.active = false;
    card.update(0.016);
    expect(card.visible).toBe(false);
    scenes.active = null;
    card.update(0.016);
    expect(card.visible).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('the hold flag alone never shows it', async () => {
    const { ctx, card } = await boot();
    ctx.state.setFlag(FOUNDRY_OPEN_FLAG, true);
    card.update(0.016);
    expect(card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a load with M52 done and the card unseen shows it; seen, it does not; without M52 a waiting card hides', async () => {
    const { ctx, card } = await boot();
    const base = ctx.state.serialize();
    ctx.state.load({ ...base, flags: { ...base.flags, [RIM_CARD_TRIGGER_FLAG]: true } });
    ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(card.visible).toBe(true);
    card.dismiss();
    phaseI.dispose?.();
    const b = await boot();
    const b2 = b.ctx.state.serialize();
    b.ctx.state.load({ ...b2, flags: { ...b2.flags, [RIM_CARD_TRIGGER_FLAG]: true, [RIM_CARD_SEEN_FLAG]: true } });
    b.ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(b.card.active).toBe(false);
    phaseI.dispose?.();
    const c = await boot();
    c.dialogue.active = true;
    c.ctx.state.setFlag(RIM_CARD_TRIGGER_FLAG, true);
    expect(c.card.active).toBe(true);
    const s = c.ctx.state.serialize();
    const flags = { ...s.flags };
    delete flags[RIM_CARD_TRIGGER_FLAG];
    c.ctx.state.load({ ...s, flags });
    c.ctx.events.emit('save.loaded', { slot: 'slot-0' });
    expect(c.card.active).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it("its once-flag is N12's in the Act 5 flag table", () => {
    expect(ACT5_FLAG_OWNERS.find((o) => o.pattern === RIM_CARD_SEEN_FLAG)?.owner).toBe('N12');
  });
});
