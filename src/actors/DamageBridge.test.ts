import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DamageBus } from '../combat/DamageBus';
import type { CombatSystem } from '../combat/CombatSystem';
import type { HitEvent } from '../combat/types';
import { GameEvents } from '../core/events';
import { ActorRegistry } from './ActorRegistry';
import { CombatRegistry } from './CombatRegistry';
import { DamageBridge, hitDirection } from './DamageBridge';
import { DamageResolver } from './DamageResolver';
import { playerInit } from './teams';

function obj(x: number, y = 0, z = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.updateMatrixWorld(true);
  return o;
}

function setup() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const damage = new DamageResolver(actors, events, () => {});
  const system = { addAttacker: vi.fn(), removeAttacker: vi.fn(), addTarget: vi.fn(), removeTarget: vi.fn() };
  const combat = new CombatRegistry(system as unknown as CombatSystem, events);
  const bus = new DamageBus(() => {});
  const bridge = new DamageBridge(bus, actors, damage, combat);
  const playerRoot = obj(0);
  const avatar = {};
  const player = actors.spawn({ ...playerInit(), root: playerRoot, owner: avatar });
  const dummyModel = obj(0, 0, -2);
  const dummy = actors.spawn({ kind: 'dummy', team: 'neutral', maxHealth: 100, immortal: true, maxPoise: 50, root: dummyModel, owner: dummyModel });
  const dealt: ReturnType<typeof capture> = capture(events);
  const hit = (over: Partial<HitEvent> = {}): HitEvent => ({
    bone: 'chest',
    point: new THREE.Vector3(0, 1, -1.5),
    normal: new THREE.Vector3(0, 0, 1),
    attacker: avatar,
    target: dummyModel,
    damage: 10,
    ...over,
  });
  return { events, actors, damage, combat, bus, bridge, player, avatar, dummy, dummyModel, playerRoot, dealt, hit, system };
}

function capture(events: GameEvents) {
  const out: import('./DamageResolver').DamageResult[] = [];
  events.on('damage.dealt', (r) => out.push(r));
  return out;
}

describe('DamageBridge', () => {
  it('turns a player HitEvent on a dummy into damage.dealt with the HitEvent fields', () => {
    const { bus, hit, dealt, player, dummy } = setup();
    const e = hit();
    bus.emit(e);
    expect(dealt).toHaveLength(1);
    expect(dealt[0]).toMatchObject({
      attackerId: player.id,
      targetId: dummy.id,
      amount: 10,
      poise: 10,
      kind: 'melee',
      bone: 'chest',
      dealt: 10,
      outcome: 'hit',
    });
  });

  it('clones point and normal so later mutation of the HitEvent does not leak', () => {
    const { bus, hit, dealt } = setup();
    const e = hit();
    bus.emit(e);
    expect(dealt[0].point).not.toBe(e.point);
    expect(dealt[0].normal).not.toBe(e.normal);
    e.point.set(9, 9, 9);
    expect(dealt[0].point!.toArray()).toEqual([0, 1, -1.5]);
  });

  it('fills direction: horizontal unit vector from attacker root to target root', () => {
    const { bus, hit, dealt } = setup();
    bus.emit(hit());
    const d = dealt[0].direction!;
    expect(d.length()).toBeCloseTo(1);
    expect(d.y).toBe(0);
    expect(d.z).toBeCloseTo(-1);
    expect(d.x).toBeCloseTo(0);
  });

  it('fills attackId and swingId from an open attack window', () => {
    const { bus, hit, dealt, combat, avatar } = setup();
    const w = { clipName: 'Slice', start: 0, end: 1, swingId: 5, currentTime: () => 0.5 };
    combat.watch('player', avatar, w);
    combat.pollWindows();
    bus.emit(hit());
    expect(dealt[0].attackId).toBe('Slice');
    expect(dealt[0].swingId).toBe(5);
  });

  it('leaves attackId and swingId undefined without an open window', () => {
    const { bus, hit, dealt } = setup();
    bus.emit(hit());
    expect(dealt[0].attackId).toBeUndefined();
    expect(dealt[0].swingId).toBeUndefined();
  });

  it('ignores hits whose attacker has no actor', () => {
    const { bus, hit, dealt } = setup();
    bus.emit(hit({ attacker: {} }));
    expect(dealt).toEqual([]);
  });

  it('ignores hits whose target has no actor', () => {
    const { bus, hit, dealt } = setup();
    bus.emit(hit({ target: {} }));
    expect(dealt).toEqual([]);
  });

  it('ignores hits with null or undefined owners', () => {
    const { bus, hit, dealt } = setup();
    bus.emit(hit({ attacker: null }));
    bus.emit(hit({ target: undefined }));
    expect(dealt).toEqual([]);
  });

  it('team rule still applies (player cannot hit itself or an ally)', () => {
    const { bus, hit, dealt, avatar } = setup();
    bus.emit(hit({ target: avatar }));
    expect(dealt).toEqual([]);
  });

  it('works for a second owner bound to the same actor', () => {
    const { bus, hit, dealt, actors, player } = setup();
    const model = {};
    actors.bindOwner(player, model);
    bus.emit(hit({ attacker: model }));
    expect(dealt[0].attackerId).toBe(player.id);
  });

  it('a hit on a despawned target is ignored', () => {
    const { bus, hit, dealt, actors, dummy } = setup();
    actors.despawn(dummy.id);
    bus.emit(hit());
    expect(dealt).toEqual([]);
  });

  it('a hit with zero damage is a poise-only hit', () => {
    const { bus, hit, dealt, dummy } = setup();
    bus.emit(hit({ damage: 0 }));
    expect(dealt[0].dealt).toBe(0);
    expect(dummy.poise).toBe(50);
  });

  it('a NaN damage is dropped by the resolver, not thrown', () => {
    const { bus, hit, dealt } = setup();
    expect(() => bus.emit(hit({ damage: NaN }))).not.toThrow();
    expect(dealt).toEqual([]);
  });

  it('dispose unsubscribes; dispose twice is safe', () => {
    const { bus, bridge, hit, dealt } = setup();
    expect(bus.listenerCount).toBe(1);
    bridge.dispose();
    bridge.dispose();
    expect(bus.listenerCount).toBe(0);
    bus.emit(hit());
    expect(dealt).toEqual([]);
  });

  it('a kill by hit produces dealt then died', () => {
    const { bus, hit, actors, events, avatar } = setup();
    const enemyModel = {};
    actors.spawn({ kind: 'wraith', team: 'hostile', maxHealth: 5, owner: enemyModel });
    const log: string[] = [];
    events.onAny((t) => log.push(String(t)));
    bus.emit(hit({ target: enemyModel, attacker: avatar, damage: 50 }));
    expect(log).toEqual(['damage.dealt', 'actor.died']);
  });
});

describe('hitDirection', () => {
  it('is the horizontal unit vector between roots', () => {
    const d = hitDirection(obj(0, 5, 0), obj(3, -2, 4), new THREE.Vector3(0, 0, 1));
    expect(d.toArray().map((v) => +v.toFixed(6))).toEqual([0.6, 0, 0.8]);
  });

  it('falls back to the negated horizontal normal when roots coincide', () => {
    const d = hitDirection(obj(1, 0, 1), obj(1, 3, 1), new THREE.Vector3(1, 0.5, 0));
    expect(d.toArray().map((v) => +v.toFixed(6))).toEqual([-1, 0, 0]);
  });

  it('falls back to the negated normal when a root is missing', () => {
    const d = hitDirection(null, obj(5), new THREE.Vector3(0, 0, -1));
    expect(d.z).toBe(1);
    expect(d.x + 0).toBe(0);
    const d2 = hitDirection(obj(5), null, new THREE.Vector3(0, 0, 2));
    expect(d2.z).toBe(-1);
  });

  it('falls back to +z when the normal is vertical too', () => {
    const d = hitDirection(null, null, new THREE.Vector3(0, 1, 0));
    expect(d.z).toBe(1);
    expect(d.length()).toBe(1);
  });

  it('always returns a finite unit vector', () => {
    for (const n of [new THREE.Vector3(), new THREE.Vector3(1e-6, 0, 0), new THREE.Vector3(0, 0, 0)]) {
      const d = hitDirection(null, null, n);
      expect(d.length()).toBeCloseTo(1);
    }
  });

  it('works with nested parents (world position, not local)', () => {
    const parent = obj(10, 0, 0);
    const child = new THREE.Object3D();
    child.position.set(0, 0, 0);
    parent.add(child);
    parent.updateMatrixWorld(true);
    const d = hitDirection(obj(0), child, new THREE.Vector3(0, 0, 1));
    expect(d.toArray()).toEqual([1, 0, 0]);
  });
});
