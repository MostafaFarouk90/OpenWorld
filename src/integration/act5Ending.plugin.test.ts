// Plugin `act5-ending` on a reduced manifest (core and the plugin; the screens, scenes and save are fakes): the service N11
// calls, the gate on M56's completion, the steps through N9's screens, the hold released after the after-state, one save.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../core/testing/bootPlugins';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import act5Ending, { ACT5_SAVE_HOLD, ACT5_TITLE_CARD_ID } from './act5Ending.plugin';
import { M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG } from './act5EndingData';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  act5Ending.dispose?.();
  vi.restoreAllMocks();
});

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, act5Ending]);
  expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const ctx = game.ctx;
  const calls: string[] = [];
  const provide = (n: string, v: unknown) => (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
  provide('scenes', { active: null, play: async (id: string) => (calls.push(`scene ${id}`), 'finished') });
  provide('act5Screens', {
    active: () => false,
    showPhaseCard: async (id: string, lines: string[], titleKey: string) => void calls.push(`card ${id} ${titleKey} ${lines.join('|')}`),
    showEpilogue: async () => void calls.push('epilogue'),
    showCredits: async () => void calls.push('credits'),
  });
  provide('afterEnding', { wake: async () => void calls.push(`wake ${ctx.state.getBool('world.afterEnding' as never)}`) });
  provide('save', {
    suspend: (r: string) => (calls.push(`suspend ${r}`), () => calls.push('release')),
    saveNow: async (r: string) => (calls.push(`save ${r}`), { ok: true }),
  });
  return { game, ctx, calls };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('plugin act5-ending', () => {
  it('provides act5Ending, writes the gate on M56, plays the steps through the screens and saves once after the release', async () => {
    const { ctx, calls } = await boot();
    const d = ctx.services.get('act5Ending')!;
    expect(d).toBeDefined();
    const ended: unknown[] = [];
    ctx.events.on('act.ended', (e) => ended.push(e));
    // N11 at the confirm
    d.holdSaves();
    ctx.state.setFlag(M56_CHOICE_FLAG as never, 'let-it-die' as never);
    ctx.state.setFlag(M56_CAEL_LIVES_FLAG as never, true as never);
    ctx.state.setFlag('story.m56.complete' as never, true as never);
    ctx.events.emit('quest.completed', { questId: 'm56' } as never);
    await flush();
    expect(ctx.state.getBool('story.gate.end' as never)).toBe(true);
    d.tick();
    await flush();
    expect(calls).toEqual([
      `suspend ${ACT5_SAVE_HOLD}`,
      'scene scene-ending-let-it-die',
      `card ${ACT5_TITLE_CARD_ID} scene.ending.title.longDawn `,
      'epilogue',
      'credits',
      'wake true',
      'release',
      'save manual',
    ]);
    expect(ended).toEqual([{ act: 5, endingId: 'embers-or-dawn' }]);
    expect(ctx.state.getBool('codex.actEnding.a5.seen' as never)).toBe(true);
    expect(d.step).toBe('done');
  }, PLUGIN_TEST_TIMEOUT);

  it('a load before the gate releases the hold N11 raised', async () => {
    const { ctx, calls } = await boot();
    const d = ctx.services.get('act5Ending')!;
    d.holdSaves();
    ctx.events.emit('save.loaded', {} as never);
    await flush();
    expect(calls).toEqual([`suspend ${ACT5_SAVE_HOLD}`, 'release']);
    expect(d.holding).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);
});
