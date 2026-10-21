import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import { mercyInteractableId } from '../mercy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef, SpawnOptions } from '../types';
import { WYRM_HUB } from './overlays';
import type { WyrmlingHandle } from './skittish';
import { WyrmTethers } from './tethers';
import { WYRMLING } from './tuning';
import type { WyrmBody } from './WyrmBody';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
afterEach(() => {
  for (const k of Object.keys(WYRM_HUB)) delete (WYRM_HUB as Record<string, unknown>)[k];
});

const CAGE: SpawnerDef = { id: 'cage', enemy: 'wyrmling', count: 1, anchor: 'a', band: { min: 10, max: 10 }, activation: 'manual', respawn: 'never', leash: false };

function rig(opts: { playerX?: number; playerZ?: number; seed?: number; indoors?: boolean; items?: Record<string, number> } = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: opts.playerX ?? 0, y: 0, z: opts.playerZ ?? -8 } });
  fake.defineAnchor('a', 0, 0);
  fake.defineAnchor('post', 0, 0);
  fake.defineAnchor('door', 10, 0);
  fake.flags.set('enemies.mercy.calm', true);
  fake.provideItems(opts.items ?? {});
  if (opts.indoors) fake.interiors = { current: 'test-nursery' };
  const tethers = new WyrmTethers({ anchor: (id) => fake.anchorMap.get(id)?.position, flag: (k) => Boolean(fake.flags.get(k)), warn: (m) => fake.warnings.push(m) });
  const handles = new Map<string, WyrmlingHandle>();
  const sounds: string[] = [];
  Object.assign(WYRM_HUB, {
    chainFor: (s: string | null, slot: number | null) => tethers.chainFor(s, slot),
    exitFor: (s: string | null) => tethers.exitFor(s),
    track: (id: string, h: WyrmlingHandle) => {
      handles.set(id, h);
      return () => handles.delete(id);
    },
    sfx: (key: string) => sounds.push(key),
  });
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [CAGE], seed: opts.seed ?? 5 });
  const tick = (seconds = DT, each?: () => boolean | void) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      if (each?.()) return true;
    }
    return false;
  };
  const spawn = (o: SpawnOptions = {}) => {
    const [id] = m.service.spawnGroup('cage', o);
    const enemy = m.get(id!)!;
    return { id: id!, enemy, body: enemy.body as unknown as WyrmBody };
  };
  const dist = (id: string) => {
    const e = m.get(id)!;
    return Math.hypot(e.feet.x - fake.playerFeet.x, e.feet.z - fake.playerFeet.z);
  };
  const swing = () => fake.bus.emit('attack.window', { actorId: 'player', phase: 'open', attackId: 'test', swingId: 0 });
  const hold = (id: string) => fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
  return { fake, m, tick, spawn, dist, swing, hold, tethers, handles, sounds };
}

const ATTACKING = ['telegraph', 'attack'];

describe('Wyrmling: skittish', () => {
  it('unstruck it keeps 3 to 5 m from a player who walks at it, and never attacks', () => {
    const t = rig({ playerZ: -6 });
    const { id, enemy } = t.spawn({ aggro: true });
    t.tick(1);
    let attacked = false;
    // The player walks straight at it for 6 s, 1.2 m behind wherever it stands.
    t.tick(6, () => {
      const e = t.m.get(id)!;
      const dx = t.fake.playerFeet.x - e.feet.x;
      const dz = t.fake.playerFeet.z - e.feet.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 1.2) t.fake.movePlayer(t.fake.playerFeet.x - (dx / d) * 4 * DT, t.fake.playerFeet.z - (dz / d) * 4 * DT);
      if (ATTACKING.includes(enemy.state)) attacked = true;
    });
    expect(attacked).toBe(false);
    expect(t.fake.player.health).toBe(t.fake.player.maxHealth);
    // Left alone it settles back inside its band.
    t.tick(3);
    expect(t.dist(id)).toBeGreaterThanOrEqual(WYRMLING.keepAway[0] - 0.4);
    expect(t.dist(id)).toBeLessThanOrEqual(WYRMLING.keepAway[1] + 0.6);
  });

  it('bread held and no swing for 2 s: it lets the player within 1.5 m and lowers its head; a swing sends it off again', () => {
    const t = rig({ playerZ: -2, items: { 'hearth-bread': 1 } });
    const { id, enemy, body } = t.spawn({ aggro: true });
    t.tick(0.2);
    // A swing just now: the bread does not count yet, so it backs off.
    t.swing();
    t.tick(1);
    expect(t.dist(id)).toBeGreaterThan(2.5);
    // Two quiet seconds: the player walks up to 1.3 m and it holds still.
    t.tick(1.2);
    const e = t.m.get(id)!;
    const dx = t.fake.playerFeet.x - e.feet.x;
    const dz = t.fake.playerFeet.z - e.feet.z;
    const d = Math.hypot(dx, dz);
    t.fake.movePlayer(e.feet.x + (dx / d) * 1.3, e.feet.z + (dz / d) * 1.3);
    t.tick(0.5);
    expect(t.dist(id)).toBeLessThanOrEqual(WYRMLING.breadApproach + 0.05);
    expect(body.currentClip).toBe('HeadLower');
    expect(ATTACKING).not.toContain(enemy.state);
    // The Calm hold is offered with the bread.
    expect(t.hold(id).enabled!()).toBe(true);
    t.swing();
    t.tick(1);
    expect(t.dist(id)).toBeGreaterThan(1.5);
  });

  it('struck, it fights back', () => {
    const t = rig({ playerZ: -2 });
    const { id, enemy } = t.spawn({ aggro: true });
    t.tick(0.5);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1, kind: 'melee', bone: 'torso' });
    expect(t.tick(6, () => ATTACKING.includes(enemy.state))).toBe(true);
  });

  it('chained: it never leaves its circle, and pinned against the chain\'s end it is cornered and bites', () => {
    const t = rig({ playerZ: 1.5 });
    t.tethers.tether('cage', [{ anchor: 'post' }], { length: 2.5 });
    const { id, enemy, body } = t.spawn({ aggro: true });
    let maxR = 0;
    let attacked = false;
    t.tick(6, () => {
      const e = t.m.get(id)!;
      maxR = Math.max(maxR, Math.hypot(e.feet.x, e.feet.z));
      if (ATTACKING.includes(enemy.state)) attacked = true;
    });
    expect(maxR).toBeLessThan(2.5 + 0.15);
    expect(body.rig.chainMesh.visible).toBe(true);
    // The player stands between it and its post, 1 m out: its escape is the chain's end, so it turns on the player.
    t.tick(6, () => {
      const e = t.m.get(id)!;
      const r = Math.hypot(e.feet.x, e.feet.z) || 1;
      t.fake.movePlayer(e.feet.x / r, e.feet.z / r);
      maxR = Math.max(maxR, r);
      if (ATTACKING.includes(enemy.state)) attacked = true;
    });
    expect(maxR).toBeLessThan(2.5 + 0.15);
    expect(attacked).toBe(true);
  });

  it('calmed on its chain it rests in place and coos; unchained it flies off and the slot is spent', () => {
    const t = rig({ playerZ: -1.8, items: { 'hearth-bread': 1 } });
    t.tethers.tether('cage', [{ anchor: 'post' }]);
    const { id, enemy } = t.spawn();
    t.tick(2.5);
    t.hold(id).onInteract(t.fake.player);
    expect(enemy.state).toBe('calmed');
    expect(t.fake.bus.of('mercy')).toEqual([expect.objectContaining({ verb: 'calm', creature: 'wyrmling', track: 'dragons' })]);
    const before = { x: enemy.feet.x, z: enemy.feet.z };
    t.tick(10);
    expect(t.m.get(id)).toBeDefined();
    expect(Math.hypot(enemy.feet.x - before.x, enemy.feet.z - before.z)).toBeLessThan(0.3);
    expect(t.sounds.filter((s) => s === 'coo').length).toBeGreaterThanOrEqual(2);
    // The chain goes (a script, or A13's flag): it flies up and away and is gone by 40 m.
    t.tethers.free('cage', 0);
    let maxAlt = 0;
    t.tick(15, () => {
      const b = t.m.get(id)?.body as unknown as WyrmBody | undefined;
      if (b) maxAlt = Math.max(maxAlt, b.altitude);
      return !t.m.get(id);
    });
    expect(t.m.get(id)).toBeUndefined();
    expect(maxAlt).toBeGreaterThan(5);
    expect(t.m.spawners.serialize().spent).toEqual(['cage#0']);
    expect(t.m.service.mercyTally()['wyrmling']).toMatchObject({ calm: 1, killed: 0 });
  });

  it('a flag-gated chain: chained while the flag is off, free once it is on', () => {
    const t = rig();
    t.tethers.tether('cage', [{ anchor: 'post', until: { all: ['story.m20.chain.1'] } }]);
    expect(t.tethers.chainFor('cage', 0)).not.toBeNull();
    t.fake.setFlag('story.m20.chain.1', true);
    expect(t.tethers.chainFor('cage', 0)).toBeNull();
  });

  it('flyAway (the script handle): it leaves without a mercy, no credit, and the slot is spent', () => {
    const t = rig({ playerZ: -4 });
    const { id } = t.spawn({ aggro: true });
    t.tick(0.5);
    expect(t.handles.get(id)).toBeDefined();
    t.handles.get(id)!.flyAway();
    t.tick(15, () => !t.m.get(id));
    expect(t.m.get(id)).toBeUndefined();
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.m.spawners.serialize().spent).toEqual(['cage#0']);
    expect(t.handles.size).toBe(0);
  });

  it('a load during the fly-off (a save that never saw it): the flier goes and the slot is refilled, not spent', () => {
    const t = rig({ playerZ: -4 });
    const { id } = t.spawn({ aggro: true });
    t.tick(0.5);
    expect(t.handles.get(id)!.flyAway()).toBe(true);
    // Already leaving: a second call does nothing.
    expect(t.handles.get(id)!.flyAway()).toBe(false);
    t.tick(1);
    t.fake.loadFlags({});
    expect(t.m.get(id)).toBeUndefined();
    const live = t.m.service.alive('cage');
    expect(live).toHaveLength(1);
    expect(live[0]).not.toBe(id);
    expect(t.m.spawners.serialize().spent).toEqual([]);
  });

  it('flyAway on a calmed wyrmling is refused', () => {
    const t = rig({ playerZ: -1.8, items: { 'hearth-bread': 1 } });
    const { id } = t.spawn();
    t.tick(2.5);
    t.hold(id).onInteract(t.fake.player);
    expect(t.handles.get(id)!.flyAway()).toBe(false);
  });

  it('indoors a freed wyrmling hops and walks to the exit door, then fades', () => {
    const t = rig({ playerZ: -4, indoors: true });
    const remove = t.tethers.tether('cage', [], { exitAnchor: 'door' });
    const { id } = t.spawn({ aggro: true });
    t.tick(0.5);
    t.handles.get(id)!.flyAway();
    let maxAlt = 0;
    let lastX = 0;
    t.tick(15, () => {
      const e = t.m.get(id);
      if (!e) return true;
      maxAlt = Math.max(maxAlt, (e.body as unknown as WyrmBody).altitude);
      lastX = e.feet.x;
    });
    expect(t.m.get(id)).toBeUndefined();
    expect(maxAlt).toBeLessThan(1);
    expect(lastX).toBeGreaterThan(8.5);
    remove();
  });
});

describe('WyrmTethers', () => {
  const ports = (anchors: Record<string, { x: number; y: number; z: number }>, flags: Record<string, boolean> = {}) => {
    const warnings: string[] = [];
    return { warnings, ports: { anchor: (id: string) => anchors[id], flag: (k: string) => flags[k] ?? false, warn: (m: string) => warnings.push(m) } };
  };

  it('chains per slot; a missing post or anchor is no chain; free is saved and survives a load', () => {
    const { ports: p } = ports({ p0: { x: 1, y: 0, z: 2 } });
    const a = new WyrmTethers(p);
    a.tether('g', [{ anchor: 'p0' }, { anchor: 'gone' }], { length: 3 });
    expect(a.chainFor('g', 0)).toMatchObject({ post: { x: 1, z: 2 }, length: 3 });
    expect(a.chainFor('g', 1)).toBeNull();
    expect(a.chainFor('g', 2)).toBeNull();
    expect(a.chainFor(null, 0)).toBeNull();
    a.free('g', 0);
    expect(a.chainFor('g', 0)).toBeNull();
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    expect(saved).toEqual({ freed: ['g#0'] });
    const b = new WyrmTethers(p);
    b.tether('g', [{ anchor: 'p0' }]);
    b.load(saved);
    expect(b.isFreed('g', 0)).toBe(true);
    expect(b.chainFor('g', 0)).toBeNull();
  });

  it('a bad length warns and chains nothing; bad save data loads empty; the remover only removes its own', () => {
    const { ports: p, warnings } = ports({ p0: { x: 0, y: 0, z: 0 } });
    const a = new WyrmTethers(p);
    a.tether('g', [{ anchor: 'p0' }], { length: -1 });
    expect(warnings).toHaveLength(1);
    expect(a.chainFor('g', 0)).toBeNull();
    a.load({ freed: ['g#0', 3, 'nohash', null] });
    expect(a.serialize()).toEqual({ freed: ['g#0'] });
    a.load('junk');
    expect(a.serialize()).toEqual({ freed: [] });
    const r1 = a.tether('g', [{ anchor: 'p0' }]);
    a.tether('g', [{ anchor: 'p0' }], { length: 4 });
    r1();
    expect(a.chainFor('g', 0)?.length).toBe(4);
  });
});
