// Act 4's "The Road to the Rim" card: the recap rows and, on a reduced manifest (core and hud), the card's flow.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { ActEndingCard } from '../ActEndingCard';
import { StubDocument, textOf } from '../dom';
import hudPlugin from '../hud.plugin';
import { HUD_STRINGS_EN } from '../strings.en';
import { act3RecapLines } from '../act3/actEndingRecap';
import { ACT4_RECAP_ROWS, A4_CONTINUES_KEY, act4RecapLines } from './actEndingRecap';
import { ACT4_ENDING_STRINGS_EN, ACT4_HUD_STRINGS_EN } from './strings.en';

const TABLE: Record<string, string> = { ...HUD_STRINGS_EN, ...ACT4_ENDING_STRINGS_EN };
const t = (k: string) => TABLE[k] ?? `[[${k}]]`;
const flags = (f: Record<string, unknown>) => (k: string) => f[k];
const CONTINUES = 'The story continues.';
const FULL = {
  'story.m38.complete': true,
  'story.m39.complete': true,
  'boss.bellows-engine.outcome': 'defeated',
  'story.m43.complete': true,
  'story.r24.choice': 'all',
  'boss.eormen.outcome': 'released',
};

describe('Act 4 recap lines', () => {
  it('a full run gives every line in play order, then the closing line', () => {
    const lines = act4RecapLines(flags(FULL), t);
    expect(lines).toEqual([
      t('hud.ending.a4.line.m38'),
      t('hud.ending.a4.line.m39'),
      t('hud.ending.a4.line.d07'),
      t('hud.ending.a4.line.m43'),
      t('hud.ending.a4.line.r24.all'),
      t('hud.ending.a4.line.d08.released'),
      CONTINUES,
    ]);
    expect(lines.join('')).not.toContain('[[');
  });

  it('each choice picks its own line; a missing or unknown flag drops its line', () => {
    expect(act4RecapLines(flags({ 'story.r24.choice': 'half', 'boss.eormen.outcome': 'defeated' }), t)).toEqual([
      t('hud.ending.a4.line.r24.half'),
      t('hud.ending.a4.line.d08.defeated'),
      CONTINUES,
    ]);
    expect(act4RecapLines(flags({}), t)).toEqual([CONTINUES]);
    expect(act4RecapLines(flags({ 'story.r24.choice': 'some', 'boss.eormen.outcome': 'reset', 'boss.bellows-engine.outcome': 'reset' }), t)).toEqual([CONTINUES]);
  });

  it('every row key has a string; the closing key is its own; Act 3 output is unchanged', () => {
    const keys = new Set<string>();
    for (const r of ACT4_RECAP_ROWS) {
      for (const v of [FULL, { 'story.r24.choice': 'half', 'boss.eormen.outcome': 'defeated' }]) {
        const k = r.line(flags(v));
        if (k) keys.add(k);
      }
    }
    for (const k of keys) expect(ACT4_ENDING_STRINGS_EN[k], k).toBeTruthy();
    expect(ACT4_ENDING_STRINGS_EN[A4_CONTINUES_KEY]).toBe(CONTINUES);
    expect(act3RecapLines(flags({}), t).at(-1)).toBe(CONTINUES);
    // No key is shared with the hud's own table or the Act 4 HUD table (the duplicate-key trap).
    for (const k of Object.keys(ACT4_ENDING_STRINGS_EN)) {
      expect(Object.prototype.hasOwnProperty.call(HUD_STRINGS_EN, k), k).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(ACT4_HUD_STRINGS_EN, k), k).toBe(false);
    }
  });

  it('the card draws the title, the recap and the closing line last', () => {
    const card = new ActEndingCard(new StubDocument(), {
      widgetId: 'act-ending-card-a4',
      ending: { act: 4, endingId: 'the-road-to-the-rim', titleKey: 'hud.ending.a4.title' },
      t,
      recap: () => act4RecapLines(flags(FULL), t),
      seen: () => false,
    });
    card.onActEnded({ act: 4, endingId: 'the-road-to-the-rim' });
    card.update(0.016);
    const txt = textOf(card.element);
    expect(txt).toContain('The Road to the Rim');
    expect(txt.indexOf('Sir Gaut')).toBeLessThan(txt.indexOf(CONTINUES));
    expect(txt.indexOf(CONTINUES)).toBeGreaterThan(txt.indexOf('Eormen'));
  });
});

describe('Act 4 ending card in the hud plugin', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  }, PLUGIN_TEST_TIMEOUT);
  afterEach(() => vi.restoreAllMocks());

  async function boot() {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = makeTestGame(physics);
    const statuses = await bootPlugins(game, [corePlugin, hudPlugin]);
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const ctx = game.ctx;
    const svc = () => ctx.services.get('actEndingCard')!;
    const closed: string[] = [];
    game.events.on('hud.actEnding.closed', (e) => closed.push(e.endingId));
    return { game, ctx, svc, closed };
  }

  it('the Act 5 gate shows it once with its own seen flag; dismissing emits its id; act.ended after does nothing', async () => {
    const x = await boot();
    expect(x.svc().active()).toBe(false);
    x.ctx.state.setFlag('story.gate.a5', true);
    expect(x.svc().active()).toBe(true);
    x.ctx.hud.update(0.016);
    expect(x.ctx.state.getBool('codex.actEnding.a4.seen')).toBe(true);
    expect(x.ctx.state.getBool('codex.actEnding.a3.seen')).toBe(false);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-road-to-the-rim']);
    x.game.events.emit('act.ended', { act: 4, endingId: 'the-road-to-the-rim' });
    expect(x.svc().active()).toBe(false);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('Act 3 and Act 4 cards answer only their own act; both pending close in act order', async () => {
    const x = await boot();
    x.game.events.emit('act.ended', { act: 4, endingId: 'the-coal-mothers-oath' });
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-road-to-the-rim' });
    expect(x.svc().active()).toBe(false);
    x.game.events.emit('act.ended', { act: 4, endingId: 'the-road-to-the-rim' });
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-coal-mothers-oath' });
    x.svc().dismiss();
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-coal-mothers-oath', 'the-road-to-the-rim']);
    expect(x.svc().active()).toBe(false);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('a load with the card or the camp seen does not replay it; a load with neither re-derives it', async () => {
    const a = await boot();
    a.ctx.state.setFlag('codex.actEnding.a4.seen', true);
    a.ctx.state.setFlag('story.gate.a5', true);
    a.game.events.emit('save.loaded', { slot: 'x' });
    expect(a.svc().active()).toBe(false);
    a.game.dispose();
    const b = await boot();
    b.ctx.state.setFlag('story.a4.campSeen', true);
    b.ctx.state.setFlag('story.gate.a5', true);
    b.game.events.emit('save.loaded', { slot: 'x' });
    expect(b.svc().active()).toBe(false);
    b.game.dispose();
    const c = await boot();
    (c.ctx.state as any).flags.set('story.gate.a5', true);
    c.game.events.emit('save.loaded', { slot: 'x' });
    c.ctx.hud.update(0.016);
    expect(c.svc().active() || c.ctx.state.getBool('codex.actEnding.a4.seen')).toBe(true);
    c.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);
});
