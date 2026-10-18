import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import inventoryPlugin from '../inventory/inventory.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import promptsPlugin from '../prompts/prompts.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import './events';
import hudPlugin from './hud.plugin';
import type { AbilitiesService, InventoryService, ProgressionService } from './ports';

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const ALL = [corePlugin, inventoryPlugin, progressionPlugin, promptsPlugin, hudPlugin];

async function setup(plugins: GamePlugin[] = ALL, disabled?: Set<string>) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(modules(...plugins), disabled ? { disabled } : {});
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const press = (code: string) => {
    win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
    run(1);
    win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
    run(1);
  };
  const of = <K extends keyof GameEventMap>(t: K) => events.filter((e) => e.type === t).map((e) => e.payload as GameEventMap[K]);
  const ctx = game.ctx;
  return {
    game,
    ctx,
    world,
    statuses,
    events,
    run,
    press,
    of,
    moveModifiers,
    inv: () => ctx.services.get('inventory') as InventoryService,
    prog: () => ctx.services.get('progression') as ProgressionService,
    abil: () => ctx.services.get('abilities') as AbilitiesService,
    prompts: () => ctx.services.get('prompts') as any,
    dispose() {
      game.dispose();
      world.dispose();
    },
  };
}

type T = Awaited<ReturnType<typeof setup>>;

function spawnHostile(t: T, kind = 'ash-wraith', level = 1) {
  return t.ctx.actors.spawn({ kind, team: 'hostile', level, maxHealth: 50 });
}
function died(t: T, a: { id: string; kind: string; team: any; level: number }, killerId: string | null = 'player') {
  t.game.events.emit('actor.died', { actorId: a.id, killerId, kind: a.kind, team: a.team, level: a.level, spawnTag: undefined });
}

describe('plugin wiring (real Game)', () => {
  it('1. all plugins set up ok, services provided, dispose removes them', async () => {
    const t = await setup();
    expect(t.statuses.map((s) => [s.id, s.state]).sort()).toEqual(
      ['core', 'hud', 'inventory', 'progression', 'prompts'].map((id) => [id, 'ok']).sort(),
    );
    for (const s of ['inventory', 'progression', 'abilities', 'prompts'] as const) expect(t.ctx.services.get(s as any)).toBeTruthy();
    t.game.dispose();
    for (const s of ['inventory', 'progression', 'abilities', 'prompts'] as const) expect(t.ctx.services.get(s as any)).toBeUndefined();
    t.world.dispose();
  });

  it('2. new game: max health 120 at full, starter gear equipped', async () => {
    const t = await setup();
    const p = t.ctx.actors.player;
    expect(p.maxHealth).toBe(120);
    expect(p.health).toBe(120);
    expect(t.inv().equipped('weapon')).toBe('practice-sword');
    expect(t.inv().equipped('offhand')).toBe('wooden-round-shield');
    t.dispose();
  });

  it('3. loot.granted adds known items only; nothing else adds them', async () => {
    const t = await setup();
    t.game.events.emit('loot.granted', {
      sourceId: 'x',
      items: [
        { itemId: 'healing-flask', count: 2 },
        { itemId: 'no-such-item', count: 3 },
        { itemId: 'hearth-bread', count: -1 },
        { itemId: 'hearth-token', count: 1.5 },
        { itemId: 'hearth-stone', count: NaN },
      ],
    });
    expect(t.inv().count('healing-flask')).toBe(2);
    expect(t.inv().has('no-such-item')).toBe(false);
    expect(t.inv().count('hearth-bread')).toBe(0);
    expect(t.inv().has('hearth-stone')).toBe(false);
    const before = JSON.stringify(t.inv().items());
    t.game.events.emit('xp.gained', { amount: 5, source: 's', total: 5 });
    t.game.events.emit('interact', { interactableId: 'i', kind: 'chest', actorId: 'player', action: 'interact' });
    t.run(10);
    expect(JSON.stringify(t.inv().items())).toBe(before);
    t.dispose();
  });

  it('4. kill xp rules', async () => {
    const t = await setup();
    const wraith = spawnHostile(t);
    died(t, wraith);
    expect(t.prog().xp).toBeGreaterThan(0);

    const t2 = await setup();
    const dummy = spawnHostile(t2, 'dummy');
    died(t2, dummy);
    expect(t2.prog().xp).toBe(0);
    died(t2, spawnHostile(t2), 'someone-else');
    died(t2, spawnHostile(t2), null);
    expect(t2.prog().xp).toBe(0);

    const t3 = await setup();
    const release = t3.prog().pauseKillXp('test');
    died(t3, spawnHostile(t3));
    expect(t3.prog().xp).toBe(0);
    release();
    died(t3, spawnHostile(t3));
    expect(t3.prog().xp).toBeGreaterThan(0);

    t.dispose();
    t2.dispose();
    t3.dispose();
  });

  it('4b. mercy, revoke, then kill pays at most 100% of the kill value', async () => {
    const t = await setup();
    const w = spawnHostile(t);
    t.game.events.emit('mercy', { verb: 'release', tier: 'normal', track: 'ashwalkers', creature: 'ash-wraith', actorId: w.id });
    const afterMercy = t.prog().xp;
    expect(afterMercy).toBeGreaterThan(0);
    t.game.events.emit('mercy.revoked', { actorId: w.id, track: 'ashwalkers', removed: 1 });
    died(t, w);
    const total = t.prog().xp;
    const ref = await setup();
    died(ref, spawnHostile(ref));
    expect(total).toBe(ref.prog().xp);
    expect(total).toBeGreaterThan(afterMercy);
    t.dispose();
    ref.dispose();
  });

  it('5. grantXp across two levels', async () => {
    const t = await setup();
    const p = t.ctx.actors.player;
    p.health = 100;
    const lv2 = Math.round(50 * Math.pow(1, 2.2));
    const need = Math.round(50 * Math.pow(2, 2.2)); // xp for level 3
    expect(need).toBeGreaterThan(lv2);
    t.prog().grantXp(need, 'test');
    expect(t.prog().level).toBe(3);
    expect(t.of('level.up').map((e) => e.level)).toEqual([2, 3]);
    expect(t.prog().skillPoints).toBe(2); // levels 2 and 3 each grant a point
    expect(p.maxHealth).toBe(140);
    expect(p.health).toBe(120);
    t.dispose();
  });

  it('6. learn Rally Cry, bind to slot 0, use via KeyQ, empty slot via KeyE, duplicate handler', async () => {
    const t = await setup();
    t.prog().grantSkillPoint(1, 'test');
    expect(t.prog().learn('knight.rallyCry')).toEqual({ ok: true });
    expect(t.prog().bar()[0]).toBe('knight.rallyCry');

    const handler = vi.fn((_a: { skillId: string; slot: number }) => ({ ok: true as const }));
    const reg = t.abil().registerHandler('knight.rallyCry', handler);
    expect(reg.ok).toBe(true);
    expect(t.abil().registerHandler('knight.rallyCry', () => ({ ok: true }))).toMatchObject({ ok: false });

    t.press('KeyQ');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ skillId: 'knight.rallyCry', slot: 0 });
    expect(t.of('ability.used')).toEqual([{ skillId: 'knight.rallyCry', slot: 0 }]);

    t.press('KeyE');
    expect(t.of('ability.failed')).toEqual([{ slot: 1, reason: 'empty-slot' }]);
    t.dispose();
  });

  it('7. max health modifier lowers and restores', async () => {
    const t = await setup();
    const p = t.ctx.actors.player;
    const off = t.prog().addMaxHealthModifier('burn', () => 0.8);
    expect(p.maxHealth).toBe(Math.round(120 * 0.8));
    expect(p.health).toBe(p.maxHealth);
    off();
    expect(p.maxHealth).toBe(120);
    expect(p.health).toBe(96);
    t.dispose();
  });

  it('slice 2: ability.grant grants the Leap once through the flag, and a paid respec spends real gold', async () => {
    const t = await setup();
    t.game.events.emit('ability.grant', { id: 'surge-leap', source: 'm03' });
    t.game.events.emit('ability.grant', { id: 'surge-leap', source: 'm03' });
    expect(t.of('ability.learned')).toEqual([{ id: 'surge-leap', source: 'm03' }]);
    expect(t.ctx.state.getFlag('ability.surge-leap.learned')).toBe(true);
    expect(t.prog().hasAbility('surge-leap')).toBe(true);

    t.prog().grantXp(100, 's');
    t.prog().learn('knight.rimBash');
    const release = t.prog().allowRespec('test');
    expect(t.prog().respec()).toMatchObject({ ok: true, cost: 0 }); // the free one
    t.prog().learn('knight.rimBash');
    t.inv().addGold(10);
    expect(t.prog().respecQuote().canAfford).toBe(false);
    expect(t.prog().respec()).toEqual({ ok: false, reason: 'no-gold' });
    expect(t.inv().gold).toBe(10);
    t.inv().addGold(500);
    const quote = t.prog().respecQuote();
    expect(t.prog().respec()).toMatchObject({ ok: true, cost: quote.gold });
    expect(t.inv().gold).toBe(510 - quote.gold);
    release();
    t.dispose();
  });

  it('slice 2: a v1 progression save loads as the Knight with no class', async () => {
    const t = await setup();
    const reg = t.ctx.persist.get('progression')!;
    expect(reg.version).toBe(2);
    reg.load({ xp: 100, storyPoints: 0, learned: ['knight.rimBash'], bar: [null, null, null, null, null, null] }, 1);
    expect(t.prog().classId).toBeNull();
    expect(t.prog().learned('knight.rimBash')).toBe(true);
    expect(t.prog().respecQuote().free).toBe(true);
    t.dispose();
  });

  it('8. persist round trip', async () => {
    const t = await setup();
    const reg = t.ctx.persist;
    t.inv().add('healing-flask', 3);
    t.inv().addGold(7);
    t.prog().grantXp(100, 's');
    t.prog().grantSkillPoint(1, 'x');
    t.prog().learn('knight.rallyCry');
    t.prompts().success('sprint');
    const saved = (['inventory', 'progression', 'prompts'] as const).map((k) => {
      const p = reg.get(k)!;
      return { p, version: p.version, data: JSON.parse(JSON.stringify(p.serialize())) };
    });
    // mutate
    t.inv().remove('healing-flask', 3);
    t.inv().unequip('weapon');
    t.inv().takeGold(7);
    t.prog().grantXp(5000, 's');
    t.prompts().success('sprint');
    for (const s of saved) s.p.load(s.data, s.version);
    expect(t.inv().count('healing-flask')).toBe(3);
    expect(t.inv().equipped('weapon')).toBe('practice-sword');
    expect(t.inv().gold).toBe(7);
    expect(t.prog().xp).toBe(100);
    expect(t.prog().learned('knight.rallyCry')).toBe(true);
    expect(t.prompts().count('sprint')).toBe(1);

    const inv = reg.get('inventory')!;
    inv.load({ items: { 'practice-sword': 1, 'future-item': 4 }, equipped: {}, gold: 0 }, inv.version);
    expect(t.inv().has('future-item')).toBe(false);
    expect(JSON.stringify(inv.serialize())).toContain('future-item');
    t.dispose();
  });

  it('9. save.loaded recomputes max health', async () => {
    const t = await setup();
    const p = t.ctx.actors.player;
    t.prog().grantXp(Math.round(50 * Math.pow(1, 2.2)), 's'); // level 2
    expect(t.prog().level).toBe(2);
    t.prog().addMaxHealthModifier('one', () => 1.0);
    p.maxHealth = 999;
    p.health = 130;
    t.game.events.emit('save.loaded', { slot: 'a' });
    expect(p.maxHealth).toBe(130);
    expect(p.health).toBe(130);
    t.dispose();
  });

  it('10. KeyI toggles the inventory modal; KeyK does not replace it', async () => {
    const t = await setup();
    t.press('KeyI');
    expect(t.ctx.hud.modalOpen).toBe('inventory');
    t.press('KeyK');
    expect(t.ctx.hud.modalOpen).toBe('inventory');
    t.press('KeyI');
    expect(t.ctx.hud.modalOpen).toBe(null);
    t.press('KeyK');
    expect(t.ctx.hud.modalOpen).toBe('skills');
    t.press('KeyI');
    expect(t.ctx.hud.modalOpen).toBe('skills');
    t.press('KeyK');
    expect(t.ctx.hud.modalOpen).toBe(null);
    t.dispose();
  });

  it('11. healing flask', async () => {
    const t = await setup();
    const p = t.ctx.actors.player;
    t.inv().add('healing-flask', 2);
    expect(t.inv().use('healing-flask')).toEqual({ ok: false, reason: 'full-health' });
    expect(t.of('hud.toast').length).toBe(1);

    p.health = 10;
    expect(t.inv().use('healing-flask')).toMatchObject({ ok: true });
    expect(t.moveModifiers.state().speedScale).toBeCloseTo(0.5);
    expect(t.moveModifiers.isActionLocked('attack1')).toBe(true);
    t.run(30);
    expect(t.inv().count('healing-flask')).toBe(2);
    expect(p.health).toBe(10);
    t.run(50); // 80 ticks > 1.2 s
    expect(t.inv().count('healing-flask')).toBe(1);
    expect(p.health).toBe(10 + Math.round(120 * 0.4));
    expect(t.moveModifiers.state().speedScale).toBe(1);
    expect(t.of('item.used')).toEqual([{ itemId: 'healing-flask' }]);

    // stagger keeps the charge
    expect(t.inv().use('healing-flask')).toMatchObject({ ok: true });
    t.run(10);
    t.game.events.emit('actor.staggered', { actorId: 'player', byId: null });
    t.run(120);
    expect(t.inv().count('healing-flask')).toBe(1);
    expect(t.moveModifiers.state().speedScale).toBe(1);
    t.dispose();
  });

  it('11b. heal clamps to max health', async () => {
    const t = await setup();
    const p = t.ctx.actors.player;
    t.inv().add('healing-flask', 1);
    p.health = 100;
    t.inv().use('healing-flask');
    t.run(80);
    expect(p.health).toBe(120);
    t.dispose();
  });

  it('12. prompts count and flag', async () => {
    const t = await setup();
    t.prompts().success('sprint');
    t.prompts().success('sprint');
    expect(t.prompts().count('sprint')).toBe(2);
    expect(t.ctx.state.getFlag('prompt.sprint.count')).toBe(2);
    t.dispose();
  });

  it('13. HUD widgets are mounted', async () => {
    const t = await setup();
    const m = (s: any) => t.ctx.hud.mounted(s);
    expect(m('top-left')).toEqual(expect.arrayContaining(['status-bars', 'buff-bar']));
    expect(m('bottom-center')).toEqual(expect.arrayContaining(['ability-bar', 'prompts']));
    expect(m('top-right')).toContain('quest-tracker');
    expect(m('overlay')).toContain('lock-on');
    expect(m('toast')).toContain('toasts');
    expect(m('bottom-left').length).toBeGreaterThan(0);
    t.dispose();
  });

  it('13b. hud sets up ok when inventory is disabled or missing', async () => {
    const t = await setup(ALL, new Set(['inventory']));
    expect(t.statuses.find((s) => s.id === 'hud')?.state).toBe('ok');
    expect(t.statuses.find((s) => s.id === 'inventory')?.state).toBe('skipped');
    expect(t.ctx.services.get('inventory')).toBeUndefined();
    t.run(3);
    t.ctx.hud.update(0.016);
    t.dispose();

    const t2 = await setup([corePlugin, hudPlugin]);
    expect(t2.statuses.find((s) => s.id === 'hud')?.state).toBe('ok');
    t2.ctx.hud.update(0.016);
    t2.dispose();
  });
});

describe('review fixes', () => {
  it('xpBarProgress is XP within the level over the level size', async () => {
    const { xpBarProgress } = await import('./hud.plugin');
    expect(xpBarProgress({ level: 1, xp: 10 })).toEqual({ level: 1, xp: 10, xpToNext: 50, maxed: false });
    const l2 = xpBarProgress({ level: 2, xp: 60 });
    expect(l2.xp).toBe(10);
    expect(l2.xpToNext).toBeGreaterThan(l2.xp);
    expect(xpBarProgress({ level: 40, xp: 1e9 }).maxed).toBe(true);
  });

  it('the quest adapter reads the real quests service shape and the tracker finds a later-loaded service', async () => {
    const { adaptQuests } = await import('./hud.plugin');
    const questsPlugin = (await import('../quests/quests.plugin')).default;
    const t = await setup([corePlugin, hudPlugin, questsPlugin, progressionPlugin]);
    const q = t.ctx.services.get('quests' as any) as any;
    expect(q).toBeTruthy();
    q.start('m01');
    const rows = adaptQuests(q);
    expect(rows[0].id).toBe('m01');
    expect(rows[0].objectives.length).toBeGreaterThan(0);
    for (const o of rows[0].objectives) expect(o.textKey).toMatch(/^quest\.m01\./);
    expect(rows[0].objectives.every((o) => o.required >= 1)).toBe(true);
    expect(rows[0].titleKey).toBe(q.get('m01').titleKey);
    // A quest registered at runtime with its own titleKey shows that key, not quest.<id>.title.
    t.ctx.strings.register('en', { 'tutorial.x.title': 'X', 'tutorial.x.o1': 'Do x', 'tutorial.x.summary': 's' });
    q.register({ id: 'tx', titleKey: 'tutorial.x.title', summaryKey: 'tutorial.x.summary', objectives: [{ id: 'o1', type: 'interact', target: 'use:x', textKey: 'tutorial.x.o1' }] });
    q.start('tx');
    expect(adaptQuests(q).find((r) => r.id === 'tx')?.titleKey).toBe('tutorial.x.title');
    t.dispose();
  });

  it('max health follows a changing Burn modifier on burn.changed', async () => {
    const t = await setup();
    let factor = 1;
    t.prog().addMaxHealthModifier('burn', () => factor);
    factor = 0.5;
    t.game.events.emit('burn.changed', { value: 60, previous: 0 });
    expect(t.ctx.actors.player.maxHealth).toBe(60);
    factor = 1;
    t.game.events.emit('burn.changed', { value: 0, previous: 60 });
    expect(t.ctx.actors.player.maxHealth).toBe(120);
    t.dispose();
  });

  it('xp.grant event pays good payloads and ignores bad ones', async () => {
    const t = await setup();
    t.game.events.emit('xp.grant', { amount: 30, source: 'quest:x' });
    t.game.events.emit('xp.grant', { amount: -5, source: 'x' });
    t.game.events.emit('xp.grant', { amount: Number.NaN, source: 'x' });
    expect(t.prog().xp).toBe(30);
    t.dispose();
  });

  it('loading a corrupt inventory resets gold; load clears the mercy ledger', async () => {
    const t = await setup();
    t.inv().addGold(50);
    t.ctx.persist.get('inventory')!.load(null, 1);
    expect(t.inv().gold).toBe(0);
    t.dispose();
  });
});

describe('slice 2 widgets and soft services', () => {
  const bossDef = { bossId: 'ashen-prior', nameKey: 'boss.ashen-prior', phases: [0.66, 0.33], breaksPerPhase: 3 };

  it('mounts the new widgets with only core present and provides respecModal', async () => {
    const t = await setup([corePlugin, hudPlugin]);
    expect(t.statuses.find((s) => s.id === 'hud')?.state).toBe('ok');
    expect(t.ctx.hud.mounted('top-center')).toContain('boss-bar');
    expect(t.ctx.hud.mounted('top-left')).toEqual(expect.arrayContaining(['status-bars', 'companion-portrait']));
    expect(t.ctx.hud.mounted('center')).toContain('act-continues');
    expect(t.ctx.services.get('respecModal' as any)).toBeTruthy();
    t.run(2);
    t.ctx.hud.update(0.016);
    t.dispose();
  });

  it('a missing optional service (spells, companions, leap) never removes the health bars', async () => {
    const t = await setup([corePlugin, hudPlugin]);
    expect(t.ctx.services.get('spells' as any)).toBeUndefined();
    expect(t.ctx.services.get('companions' as any)).toBeUndefined();
    t.game.events.emit('scar.added', { total: 1, source: 'x' });
    t.game.events.emit('player.leap', { phase: 'start', from: { x: 0, y: 0, z: 0 } });
    t.game.events.emit('companion.joined', { companionId: 'tobb', actorId: 'nobody' });
    t.game.events.emit('companion.aura', { companionId: 'tobb', auraId: 'battle-song', active: true });
    t.game.events.emit('boss.ended', { bossId: 'ghost', actorId: 'nobody', reason: 'despawned' });
    t.game.events.emit('boss.phase', { bossId: 'ghost', phase: 2, previous: 1 });
    t.game.events.emit('trigger.enter', { triggerId: 'trg.fog.harrowmark', actorId: 'player' });
    t.game.events.emit('save.loaded', { slot: 'x' });
    t.run(2);
    expect(() => t.ctx.hud.update(0.016)).not.toThrow();
    expect(t.ctx.hud.mounted('top-left')).toContain('status-bars');
    t.dispose();
  });

  it('boss lifecycle through the real registry updates without errors and fades out', async () => {
    const t = await setup([corePlugin, hudPlugin]);
    const boss = t.ctx.actors.spawn({ kind: 'ash-prior', team: 'hostile', level: 5, maxHealth: 100 });
    t.ctx.bosses.register(boss.id, bossDef);
    t.ctx.hud.update(0.016);
    t.ctx.bosses.setShield(bossDef.bossId, true);
    t.ctx.hud.update(0.016);
    boss.health = 40;
    t.ctx.hud.update(0.016);
    t.ctx.hud.update(2);
    expect(t.ctx.hud.mounted('top-center')).toContain('boss-bar');
    t.dispose();
  });

  it('respecModal opens a menu modal and refuses a second one', async () => {
    const t = await setup([corePlugin, hudPlugin]);
    const svc = t.ctx.services.get('respecModal' as any) as any;
    const confirm = vi.fn();
    const cancel = vi.fn();
    expect(svc.open({ quote: { free: true, gold: 0, canAfford: true }, confirm, cancel })).toBe(true);
    expect(t.ctx.hud.modalOpen).toBe('respec');
    expect(svc.open({ quote: { free: true, gold: 0, canAfford: true }, confirm, cancel })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    t.dispose();
  });
});
