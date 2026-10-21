// A5 PR 2 headless: Sister Aelfreda (Calming flame, never attacks), the Hearth Rite through her talk tree's event,
// the R11 den lines, and the cosmetic followers (Ember pup, Kindling Brush) with their readers.
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { EFFECT_EVENT_PATTERN } from '../quests/types';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { AELFREDA } from './aelfreda';
import companionsPlugin, { companionControllers } from './companions.plugin';
import { RITE_READY_FLAG, npcAelfredaCompanion } from './dialogue/npcAelfredaCompanion.dialogue';
import { KINDLING_BRUSH_ITEM, R07_CHOICE_FLAG } from './extras';
import { HROLF, R11_CHOICE_FLAG } from './hrolf';
import { riteFlag } from './rite';
import { TOBB } from './tobb';
import { AELFREDA_TUNING } from './tuning';
import './types';

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function boot() {
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
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  await game.loadPlugins(modules(corePlugin, companionsPlugin));
  const ctx = game.ctx;
  for (const id of ['tobb', 'hrolf', 'aelfreda']) {
    ctx.anchors.define({ id: `npc-post.${id}.tilted-anvil`, position: { x: 300, y: heightAt(300, 300), z: 300 }, yaw: 0 });
  }
  // Stand-ins for the spells and inventory services (their plugins are not loaded here).
  const spells = {
    scars: 2,
    removeScars: (n: number) => {
      const r = Math.min(n, spells.scars);
      spells.scars -= r;
      ctx.events.emit('scar.removed', { count: r, total: spells.scars, reason: 'hearth-rite' });
      return r;
    },
  };
  const items = new Map<string, number>();
  ctx.services.provide('spells', spells as never);
  ctx.services.provide('inventory', { count: (id: string) => items.get(id) ?? 0 } as never);
  const give = (id: string, n: number) => {
    items.set(id, n);
    ctx.events.emit('inventory.changed', { itemId: id, count: n } as never);
  };
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const secs = (s: number) => run(Math.round(s * 60));
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const svc = () => ctx.services.require('companions');
  const ctl = (id: string) => companionControllers().find((c) => c.def.id === id)!;
  const join = (id: string, flag: string) => {
    ctx.state.setFlag(flag, true);
    secs(1);
    expect(svc().active()).toContain(id);
  };
  const pl = () => ctx.player.actor;
  const hurt = (to: number) => {
    pl().health = to;
  };
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, events, run, secs, of, svc, ctl, join, pl, hurt, spells, give, done };
}

describe('Sister Aelfreda: Calming flame (design 8.1)', () => {
  it('heals 2% of max health every 5 s out of combat while Cael is hurt, with companion.aura on and off', async () => {
    const t = await boot();
    t.join('aelfreda', AELFREDA.joinFlag);
    const max = t.pl().maxHealth;
    t.hurt(max / 2);
    t.secs(AELFREDA_TUNING.flameEverySeconds + 0.1);
    expect(t.pl().health).toBeCloseTo(max / 2 + max * AELFREDA_TUNING.flameHealFraction, 3);
    expect(t.ctl('aelfreda').calmingFlameActive).toBe(true);
    expect(t.of('companion.aura').filter((a) => a.auraId === 'calming-flame')[0]).toEqual({ companionId: 'aelfreda', auraId: 'calming-flame', active: true });
    // Full health: it stops.
    t.hurt(max);
    t.run(2);
    expect(t.ctl('aelfreda').calmingFlameActive).toBe(false);
    expect(t.of('companion.aura').filter((a) => a.auraId === 'calming-flame').at(-1)!.active).toBe(false);
    t.done();
  });

  it('never in combat, never while she waits (inactive)', async () => {
    const t = await boot();
    t.join('aelfreda', AELFREDA.joinFlag);
    const max = t.pl().maxHealth;
    t.hurt(max / 2);
    // In combat: a foe aggroed on Cael.
    const root = new THREE.Group();
    t.ctx.scene.add(root);
    const foe = t.ctx.actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 30, maxPoise: 30, root });
    t.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: t.pl().id });
    t.secs(11);
    expect(t.pl().health).toBe(max / 2);
    t.ctx.actors.despawn(foe.id);
    // Swapped out (Hrolf joins): she walks to her post and heals nothing.
    t.join('hrolf', HROLF.joinFlag);
    expect(t.svc().active()).toEqual(['hrolf']);
    t.secs(11);
    expect(t.pl().health).toBe(max / 2);
    t.done();
  });

  it('never while Cael is dead', async () => {
    const t = await boot();
    t.join('aelfreda', AELFREDA.joinFlag);
    t.ctx.damage.apply({ attackerId: null, targetId: t.pl().id, amount: 1e6, kind: 'script' });
    expect(t.pl().dead).toBe(true);
    const heals = t.of('actor.healed' as never).length;
    t.secs(AELFREDA_TUNING.flameEverySeconds * 2 + 0.5);
    expect(t.pl().health).toBe(0);
    expect(t.ctl('aelfreda').calmingFlameActive).toBe(false);
    expect(t.of('actor.healed' as never).length).toBe(heals);
    t.done();
  });

  it('never attacks: no damage from her in a fight', async () => {
    const t = await boot();
    t.join('aelfreda', AELFREDA.joinFlag);
    const f = t.ctx.player.feet;
    const root = new THREE.Group();
    root.position.set(f.x, f.y, f.z - 1.5);
    t.ctx.scene.add(root);
    const foe = t.ctx.actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 30, maxPoise: 30, root });
    t.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: t.pl().id });
    t.ctx.damage.apply({ attackerId: t.pl().id, targetId: foe.id, amount: 2, kind: 'melee' });
    t.secs(6);
    const hers = t.svc().actorId('aelfreda');
    expect(t.of('damage.dealt').filter((d) => d.attackerId === hers)).toEqual([]);
    t.done();
  });
});

describe('Calming flame and trials', () => {
  it('never heals during a trial duel', async () => {
    const t = await boot();
    t.join('aelfreda', AELFREDA.joinFlag);
    const max = t.pl().maxHealth;
    const root = new THREE.Group();
    t.ctx.scene.add(root);
    const opp = t.ctx.actors.spawn({ kind: 'hrolf-trial', team: 'hostile', maxHealth: 120, maxPoise: 45, root });
    root.position.set(t.ctx.player.feet.x, t.ctx.player.feet.y, t.ctx.player.feet.z - 3);
    expect(t.ctx.services.require('trials').start({ id: 'tr', opponentId: opp.id })).toBe(true);
    t.hurt(max / 2);
    t.secs(AELFREDA_TUNING.flameEverySeconds * 2 + 0.5);
    expect(t.pl().health).toBe(max / 2);
    expect(t.ctl('aelfreda').calmingFlameActive).toBe(false);
    t.done();
  });
});

describe('the Hearth Rite through her talk tree', () => {
  it('the tree validates its event name; the ready flag follows the rite; the event removes a Scar once this act', async () => {
    expect(EFFECT_EVENT_PATTERN.test('npc.aelfreda.hearthRite')).toBe(true);
    expect(npcAelfredaCompanion.start[0]).toEqual({ when: { flag: RITE_READY_FLAG, equals: true }, node: 'rite-offer' });
    const t = await boot();
    t.run(1);
    expect(t.ctx.state.getFlag(RITE_READY_FLAG)).toBe(false);
    t.join('aelfreda', AELFREDA.joinFlag);
    expect(t.ctx.state.getFlag(RITE_READY_FLAG)).toBe(true);
    t.ctx.events.emit('npc.aelfreda.hearthRite', undefined);
    expect(t.spells.scars).toBe(1);
    expect(t.ctx.state.getFlag(riteFlag(1))).toBe(true);
    expect(t.ctx.state.getFlag(RITE_READY_FLAG)).toBe(false);
    expect(t.of('hud.toast').some((x) => x.textKey === 'companion.aelfreda.rite.done')).toBe(true);
    // Refused the second time this act.
    t.ctx.events.emit('npc.aelfreda.hearthRite', undefined);
    expect(t.spells.scars).toBe(1);
    // A new act opens it again.
    t.ctx.state.setFlag('story.gate.a2', true);
    expect(t.ctx.state.getFlag(RITE_READY_FLAG)).toBe(true);
    t.done();
  });
});

describe('banter pools (Act 2)', () => {
  it('every place of every companion maps to a non-empty pool; Hrolf has Cinderreach and Oldsmoke region lines', () => {
    for (const def of [TOBB, HROLF, AELFREDA]) {
      const places = [...Object.values(def.places.triggers), ...Object.values(def.places.interiors), ...Object.values(def.places.regions)];
      for (const p of places) {
        const v = def.areaVariant ? def.areaVariant(p, (k) => (k === R11_CHOICE_FLAG ? 'spared' : undefined)) : p;
        expect(def.banter.area[v!]?.length ?? 0, `${def.id} ${p}`).toBeGreaterThan(0);
      }
      for (const r of ['cinderreach', 'oldsmoke']) expect(def.places.regions[r], `${def.id} ${r}`).toBeTruthy();
      expect(def.banter.combatStart.length + def.banter.elapsed.length).toBeGreaterThan(0);
    }
  });

  it('entering Cinderreach and Oldsmoke brings an area bark', async () => {
    const t = await boot();
    t.join('aelfreda', AELFREDA.joinFlag);
    t.secs(30);
    t.ctx.events.emit('region.entered', { regionId: 'cinderreach', previous: null } as never);
    t.secs(8);
    t.secs(60);
    t.ctx.events.emit('region.entered', { regionId: 'oldsmoke', previous: null } as never);
    t.secs(8);
    const area = t.of('companion.banter').filter((b) => b.trigger === 'area').map((b) => b.lineKey);
    expect(area.some((k) => k.includes('.area.cinderreach.'))).toBe(true);
    expect(area.some((k) => k.includes('.area.oldsmoke.'))).toBe(true);
    t.done();
  });

  it('Hrolf at the wyrm den: nothing before R11 ends, then the spared or the slain lines', async () => {
    const v = (c: unknown) => HROLF.areaVariant!('den', (k) => (k === R11_CHOICE_FLAG ? c : undefined));
    expect(v(undefined)).toBeNull();
    expect(v('spared')).toBe('den.spared');
    expect(v('slain')).toBe('den.slain');
    expect(HROLF.areaVariant!('cinderreach', () => undefined)).toBe('cinderreach');
    const t = await boot();
    t.join('hrolf', HROLF.joinFlag);
    t.secs(30);
    const den = () => t.of('companion.banter').filter((b) => b.lineKey.includes('.area.den.'));
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.cinderreach.den', actorId: t.pl().id } as never);
    t.secs(5);
    expect(den()).toEqual([]);
    t.ctx.state.setFlag(R11_CHOICE_FLAG, 'slain');
    t.secs(60);
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.cinderreach.den', actorId: t.pl().id } as never);
    t.secs(5);
    expect(den().length).toBe(1);
    expect(den()[0].lineKey).toContain('.den.slain.');
    t.done();
  });
});

describe('cosmetic followers', () => {
  it('the Ember pup follows while R07 is spared, never as an actor or a party seat', async () => {
    const t = await boot();
    t.run(1);
    const actors = [...t.ctx.actors.all()].length;
    const pup = () => t.ctx.scene.getObjectByName('ember-pup');
    expect(pup()).toBeUndefined();
    t.ctx.state.setFlag(R07_CHOICE_FLAG, 'culled');
    t.run(1);
    expect(pup()).toBeUndefined();
    t.ctx.state.setFlag(R07_CHOICE_FLAG, 'spared');
    t.secs(1);
    expect(pup()!.visible).toBe(true);
    expect([...t.ctx.actors.all()].length).toBe(actors);
    expect(t.svc().active()).toEqual([]);
    // Behind Cael, close by.
    const f = t.ctx.player.feet;
    expect(Math.hypot(pup()!.position.x - f.x, pup()!.position.z - f.z)).toBeLessThan(4);
    // A load without the choice removes him; one with it brings him back.
    t.ctx.state.setFlag(R07_CHOICE_FLAG, 'culled');
    t.ctx.events.emit('save.loaded', { slot: 's' });
    expect(pup()).toBeUndefined();
    t.ctx.state.setFlag(R07_CHOICE_FLAG, 'spared');
    t.ctx.events.emit('save.loaded', { slot: 's' });
    t.secs(0.5);
    expect(pup()!.visible).toBe(true);
    // Disposing the game removes the followers from the scene.
    t.done();
    expect(pup()).toBeUndefined();
  });

  it('the Kindling Brush lights while Cael holds the item, hides in a stealth section and after a load without it', async () => {
    const t = await boot();
    t.run(1);
    const brush = () => t.ctx.scene.getObjectByName('kindling-brush');
    // Hidden by dimming: the light stays in the scene (no light-count change, no shader recompile).
    const lit = () => {
      const light = brush()!.children.find((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight;
      const bead = brush()!.children.find((c) => (c as THREE.Mesh).isMesh)!;
      return light.intensity > 0 && bead.visible;
    };
    t.give(KINDLING_BRUSH_ITEM, 1);
    t.secs(0.5);
    expect(lit()).toBe(true);
    expect(brush()!.position.y).toBeGreaterThan(t.ctx.player.feet.y + 0.5);
    t.ctx.events.emit('stealth.section', { sectionId: 's', phase: 'entered' });
    t.run(1);
    expect(lit()).toBe(false);
    expect(brush()!.visible).toBe(true);
    t.ctx.events.emit('stealth.section', { sectionId: 's', phase: 'exited' });
    t.run(2);
    expect(lit()).toBe(true);
    t.give(KINDLING_BRUSH_ITEM, 0);
    expect(brush()).toBeUndefined();
    t.give(KINDLING_BRUSH_ITEM, 1);
    expect(brush()).toBeDefined();
    // A load re-reads the item.
    (t.ctx.services.get('inventory' as never) as unknown as { count(id: string): number }).count = () => 0;
    t.ctx.events.emit('save.loaded', { slot: 's' });
    expect(brush()).toBeUndefined();
    t.done();
  });
});
