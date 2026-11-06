import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauntRegistry } from '../enemies/taunts';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { makeKit, type Kit } from '../waves/testKit';
import { ESCORT_CART, EscortCart, type CartHealth } from './EscortCart';

let physics: PhysicsWorld;
let kit: Kit;
let taunts: TauntRegistry;
let cart: EscortCart | null = null;
const changes: CartHealth[] = [];

const make = (health?: number) => {
  const f = kit.ctx.player.feet;
  cart = new EscortCart(kit.ctx, 'r24.cart', { x: f.x + 4, y: f.y, z: f.z, yaw: 0 }, health, (h) => changes.push(h));
  return cart;
};
const foe = () => kit.ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 40, maxPoise: 15, root: new THREE.Group() });

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics, { withWaves: false, anchors: false });
  taunts = new TauntRegistry();
  (kit.enemies.service as unknown as { taunts: TauntRegistry }).taunts = taunts;
  changes.length = 0;
}, 30_000);
afterEach(() => {
  cart?.dispose();
  cart = null;
  kit.teardown();
  vi.restoreAllMocks();
});

describe('escort cart', () => {
  it('starts at full health on the ally team and is a taunter', () => {
    const c = make();
    expect(c.health()).toEqual({ health: ESCORT_CART.maxHealth, max: ESCORT_CART.maxHealth });
    expect(c.actor.team).toBe('ally');
    expect(taunts.pick({ x: c.position.x + 2, z: c.position.z })?.id).toBe(c.actorId);
  });

  it('only hostile hits lower it', () => {
    const c = make();
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: c.actorId, amount: 100, kind: 'melee' });
    expect(c.health().health).toBe(ESCORT_CART.maxHealth);
    kit.ctx.damage.apply({ attackerId: foe().id, targetId: c.actorId, amount: 150, kind: 'melee' });
    expect(c.health().health).toBe(ESCORT_CART.maxHealth - 150);
    expect(changes.at(-1)).toEqual({ health: 450, max: 600 });
  });

  it('at 0 it stops and is never destroyed; further hits do nothing; it stops taunting', () => {
    const c = make();
    const f = foe();
    for (let i = 0; i < 5; i++) {
      const r = kit.ctx.damage.apply({ attackerId: f.id, targetId: c.actorId, amount: 9999, kind: 'melee' });
      expect(r?.killed).toBe(false);
    }
    expect(c.down).toBe(true);
    expect(c.health()).toEqual({ health: 0, max: 600 });
    expect(c.actor.dead).toBe(false);
    expect(kit.ctx.actors.get(c.actorId)).toBeDefined();
    expect(taunts.pick({ x: c.position.x + 2, z: c.position.z })).toBeNull();
  });

  it('revive brings it back at half health, taunting again; revive while standing does nothing', () => {
    const c = make();
    c.revive();
    expect(c.health().health).toBe(600);
    kit.ctx.damage.apply({ attackerId: foe().id, targetId: c.actorId, amount: 9999, kind: 'melee' });
    c.revive();
    expect(c.down).toBe(false);
    expect(c.health().health).toBe(300);
    expect(taunts.pick({ x: c.position.x + 2, z: c.position.z })?.id).toBe(c.actorId);
  });

  it('restores a saved health, down at 0, and clamps nonsense', () => {
    expect(make(250).health().health).toBe(250);
    cart!.dispose();
    expect(make(0).down).toBe(true);
    cart!.dispose();
    expect(make(Number.NaN).health().health).toBe(600);
    cart!.dispose();
    expect(make(99999).health().health).toBe(600);
  });
});
