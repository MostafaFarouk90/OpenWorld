import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { createRegionPlugin, BARLEY_FLAG, BRIGHTWATER_DISCOVERED_FLAG, discoveredFlag } from './region.plugin';
import { TOLL_POST_BROKEN_FLAG } from './tollPost';
import type { RegionService } from './serviceTypes';
import { createFakeCore } from './testing/fakeCore';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

function setup() {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  // The core Door toggles its collider; the fake core's bare colliders have no setEnabled.
  const add = fc.ctx.physics.addStaticCollider.bind(fc.ctx.physics);
  fc.ctx.physics.addStaticCollider = (desc) => Object.assign(add(desc), { setEnabled() {} });
  const plugin = createRegionPlugin();
  return { fc, plugin };
}

describe('region plugin', () => {
  it('defines every anchor and trigger of the layout and builds the village', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(BRIGHTWATER_LAYOUT.anchors.length + DEADROAD_LAYOUT.anchors.length);
    // The slice fog wall stands, so its trigger exists too.
    expect(fc.triggers.size).toBe(BRIGHTWATER_LAYOUT.triggers.length + 1);
    expect(fc.triggers.has('trg.fog.harrowmark')).toBe(true);
    expect(fc.anchors.get('waystone.north')!.position.y).toBe(heightAt(10, 310));
    expect(fc.interactables.has('door:chapel')).toBe(true);
    expect(fc.interactables.has('door:bakery')).toBe(true);
    expect(fc.interactables.has('chest:bakery-barrel')).toBe(true);
    expect(fc.interactables.has('pickup:hearth-stone')).toBe(true);
    expect(fc.interactables.has('use:notice-board')).toBe(true);
    for (const id of ['use:poi-chapel-ledge', 'use:poi-reed-island', 'use:shard-study']) expect(fc.interactables.has(id), id).toBe(true);
    expect([...fc.interactables.keys()].filter((id) => id.startsWith('waystone'))).toEqual([]);
    expect([...fc.actors.values()].filter((a) => a.kind === 'scarecrow')).toHaveLength(1);
    expect(fc.colliders.size).toBeGreaterThan(20);
    plugin.dispose?.();
  });

  it('registers no waystone interactable, flag or event (thread 6 owns them), so a rival plugin coexists', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    expect(() => fc.ctx.interaction.register({ id: 'waystone:chapel', kind: 'waystone', position: (o: THREE.Vector3) => o, onInteract() {} })).not.toThrow();
    expect([...fc.flags.keys()].filter((k) => k.startsWith('waystone.'))).toEqual([]);
    expect(fc.emitted.filter((e) => e.type.startsWith('waystone.'))).toEqual([]);
    plugin.dispose?.();
  });

  it('exposes waystone meshes through the region service, only for waystone anchors', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const region = fc.services.get('region') as RegionService;
    expect(region.waystoneObject('waystone.chapel')).toBeInstanceOf(THREE.Object3D);
    expect(region.waystoneObject('waystone.north')).toBeInstanceOf(THREE.Object3D);
    expect(region.waystoneObject('yard.centre')).toBeUndefined();
    expect(region.waystoneObject('waystone.missing')).toBeUndefined();
    expect(region.at(0, 0)?.id).toBe('brightwater');
    // v0.6: (20000, 0) is Cinderreach; the unnamed country east of Harrowmark is still null.
    expect(region.at(20_000, 0)?.id).toBe('cinderreach');
    expect(region.at(13_000, -1_500)).toBeNull();
    plugin.dispose?.();
  });

  it('emits region.entered and discover once, and discover only once per save', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    fc.tick('intent');
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'region.entered')).toEqual([{ type: 'region.entered', payload: { regionId: 'brightwater', previous: null } }]);
    expect(fc.emitted.filter((e) => e.type === 'discover')).toEqual([{ type: 'discover', payload: { placeId: 'brightwater', kind: 'region' } }]);
    expect(fc.flags.get(BRIGHTWATER_DISCOVERED_FLAG)).toBe(true);
    // Leave the region and come back: entered again, discover not repeated.
    fc.playerFeet.x = 50_000;
    fc.tick('intent');
    fc.playerFeet.x = 0;
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'region.entered')).toHaveLength(2);
    expect(fc.emitted.filter((e) => e.type === 'discover')).toHaveLength(1);
    plugin.dispose?.();
  });

  it('walking the road: the corridor emits nothing, Harrowmark is entered with previous null, and discover fires once per region', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const entered = () => fc.emitted.filter((e) => e.type === 'region.entered').map((e) => (e as { payload: unknown }).payload);
    const step = (x: number, z: number) => {
      fc.playerFeet.x = x;
      fc.playerFeet.z = z;
      fc.tick('intent');
    };
    step(2000, 100);
    step(6000, 800); // the null corridor (engine x 5500..6500)
    expect(entered()).toEqual([{ regionId: 'brightwater', previous: null }]);
    step(6800, 780);
    expect(entered()).toEqual([{ regionId: 'brightwater', previous: null }, { regionId: 'harrowmark', previous: null }]);
    expect(fc.flags.get(discoveredFlag('harrowmark'))).toBe(true);
    step(6000, 800); // back into the corridor: still nothing new
    expect(entered()).toHaveLength(2);
    step(2000, 100); // and out the other side: Brightwater again, previous null, no second discover
    expect(entered()).toHaveLength(3);
    expect(entered()[2]).toEqual({ regionId: 'brightwater', previous: null });
    step(6800, 780);
    expect(fc.emitted.filter((e) => e.type === 'discover').map((e) => (e as { payload: unknown }).payload)).toEqual([
      { placeId: 'brightwater', kind: 'region' },
      { placeId: 'harrowmark', kind: 'region' },
    ]);
    plugin.dispose?.();
  });

  it('does not rediscover when the save already has the flag', () => {
    const { fc, plugin } = setup();
    fc.flags.set(BRIGHTWATER_DISCOVERED_FLAG, true);
    plugin.setup(fc.ctx);
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'discover')).toEqual([]);
    expect(fc.emitted.filter((e) => e.type === 'region.entered')).toHaveLength(1);
    plugin.dispose?.();
  });

  it('still discovers when save.loaded arrives late, once per save', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    fc.playerFeet.x = 50_000; // outside the region while the save is still loading
    fc.tick('intent');
    // A save without the flag finishes loading; entering the region now discovers it.
    fc.fire('save.loaded');
    fc.playerFeet.x = 0;
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'discover')).toHaveLength(1);
    expect(fc.flags.get(BRIGHTWATER_DISCOVERED_FLAG)).toBe(true);
    // Another save loads late, also without the flag: the next entry discovers again, but only once.
    fc.flags.delete(BRIGHTWATER_DISCOVERED_FLAG);
    fc.fire('save.loaded');
    fc.playerFeet.x = 50_000;
    fc.tick('intent');
    fc.playerFeet.x = 0;
    fc.tick('intent');
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'discover')).toHaveLength(2);
    // A save that carries the flag never discovers.
    fc.fire('save.loaded');
    fc.playerFeet.x = 50_000;
    fc.tick('intent');
    fc.playerFeet.x = 0;
    fc.tick('intent');
    expect(fc.emitted.filter((e) => e.type === 'discover')).toHaveLength(2);
    plugin.dispose?.();
  });

  it('feeds the dummies service the two yard anchors when it exists, and works without it', () => {
    const a = setup();
    a.plugin.setup(a.fc.ctx);
    a.plugin.dispose?.();
    const b = setup();
    const place = vi.fn();
    b.fc.services.set('dummies', { place });
    b.plugin.setup(b.fc.ctx);
    expect(place).toHaveBeenCalledTimes(1);
    const spots = place.mock.calls[0][0];
    expect(spots).toHaveLength(2);
    expect(spots[0].feet).toMatchObject({ x: -40, z: 117 });
    expect(spots[1].feet).toMatchObject({ x: -50, z: 117 });
    b.plugin.dispose?.();
  });

  it('dispose removes every mesh, collider, actor, interactable, trigger and service', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    plugin.dispose?.();
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.interactables.size).toBe(0);
    expect(fc.services.has('region')).toBe(false);
    expect([...fc.systems.keys()]).toEqual([]);
    expect([...fc.actors.values()].filter((a) => a.kind === 'scarecrow')).toHaveLength(0);
    plugin.dispose?.(); // idempotent
  });

  it('a layout error fails setup loudly and leaves nothing behind', () => {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    const bad = structuredClone(BRIGHTWATER_LAYOUT);
    bad.anchors.push({ ...bad.anchors[0] });
    const plugin = createRegionPlugin({ layout: bad });
    expect(() => plugin.setup(fc.ctx)).toThrow(/duplicate anchor id/);
    expect(fc.anchors.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('a throw halfway through setup tears down what was built (no leaked meshes or colliders)', () => {
    const { fc, plugin } = setup();
    fc.ctx.services.provide('region', {} as RegionService); // the plugin's service registration will throw as a duplicate
    expect(() => plugin.setup(fc.ctx)).toThrow(/duplicate service/);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.interactables.size).toBe(0);
    expect([...fc.actors.values()]).toHaveLength(0);
    expect(fc.triggers.size).toBe(0);
  });

  it('stands the scarecrow up again when a save from before the topple loads', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const count = () => [...fc.actors.values()].filter((a) => a.kind === 'scarecrow').length;
    expect(count()).toBe(1);
    fc.flags.set('place.scarecrow.toppled', true);
    fc.fire('save.loaded');
    expect(count()).toBe(0);
    fc.flags.set('place.scarecrow.toppled', false);
    fc.fire('save.loaded');
    expect(count()).toBe(1);
    fc.fire('save.loaded');
    expect(count()).toBe(1);
    plugin.dispose?.();
    expect(count()).toBe(0);
  });
});

describe('region plugin, beyond Kettlewick', () => {
  it('builds the corridor scenery and the POI props, and removes them on dispose', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    expect(fc.scene.children.map((c) => c.name)).toEqual(expect.arrayContaining(['corridor-scenery', 'poi-props', 'fog-wall']));
    plugin.dispose?.();
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.modifiers.size).toBe(0);
    expect([...fc.actors.values()].filter((a) => a.kind === 'toll-post')).toHaveLength(0);
  });

  it('does not spawn the toll-post actor (the enemies module does), and flags it broken when it dies', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    expect([...fc.actors.values()].filter((a) => a.kind === 'toll-post')).toHaveLength(0);
    fc.fire('actor.died', { actorId: 'x', kind: 'toll-post', spawnTag: 'other' });
    fc.fire('actor.died', { actorId: 'y', kind: 'scarecrow', spawnTag: 'ford.toll-post' });
    expect(fc.flags.get(TOLL_POST_BROKEN_FLAG)).toBeUndefined();
    fc.fire('actor.died', { actorId: 'z', kind: 'toll-post', spawnTag: 'ford.toll-post' });
    expect(fc.flags.get(TOLL_POST_BROKEN_FLAG)).toBe(true);
    plugin.dispose?.();
  });

  it('raises the fog wall until M05 is complete, lowers it for a save that has finished M05', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    expect(fc.triggers.has('trg.fog.harrowmark')).toBe(true);
    expect(fc.triggers.has('trg.fog.harrowmark')).toBe(true);
    fc.ctx.state.setFlag('story.m05.complete', true);
    expect(fc.triggers.has('trg.fog.harrowmark')).toBe(false);
    plugin.dispose?.();
    const loaded = setup();
    loaded.fc.flags.set('story.m05.complete', true);
    loaded.plugin.setup(loaded.fc.ctx);
    expect(loaded.fc.triggers.has('trg.fog.harrowmark')).toBe(false);
    loaded.plugin.dispose?.();
  });

  it('rebuilds Wynn\'s barley when R01 sets the flag, and builds it scorched on a load that has it', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const count = () => (fc.scene.getObjectByName('barley')!.getObjectByName('barley-instances') as THREE.InstancedMesh).count;
    const full = count();
    fc.ctx.state.setFlag(BARLEY_FLAG, 'scorched');
    expect(count()).toBeLessThan(full);
    fc.ctx.state.setFlag(BARLEY_FLAG, 'saved');
    expect(count()).toBe(full);
    plugin.dispose?.();
    expect(fc.scene.children).toHaveLength(0);

    const again = setup();
    again.fc.flags.set(BARLEY_FLAG, 'scorched');
    again.plugin.setup(again.fc.ctx);
    expect((again.fc.scene.getObjectByName('barley')!.getObjectByName('barley-instances') as THREE.InstancedMesh).count).toBeLessThan(full);
    again.plugin.dispose?.();
  });

  it('keys discover by region: place.<regionId>.discovered, with Brightwater\'s key unchanged for old saves', () => {
    expect(discoveredFlag('harrowmark')).toBe('place.harrowmark.discovered');
    expect(discoveredFlag('brightwater')).toBe(BRIGHTWATER_DISCOVERED_FLAG);
    expect(BRIGHTWATER_DISCOVERED_FLAG).toBe('place.brightwater.discovered');
  });
});

