// v0.9 item 5: the siege's additions to the waves kit: the defenders' kneel rule, a cart's role and its stall.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Defenders, defenderBodyFactory, KNEEL_CLEAR_RADIUS } from './defenders';
import { Carts, type Cart } from './structures';
import { CART, DEFENDER } from './tuning';
import { makeKit, TICK, type Kit } from './testKit';

let physics: PhysicsWorld;
let kit: Kit;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics, { anchors: false });
});
afterEach(() => {
  kit.teardown();
  vi.restoreAllMocks();
});

const hostile = () => kit.ctx.actors.spawn({ kind: 'ember-hound', team: 'hostile', maxHealth: 40, maxPoise: 15, root: new THREE.Group() });

describe('the kneel rule', () => {
  function militia(near: { value: boolean }, kneel = true) {
    const f = kit.ctx.player.feet;
    const set = new Defenders(kit.ctx, defenderBodyFactory(null), {
      lethalHandlerId: 'test.siege.lethal',
      noKillHandlerId: 'test.siege.nokill',
      kind: 'militia',
      ...(kneel ? { kneel: { clearRadius: KNEEL_CLEAR_RADIUS, hostileWithin: () => near.value } } : {}),
    });
    set.build([{ x: f.x + 10, y: f.y, z: f.z }], 0);
    return set;
  }
  const run = (set: Defenders, s: number) => {
    for (let i = 0; i < Math.round(s / TICK); i++) set.fixedUpdate(TICK);
  };

  it('is 8 m', () => expect(KNEEL_CLEAR_RADIUS).toBe(8));

  it('a downed ally kneels past his knockdown while a hostile is near, then rises once it is clear', () => {
    const near = { value: true };
    const set = militia(near);
    const d = set.all[0];
    kit.ctx.damage.apply({ attackerId: hostile().id, targetId: d.id, amount: 9999, kind: 'melee' });
    expect(d.state).toBe('down');
    run(set, DEFENDER.knockdownSeconds + 5);
    expect(d.state).toBe('down');
    expect(d.kneeling).toBe(true);
    near.value = false;
    run(set, DEFENDER.riseSeconds + 0.2);
    expect(d.state).toBe('post');
    expect(d.kneeling).toBe(false);
    expect(d.actor.health).toBe(d.actor.maxHealth);
    set.despawnAll();
  });

  it('with no hostile near he rises on the shipped timer', () => {
    const set = militia({ value: false });
    const d = set.all[0];
    kit.ctx.damage.apply({ attackerId: hostile().id, targetId: d.id, amount: 9999, kind: 'melee' });
    run(set, DEFENDER.knockdownSeconds + 0.2);
    expect(d.state).toBe('post');
    set.despawnAll();
  });

  it('without the rule the timer path is unchanged, hostile or not', () => {
    const set = militia({ value: true }, false);
    const d = set.all[0];
    kit.ctx.damage.apply({ attackerId: hostile().id, targetId: d.id, amount: 9999, kind: 'melee' });
    run(set, DEFENDER.knockdownSeconds - 0.3);
    expect(d.state).toBe('down');
    run(set, 0.5);
    expect(d.state).toBe('post');
    expect(d.kneeling).toBe(false);
    set.despawnAll();
  });
});

describe('cart role and stall', () => {
  let carts: Carts;
  beforeEach(() => {
    carts = new Carts(kit.ctx);
  });
  afterEach(() => carts.dispose());
  const roll = (s: number) => {
    for (let i = 0; i < Math.round(s / TICK); i++) carts.fixedUpdate(TICK);
  };
  function spawn(role?: 'ram' | 'brazier'): Cart {
    const { x, z } = kit.at;
    return carts.spawn({
      id: `test.cart.${role ?? 'none'}`,
      start: { x: x - 50, y: kit.y, z },
      end: { x, y: kit.y, z },
      origin: { x, z },
      onResolve: () => {},
      ...(role ? { role } : {}),
    })!;
  }

  it('defaults to a brazier cart; a ram keeps its role', () => {
    expect(spawn().role).toBe('brazier');
    expect(spawn('ram').role).toBe('ram');
  });

  it('a stall holds a rolling cart in place, then it rolls on', () => {
    const c = spawn('ram');
    roll(1);
    const at = c.localPosition();
    c.stall(3);
    expect(c.stalled).toBe(3);
    roll(2);
    expect(c.localPosition()).toEqual(at);
    expect(c.stalled).toBeGreaterThan(0.9);
    roll(1.2);
    expect(c.stalled).toBe(0);
    roll(1);
    const moved = Math.hypot(c.localPosition().x - at.x, c.localPosition().z - at.z);
    expect(moved).toBeGreaterThan(CART.speed * 0.5);
  });

  it('stalls do not stack: the longest standing one wins', () => {
    const c = spawn();
    roll(0.5);
    c.stall(2);
    c.stall(1);
    expect(c.stalled).toBe(2);
    roll(1);
    c.stall(3);
    expect(c.stalled).toBe(3);
  });

  it('a bad or non-positive stall is ignored', () => {
    const c = spawn();
    roll(0.5);
    for (const s of [0, -1, NaN, Infinity]) c.stall(s);
    expect(c.stalled).toBe(0);
  });
});
