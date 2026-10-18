import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { ActorRegistry } from './ActorRegistry';
import { playerInit } from './teams';

function make() {
  const events = new GameEvents(() => {});
  const registry = new ActorRegistry(events);
  const log: string[] = [];
  events.onAny((t, p) => {
    const e = p as { actor?: { id: string }; actorId?: string };
    log.push(`${String(t)}:${e.actor?.id ?? e.actorId}`);
  });
  return { events, registry, log };
}

const wraith = { kind: 'ash-wraith', team: 'hostile' as const, maxHealth: 20 };

function rooted(x: number, y = 0, z = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.updateMatrixWorld(true);
  return o;
}

describe('ActorRegistry spawn and ids', () => {
  it('generates kind#n ids per kind and emits actor.spawned', () => {
    const { registry, log } = make();
    const a = registry.spawn(wraith);
    const b = registry.spawn(wraith);
    const c = registry.spawn({ ...wraith, kind: 'soldier' });
    expect([a.id, b.id, c.id]).toEqual(['ash-wraith#1', 'ash-wraith#2', 'soldier#1']);
    expect(log).toEqual(['actor.spawned:ash-wraith#1', 'actor.spawned:ash-wraith#2', 'actor.spawned:soldier#1']);
    expect(registry.size).toBe(3);
  });

  it('the spawned event carries the actor itself', () => {
    const { registry, events } = make();
    const fn = vi.fn();
    events.on('actor.spawned', fn);
    const a = registry.spawn(wraith);
    expect(fn).toHaveBeenCalledWith({ actor: a });
  });

  it('an explicit id that is taken throws (duplicate player)', () => {
    const { registry } = make();
    registry.spawn(playerInit());
    expect(() => registry.spawn(playerInit())).toThrow(/already exists/);
    expect(registry.size).toBe(1);
  });

  it('generated ids skip ids already taken explicitly', () => {
    const { registry } = make();
    registry.spawn({ ...wraith, id: 'ash-wraith#1' });
    expect(registry.spawn(wraith).id).toBe('ash-wraith#2');
  });

  it('ids are not reused after despawn', () => {
    const { registry } = make();
    const a = registry.spawn(wraith);
    registry.despawn(a.id);
    expect(registry.spawn(wraith).id).toBe('ash-wraith#2');
  });

  it('invalid init throws and registers nothing', () => {
    const { registry, log } = make();
    expect(() => registry.spawn({ ...wraith, maxHealth: 0 })).toThrow();
    expect(registry.size).toBe(0);
    expect(log).toEqual([]);
  });

  it('player getter throws before the player exists, then returns it', () => {
    const { registry } = make();
    expect(() => registry.player).toThrow(/player actor does not exist/);
    const p = registry.spawn(playerInit());
    expect(registry.player).toBe(p);
  });
});

describe('ActorRegistry despawn', () => {
  it('removes the actor and emits actor.despawned', () => {
    const { registry, log } = make();
    const a = registry.spawn(wraith);
    registry.despawn(a.id);
    expect(registry.get(a.id)).toBeUndefined();
    expect(registry.size).toBe(0);
    expect(log.at(-1)).toBe(`actor.despawned:${a.id}`);
  });

  it('unknown id is a no-op with no event', () => {
    const { registry, log } = make();
    registry.despawn('nope');
    expect(log).toEqual([]);
  });

  it('despawning twice emits once', () => {
    const { registry, log } = make();
    const a = registry.spawn(wraith);
    registry.despawn(a.id);
    registry.despawn(a.id);
    expect(log.filter((l) => l.startsWith('actor.despawned'))).toHaveLength(1);
  });

  it('unbinds every owner', () => {
    const { registry } = make();
    const o1 = {};
    const o2 = {};
    const a = registry.spawn({ ...wraith, owner: o1 });
    registry.bindOwner(a, o2);
    registry.despawn(a.id);
    expect(registry.byOwner(o1)).toBeUndefined();
    expect(registry.byOwner(o2)).toBeUndefined();
    // and the owners can be reused
    const b = registry.spawn({ ...wraith, owner: o1 });
    expect(registry.byOwner(o1)).toBe(b);
  });

  it('can despawn during actor.died dispatch; later listeners still get the payload', () => {
    const { registry, events } = make();
    const a = registry.spawn(wraith);
    const second = vi.fn();
    events.on('actor.died', (p) => registry.despawn(p.actorId));
    events.on('actor.died', second);
    const payload = { actorId: a.id, killerId: null, kind: a.kind, team: a.team, level: 1, spawnTag: undefined };
    events.emit('actor.died', payload);
    expect(second).toHaveBeenCalledWith(payload);
    expect(registry.get(a.id)).toBeUndefined();
  });
});

describe('ActorRegistry owners', () => {
  it('spawn with an owner binds it', () => {
    const { registry } = make();
    const owner = {};
    const a = registry.spawn({ ...wraith, owner });
    expect(registry.byOwner(owner)).toBe(a);
  });

  it('an actor may have several owners', () => {
    const { registry } = make();
    const avatar = {};
    const model = {};
    const a = registry.spawn({ ...wraith, owner: avatar });
    registry.bindOwner(a, model);
    expect(registry.byOwner(avatar)).toBe(a);
    expect(registry.byOwner(model)).toBe(a);
  });

  it('an owner already bound to another actor throws, at spawn and at bindOwner', () => {
    const { registry } = make();
    const owner = {};
    registry.spawn({ ...wraith, owner });
    expect(() => registry.spawn({ ...wraith, owner })).toThrow(/already bound/);
    expect(registry.size).toBe(1); // the failed spawn registered nothing
    const b = registry.spawn(wraith);
    expect(() => registry.bindOwner(b, owner)).toThrow(/already bound/);
  });

  it('binding the same owner to the same actor again is allowed', () => {
    const { registry } = make();
    const owner = {};
    const a = registry.spawn({ ...wraith, owner });
    expect(() => registry.bindOwner(a, owner)).not.toThrow();
  });

  it('rejects null and undefined owners', () => {
    const { registry } = make();
    const a = registry.spawn(wraith);
    expect(() => registry.bindOwner(a, null)).toThrow(/owner must be an object/);
    expect(() => registry.bindOwner(a, undefined)).toThrow(/owner must be an object/);
  });

  it('spawn with owner null or undefined is fine and binds nothing', () => {
    const { registry } = make();
    expect(() => registry.spawn({ ...wraith, owner: null })).not.toThrow();
    expect(registry.byOwner(null)).toBeUndefined();
  });

  it('rejects binding to an unregistered (despawned) actor', () => {
    const { registry } = make();
    const a = registry.spawn(wraith);
    registry.despawn(a.id);
    expect(() => registry.bindOwner(a, {})).toThrow(/not registered/);
  });

  it('the returned unbind removes only that owner, and is safe twice', () => {
    const { registry } = make();
    const o1 = {};
    const o2 = {};
    const a = registry.spawn({ ...wraith, owner: o1 });
    const off = registry.bindOwner(a, o2);
    off();
    off();
    expect(registry.byOwner(o2)).toBeUndefined();
    expect(registry.byOwner(o1)).toBe(a);
  });

  it('a stale unbind does not remove an owner re-bound to another actor', () => {
    const { registry } = make();
    const o = {};
    const a = registry.spawn(wraith);
    const off = registry.bindOwner(a, o);
    off();
    const b = registry.spawn(wraith);
    registry.bindOwner(b, o);
    off();
    expect(registry.byOwner(o)).toBe(b);
  });

  it('byOwner of an unknown object is undefined', () => {
    expect(make().registry.byOwner({})).toBeUndefined();
  });
});

describe('ActorRegistry queries', () => {
  it('get, all and ofTeam', () => {
    const { registry } = make();
    const w = registry.spawn(wraith);
    const p = registry.spawn(playerInit());
    expect(registry.get('player')).toBe(p);
    expect([...registry.all()]).toEqual([w, p]);
    expect(registry.ofTeam('hostile')).toEqual([w]);
    expect(registry.ofTeam('ally')).toEqual([]);
  });

  describe('nearest', () => {
    it('finds the closest rooted actor', () => {
      const { registry } = make();
      registry.spawn({ ...wraith, root: rooted(10) });
      const near = registry.spawn({ ...wraith, root: rooted(3) });
      expect(registry.nearest({ x: 0, y: 0, z: 0 })).toBe(near);
    });

    it('uses 3D distance', () => {
      const { registry } = make();
      const a = registry.spawn({ ...wraith, root: rooted(0, 5, 0) });
      registry.spawn({ ...wraith, root: rooted(4, 0, 0) });
      expect(registry.nearest({ x: 0, y: 4, z: 0 })).toBe(a);
    });

    it('ignores actors without a root', () => {
      const { registry } = make();
      registry.spawn(wraith);
      expect(registry.nearest({ x: 0, y: 0, z: 0 })).toBeUndefined();
    });

    it('filters by team, exclude, maxDistance and alive', () => {
      const { registry } = make();
      const h = registry.spawn({ ...wraith, root: rooted(1) });
      const n = registry.spawn({ ...wraith, team: 'neutral', root: rooted(2) });
      const origin = { x: 0, y: 0, z: 0 };
      expect(registry.nearest(origin, { team: 'neutral' })).toBe(n);
      expect(registry.nearest(origin, { exclude: h.id })).toBe(n);
      expect(registry.nearest(origin, { maxDistance: 0.5 })).toBeUndefined();
      expect(registry.nearest(origin, { maxDistance: 1 })).toBe(h); // inclusive
      h._dead = true;
      expect(registry.nearest(origin)).toBe(n);
      expect(registry.nearest(origin, { alive: false })).toBe(h);
    });

    it('targetable skips untargetable actors (companions); untargetable defaults to false', () => {
      const { registry } = make();
      const tobb = registry.spawn({ kind: 'npc:tobb', team: 'ally', maxHealth: 50, hittable: false, untargetable: true, root: rooted(1) });
      const h = registry.spawn({ ...wraith, root: rooted(2) });
      const origin = { x: 0, y: 0, z: 0 };
      expect(h.untargetable).toBe(false);
      expect(tobb.untargetable).toBe(true);
      expect(registry.nearest(origin)).toBe(tobb);
      expect(registry.nearest(origin, { targetable: true })).toBe(h);
      expect(registry.nearest(origin, { targetable: true, team: 'ally' })).toBeUndefined();
    });

    it('breaks distance ties by lowest id, independent of spawn order', () => {
      const { registry } = make();
      const b = registry.spawn({ ...wraith, id: 'b', root: rooted(2) });
      const a = registry.spawn({ ...wraith, id: 'a', root: rooted(-2) });
      expect(registry.nearest({ x: 0, y: 0, z: 0 })).toBe(a);
      expect(b.id).toBe('b');
    });

    it('returns undefined when empty', () => {
      expect(make().registry.nearest({ x: 0, y: 0, z: 0 })).toBeUndefined();
    });
  });
});
