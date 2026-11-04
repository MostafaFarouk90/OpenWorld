// Act 3's "The Coal-Mother's Oath" card: the recap rows and, on a reduced manifest (core and hud), the card's flow.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { ActEndingCard } from '../ActEndingCard';
import { StubDocument, textOf } from '../dom';
import hudPlugin from '../hud.plugin';
import { HUD_STRINGS_EN } from '../strings.en';
import { ACT3_RECAP_ROWS, A3_CONTINUES_KEY, act3RecapLines } from './actEndingRecap';

const t = (k: string) => HUD_STRINGS_EN[k] ?? `[[${k}]]`;
const flags = (f: Record<string, unknown>) => (k: string) => f[k];
const CONTINUES = 'The story continues.';

describe('Act 3 recap lines', () => {
  it.each([
    ['won', 'defeated'],
    ['won', 'spared'],
    ['yielded', 'defeated'],
    ['yielded', 'spared'],
  ])('M31 %s and D06 %s give both choice lines, the oath line and the closing line', (m31, d06) => {
    const lines = act3RecapLines(flags({ 'story.m31.choice': m31, 'boss.corvin-skarl.outcome': d06 }), t);
    expect(lines).toEqual([
      t(`hud.ending.a3.line.m31.${m31}`),
      t(`hud.ending.a3.line.d06.${d06}`),
      t('hud.ending.a3.line.oath'),
      CONTINUES,
    ]);
    expect(lines.join('')).not.toContain('[[');
  });

  it('a missing or unknown flag drops its line; the oath and the closing line stay', () => {
    expect(act3RecapLines(flags({}), t)).toEqual([t('hud.ending.a3.line.oath'), CONTINUES]);
    expect(act3RecapLines(flags({ 'story.m31.choice': 'dithered', 'boss.corvin-skarl.outcome': 'released' }), t)).toEqual([t('hud.ending.a3.line.oath'), CONTINUES]);
    expect(act3RecapLines(flags({ 'boss.corvin-skarl.outcome': 'spared' }), t)).toEqual([t('hud.ending.a3.line.d06.spared'), t('hud.ending.a3.line.oath'), CONTINUES]);
  });

  it('is extensible, and the closing line is always last, even with a throwing row or too many rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      ...ACT3_RECAP_ROWS,
      { id: 'boom', line: (): string | null => { throw new Error('x'); } },
      ...Array.from({ length: 30 }, (_, i) => ({ id: `extra${i}`, line: () => 'hud.ending.a3.line.oath' })),
    ];
    const lines = act3RecapLines(flags({}), t, rows);
    expect(lines.at(-1)).toBe(CONTINUES);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(warn).toHaveBeenCalled();
    // The exported list is the one the card reads: a pushed row shows, before the closing line.
    ACT3_RECAP_ROWS.push({ id: 'k13', line: () => 'hud.ending.a3.line.oath' });
    try {
      const withRow = act3RecapLines(flags({}), t);
      expect(withRow).toHaveLength(3);
      expect(withRow.at(-1)).toBe(CONTINUES);
    } finally {
      ACT3_RECAP_ROWS.pop();
    }
    expect(HUD_STRINGS_EN[A3_CONTINUES_KEY]).toBe(CONTINUES);
    warn.mockRestore();
  });

  it('the D06 lines put Skarl at Frostfang Aerie, and the oath line swears the dragons to Cael', () => {
    expect(t('hud.ending.a3.line.d06.defeated')).toContain('Frostfang Aerie');
    for (const k of ['d06.defeated', 'd06.spared']) expect(t(`hud.ending.a3.line.${k}`)).not.toContain('Hearth');
    expect(t('hud.ending.a3.line.oath')).toContain("dragons to Cael's cause");
    expect(t('hud.ending.a3.line.oath')).not.toContain("Coal-Mother's oath");
  });

  it('the card draws the recap with the title and the closing line last', () => {
    const card = new ActEndingCard(new StubDocument(), {
      widgetId: 'act-ending-card-a3',
      ending: { act: 3, endingId: 'the-coal-mothers-oath', titleKey: 'hud.ending.a3.title' },
      t,
      recap: () => act3RecapLines(flags({ 'story.m31.choice': 'yielded', 'boss.corvin-skarl.outcome': 'defeated' }), t),
      seen: () => false,
    });
    card.onActEnded({ act: 3, endingId: 'the-coal-mothers-oath' });
    card.update(0.016);
    const txt = textOf(card.element);
    expect(txt).toContain("The Coal-Mother's Oath");
    expect(txt.indexOf('yielded')).toBeLessThan(txt.indexOf(CONTINUES));
    expect(txt.trimEnd().endsWith('Press any key to continue')).toBe(true);
    expect(txt.indexOf(CONTINUES)).toBeGreaterThan(txt.indexOf('Ysmeryth has sworn'));
  });
});

describe('Act 3 ending card in the hud plugin', () => {
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

  it('the gate shows it once, sets its own seen flag when shown, and dismissing emits the Act 3 id', async () => {
    const x = await boot();
    expect(x.svc().active()).toBe(false);
    x.ctx.state.setFlag('story.gate.a4', true);
    expect(x.svc().active()).toBe(true);
    x.ctx.hud.update(0.016);
    expect(x.ctx.state.getBool('codex.actEnding.a3.seen')).toBe(true);
    expect(x.ctx.state.getBool('codex.actEnding.a2.seen')).toBe(false);
    expect(x.ctx.state.getBool('codex.actEnding.a1.seen')).toBe(false);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-coal-mothers-oath']);
    expect(x.svc().active()).toBe(false);
    // Once per save: the act.ended event after the flag is set shows nothing.
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-coal-mothers-oath' });
    expect(x.svc().active()).toBe(false);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('Act 2\'s gate does not show it, and act.ended shows it live', async () => {
    const x = await boot();
    x.ctx.state.setFlag('story.gate.a3', true); // Act 2's gate shows Act 2's card, not Act 3's
    expect(x.svc().active()).toBe(true);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-houses-stand']);
    expect(x.svc().active()).toBe(false);
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-coal-mothers-oath' });
    expect(x.svc().active()).toBe(true);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-houses-stand', 'the-coal-mothers-oath']);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('the Act 1 and Act 2 cards never answer act 3, and the Act 3 card never answers them', async () => {
    const x = await boot();
    x.game.events.emit('act.ended', { act: 3, endingId: 'smoke-over-harrowmark' });
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-houses-stand' });
    x.game.events.emit('act.ended', { act: 1, endingId: 'the-coal-mothers-oath' });
    x.game.events.emit('act.ended', { act: 2, endingId: 'the-coal-mothers-oath' });
    expect(x.svc().active()).toBe(false);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('a load with the card seen, or the camp seen, does not replay it; a load with neither re-derives it', async () => {
    const a = await boot();
    a.ctx.state.setFlag('codex.actEnding.a3.seen', true);
    a.ctx.state.setFlag('story.gate.a4', true);
    a.game.events.emit('save.loaded', { slot: 'x' });
    expect(a.svc().active()).toBe(false);
    a.game.dispose();
    const b = await boot();
    b.ctx.state.setFlag('story.a3.campSeen', true);
    b.ctx.state.setFlag('story.gate.a4', true);
    b.game.events.emit('save.loaded', { slot: 'x' });
    expect(b.svc().active()).toBe(false);
    b.game.dispose();
    const c = await boot();
    (c.ctx.state as any).flags.set('story.gate.a4', true); // what a load does
    c.game.events.emit('save.loaded', { slot: 'x' });
    c.ctx.hud.update(0.016);
    expect(c.svc().active() || c.ctx.state.getBool('codex.actEnding.a3.seen')).toBe(true);
    c.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('a card that is showing is hidden by a load whose save has the seen flag', async () => {
    const x = await boot();
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-coal-mothers-oath' });
    expect(x.svc().active()).toBe(true);
    x.ctx.state.setFlag('codex.actEnding.a3.seen', true);
    x.game.events.emit('save.loaded', { slot: 'x' });
    expect(x.svc().active()).toBe(false);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('dismiss() closes Act 2 before Act 3 when both are pending', async () => {
    const x = await boot();
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-coal-mothers-oath' });
    x.game.events.emit('act.ended', { act: 2, endingId: 'the-houses-stand' });
    expect(x.svc().active()).toBe(true);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-houses-stand']);
    expect(x.svc().active()).toBe(true);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-houses-stand', 'the-coal-mothers-oath']);
    expect(x.svc().active()).toBe(false);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);

  it('the service covers card 3 only when it is the one waiting', async () => {
    const x = await boot();
    x.game.events.emit('act.ended', { act: 3, endingId: 'the-coal-mothers-oath' });
    expect(x.svc().active()).toBe(true);
    x.svc().dismiss();
    expect(x.closed).toEqual(['the-coal-mothers-oath']);
    x.game.dispose();
  }, PLUGIN_TEST_TIMEOUT);
});
