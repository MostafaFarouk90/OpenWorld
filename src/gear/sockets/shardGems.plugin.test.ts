import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassId } from '../../actors/classes';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import type { GamePlugin } from '../../core/plugins';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import gearPlugin from '../gear.plugin';
import shardGemsPlugin from './shardGems.plugin';
import { gemFor } from './table';
import { grantedFlag } from './tuning';

const toasts = vi.hoisted(() => [] as string[]);
vi.mock('../../waystones/toast', () => ({ showToast: (_hud: unknown, text: string) => void toasts.push(text) }));

let physics: PhysicsWorld;
beforeEach(async () => {
  toasts.length = 0;
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function boot(opts: { withClasses?: boolean; cls?: ClassId; chosen?: boolean; done?: string[] } = {}) {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const game = makeTestGame(physics);
  const ctx = game.ctx;
  const classes = { chosen: opts.chosen ?? true, cls: opts.cls ?? ('warden' as ClassId) };
  const fake: GamePlugin = {
    id: 'fake-others',
    dependsOn: ['core'],
    setup(c) {
      (c.services as unknown as { provide(n: string, v: unknown): void }).provide('quests', { state: (id: string) => ((opts.done ?? []).includes(id) ? 'completed' : 'inactive') });
      if (opts.withClasses !== false) (c.services as unknown as { provide(n: string, v: unknown): void }).provide('classes', { chosen: () => classes.chosen, current: () => classes.cls });
    },
  };
  const statuses = await bootPlugins(game, [corePlugin, inventoryPlugin, fake, gearPlugin, shardGemsPlugin]);
  const inv = ctx.services.require('inventory');
  const gems = () => inv.items().filter((i) => i.id.startsWith('shard-gem.'));
  const sockets: unknown[] = [];
  ctx.events.on('gear.socketed', (e) => sockets.push(['socketed', e]));
  ctx.events.on('gear.unsocketed', (e) => sockets.push(['unsocketed', e]));
  return { game, ctx, statuses, classes, inv, gems, sockets, svc: ctx.services.require('shardGems') };
}
type T = Awaited<ReturnType<typeof boot>>;
const defeat = (t: T, bossId: string) => t.ctx.events.emit('boss.defeated', { bossId, actorId: 'x' } as never);
const outcomes = (t: T, ...ids: string[]) => ids.forEach((id) => t.ctx.state.setFlag(`boss.${id}.outcome`, 'defeated'));
const loaded = (t: T) => t.ctx.events.emit('save.loaded', { slot: 'test' });

describe('shard-gems plugin', () => {
  it('sets up cleanly and provides the service and the strings', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(typeof t.svc.fit).toBe('function');
    expect(t.ctx.strings.t('item.shard-gem.oathfire.name')).toBe('Oathfire Shard-gem');
    expect(t.ctx.strings.t('item.wyrm-tempered-oathblade.name')).toBe('Wyrm-tempered Oathblade');
  });

  it('grants one class gem on boss.defeated and sets the flag', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'warden' });
    defeat(t, 'ashen-prior');
    expect(t.gems()).toEqual([{ id: gemFor('warden', 'a').id, count: 1 }]);
    expect(t.ctx.state.getFlag(grantedFlag('ashen-prior'))).toBe(true);
    expect(t.ctx.state.getFlag('gear.shardgem.granted.ashen-prior')).toBe(true);
    defeat(t, 'ashen-prior');
    expect(t.inv.count(gemFor('warden', 'a').id)).toBe(1);
  });

  it('also grants on boss.released and boss.spared, and ignores a boss with no gem', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'knight' });
    t.ctx.events.emit('boss.released', { bossId: 'gaffer-grimtooth', actorId: 'x' } as never);
    t.ctx.events.emit('boss.spared', { bossId: 'murkjaw', actorId: 'x' } as never);
    defeat(t, 'hathren');
    expect(t.gems().map((g) => g.id).sort()).toEqual(['shard-gem.oathfire', 'shard-gem.bulwark'].sort());
  });

  it('pays nothing before a class is chosen, then retro-grants when class.chosen arrives', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ chosen: false });
    outcomes(t, 'ashen-prior', 'the-slagmaw');
    loaded(t);
    defeat(t, 'gaffer-grimtooth');
    expect(t.gems()).toEqual([]);
    expect(t.ctx.state.getFlag(grantedFlag('ashen-prior'))).toBeUndefined();
    t.classes.chosen = true;
    t.ctx.events.emit('class.chosen', { classId: 'warden' });
    expect(t.gems().reduce((n, g) => n + g.count, 0)).toBe(2);
    expect(t.inv.count('shard-gem.rootstone')).toBe(1);
    expect(t.inv.count('shard-gem.ravager')).toBe(1);
  });

  it('a dungeon quest completing pays its boss gem (the ?act3= jump completes D01 to D04 by injection, with no load)', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ done: ['d01', 'd02'] });
    t.ctx.events.emit('quest.completed', { questId: 'm05' });
    expect(t.gems()).toEqual([]);
    t.ctx.events.emit('quest.completed', { questId: 'd02' });
    expect(t.gems().reduce((n, g) => n + g.count, 0)).toBe(2);
    t.ctx.events.emit('quest.completed', { questId: 'd02' });
    expect(t.gems().reduce((n, g) => n + g.count, 0)).toBe(2);
  });

  it('retro-grants on save.loaded once, for the bosses with an outcome only', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'pathfinder' });
    outcomes(t, 'ashen-prior', 'gaffer-grimtooth');
    loaded(t);
    expect(t.gems().sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'shard-gem.fletching', count: 1 },
      { id: 'shard-gem.steadyhand', count: 1 },
    ]);
    loaded(t);
    loaded(t);
    expect(t.gems().reduce((n, g) => n + g.count, 0)).toBe(2);
  });

  it('pays a live drop and then a load in one session as one gem', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'knight' });
    defeat(t, 'ashen-prior');
    outcomes(t, 'ashen-prior');
    loaded(t);
    expect(t.inv.count('shard-gem.bulwark')).toBe(1);
  });

  it('keeps the flag unset on a full stack and retries on the next load', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'knight' });
    t.inv.add('shard-gem.bulwark', 10);
    outcomes(t, 'ashen-prior');
    loaded(t);
    expect(t.ctx.state.getFlag(grantedFlag('ashen-prior'))).toBeUndefined();
    t.inv.remove('shard-gem.bulwark', 1);
    loaded(t);
    expect(t.ctx.state.getFlag(grantedFlag('ashen-prior'))).toBe(true);
    expect(t.inv.count('shard-gem.bulwark')).toBe(10);
  });

  it('falls back to the Knight gem table only for display, never for a grant (no classes service)', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ withClasses: false });
    outcomes(t, 'ashen-prior');
    loaded(t);
    defeat(t, 'ashen-prior');
    expect(t.gems()).toEqual([]);
  });

  it('fits and removes through the service, emitting the socket events', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'knight' });
    t.inv.add('wyrm-tempered-oathblade', 1);
    t.inv.add('shard-gem.oathfire', 1);
    t.inv.addGold(100);
    expect(t.svc.fit('wyrm-tempered-oathblade', 0, 'shard-gem.oathfire').ok).toBe(true);
    expect(t.svc.view('wyrm-tempered-oathblade').slots).toEqual([{ slot: 0, shardId: 'shard-gem.oathfire', dormant: false }]);
    expect(t.svc.pieces().map((p) => p.itemId)).toEqual(['wyrm-tempered-oathblade']);
    expect(t.svc.remove('wyrm-tempered-oathblade', 0).ok).toBe(true);
    expect(t.svc.fit('wyrm-tempered-oathblade', 5, 'shard-gem.oathfire')).toEqual({ ok: false, reason: 'no-socket' });
    expect(t.sockets).toEqual([
      ['socketed', { itemId: 'wyrm-tempered-oathblade', slot: 0, shardId: 'shard-gem.oathfire' }],
      ['unsocketed', { itemId: 'wyrm-tempered-oathblade', slot: 0, shardId: 'shard-gem.oathfire' }],
    ]);
    expect(t.inv.gold).toBe(25);
  });

  it('makes Frostbrow\'s knife keen in either order without changing the item, toasting once', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const a = await boot();
    a.ctx.state.setFlag('story.r15.choice', 'hut');
    expect(toasts).toEqual([]);
    a.inv.add('frostbrows-hunting-knife', 1);
    expect(toasts).toEqual([a.ctx.strings.t('gear.knife.keen')]);
    expect(a.inv.has('frostbrows-hunting-knife')).toBe(true);
    a.ctx.state.setFlag('story.r15.choice', 'hut'); // again: no second toast
    expect(toasts).toHaveLength(1);

    toasts.length = 0;
    const b = await boot();
    b.inv.add('frostbrows-hunting-knife', 1);
    b.inv.equip('frostbrows-hunting-knife');
    expect(toasts).toEqual([]);
    b.ctx.state.setFlag('story.r15.choice', 'hut');
    expect(toasts).toHaveLength(1);
    expect(b.inv.equipped('trinket')).toBe('frostbrows-hunting-knife');
    expect(b.inv.items().filter((i) => i.id.includes('knife'))).toEqual([{ id: 'frostbrows-hunting-knife', count: 1 }]);

    toasts.length = 0;
    const c = await boot();
    c.ctx.state.setFlag('story.r15.choice', 'lodge');
    c.inv.add('frostbrows-hunting-knife', 1);
    loaded(c);
    expect(toasts).toEqual([]);
  });

  it('toasts nothing on a load of an already keen knife, but does when it turns keen later', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot();
    t.ctx.state.setFlag('story.r15.choice', 'hut');
    t.inv.add('frostbrows-hunting-knife', 1);
    toasts.length = 0;
    loaded(t);
    expect(toasts).toEqual([]);
    t.inv.remove('frostbrows-hunting-knife', 1);
    t.inv.add('frostbrows-hunting-knife', 1);
    expect(toasts).toHaveLength(1);
  });

  it('pays a D04 from the quest state on load and covers Murkjaw and Skarl through a full-stack retry', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'knight', done: ['d04'] });
    loaded(t);
    expect(t.inv.count('shard-gem.oathfire')).toBe(1);
    expect(t.ctx.state.getFlag(grantedFlag('the-slagmaw'))).toBe(true);

    const u = await boot({ cls: 'knight' });
    u.inv.add('shard-gem.bulwark', 10);
    u.ctx.events.emit('boss.defeated', { bossId: 'murkjaw', actorId: 'x' } as never);
    expect(toasts).toContain(u.ctx.strings.t('gear.sockets.unpaid'));
    expect(u.ctx.state.getFlag(grantedFlag('murkjaw'))).toBeUndefined();
    u.inv.remove('shard-gem.bulwark', 1);
    u.ctx.state.setFlag('boss.murkjaw.outcome', 'defeated');
    loaded(u);
    expect(u.inv.count('shard-gem.bulwark')).toBe(10);
    expect(u.ctx.state.getFlag(grantedFlag('murkjaw'))).toBe(true);
  });

  it('does not toast unpaid for a boss with no gem or before a class is chosen', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ chosen: false });
    defeat(t, 'ashen-prior');
    defeat(t, 'hathren');
    expect(toasts).toEqual([]);
  });

  it('recuts through the service only into the twin or the class match', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot({ cls: 'warden' });
    t.inv.add('shard-gem.bulwark', 3);
    t.inv.addGold(200);
    expect(t.svc.recut('shard-gem.bulwark', 'shard-gem.rootstone').ok).toBe(true);
    expect(t.svc.recut('shard-gem.bulwark', 'shard-gem.oathfire').ok).toBe(true);
    expect(t.svc.recut('shard-gem.bulwark', 'shard-gem.fletching')).toEqual({ ok: false, reason: 'not-allowed' });
    expect(t.inv.gold).toBe(120);
  });
});
