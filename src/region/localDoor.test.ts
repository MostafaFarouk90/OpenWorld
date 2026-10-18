import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFakeCore } from './testing/fakeCore';
import { createLocalChest, createLocalDoor } from './localDoor';

const player = {} as never;

function makeDoor(fc = createFakeCore(), locked?: () => boolean, name = 'chapel') {
  const pivot = new THREE.Group();
  fc.scene.add(pivot);
  const collider = fc.ctx.physics.addStaticCollider({ tag: name } as never);
  const door = createLocalDoor(fc.ctx, { id: `door:${name}`, pivot, openAngle: Math.PI / 2, seconds: 0.6, collider, locked });
  return { fc, pivot, collider, door, i: () => fc.interactables.get(`door:${name}`)! };
}

describe('createLocalDoor', () => {
  it('registers a door interactable with the unlocked prompt', () => {
    const { i } = makeDoor();
    expect(i().kind).toBe('door');
    expect(i().promptKey).toBe('interact.door');
  });

  it('opens over about 0.6 s, drops the collider and persists the flag', () => {
    const { fc, pivot, collider, i } = makeDoor();
    i().onInteract(player);
    expect(fc.flags.get('door.chapel.open')).toBe(true);
    expect(fc.colliders.has(collider)).toBe(false);
    for (let n = 0; n < 18; n++) fc.tick('rules', 1 / 60);
    expect(pivot.rotation.y).toBeGreaterThan(0);
    expect(pivot.rotation.y).toBeLessThan(Math.PI / 2);
    for (let n = 0; n < 30; n++) fc.tick('rules', 1 / 60);
    expect(pivot.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('closes again, re-adding a collider only once fully shut', () => {
    const { fc, pivot, i } = makeDoor();
    i().onInteract(player);
    for (let n = 0; n < 60; n++) fc.tick('rules');
    i().onInteract(player);
    expect(fc.flags.get('door.chapel.open')).toBe(false);
    expect(fc.colliders.size).toBe(0);
    for (let n = 0; n < 60; n++) fc.tick('rules');
    expect(pivot.rotation.y).toBe(0);
    expect(fc.colliders.size).toBe(1);
  });

  it('does nothing while locked, and the prompt says so', () => {
    let locked = true;
    const { fc, pivot, collider, i } = makeDoor(createFakeCore(), () => locked);
    expect(i().promptKey).toBe('interact.locked');
    i().onInteract(player);
    fc.tick('rules');
    expect(fc.flags.has('door.chapel.open')).toBe(false);
    expect(pivot.rotation.y).toBe(0);
    expect(fc.colliders.has(collider)).toBe(true);
    locked = false;
    expect(i().promptKey).toBe('interact.door');
    i().onInteract(player);
    expect(fc.flags.get('door.chapel.open')).toBe(true);
  });

  it('a duplicate door name throws through the registry', () => {
    const fc = createFakeCore();
    makeDoor(fc);
    expect(() => makeDoor(fc)).toThrow(/duplicate interactable/);
  });

  it('round trip: after dispose and rebuild, save.loaded snaps it open without animating', () => {
    const fc = createFakeCore();
    const first = makeDoor(fc);
    first.i().onInteract(player);
    first.door.dispose();
    expect(fc.interactables.size).toBe(0);
    expect(fc.systems.size).toBe(0);
    // rebuild: flag says open already, so the new door starts open
    const second = makeDoor(fc);
    fc.flags.set('door.chapel.open', false);
    fc.fire('save.loaded');
    expect(second.pivot.rotation.y).toBe(0);
    fc.flags.set('door.chapel.open', true);
    fc.fire('save.loaded');
    expect(second.pivot.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(fc.colliders.has(second.collider)).toBe(false);
  });

  it('snaps open on save.loaded for a door built closed', () => {
    const fc = createFakeCore();
    const d = makeDoor(fc);
    fc.flags.set('door.chapel.open', true);
    fc.fire('save.loaded');
    expect(d.pivot.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(fc.colliders.has(d.collider)).toBe(false);
    fc.flags.set('door.chapel.open', false);
    fc.fire('save.loaded');
    expect(d.pivot.rotation.y).toBe(0);
    expect(fc.colliders.size).toBe(1);
  });

  it('starts open with no collider when the flag is already set', () => {
    const fc = createFakeCore();
    fc.flags.set('door.chapel.open', true);
    const d = makeDoor(fc);
    expect(d.pivot.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(fc.colliders.has(d.collider)).toBe(false);
  });

  it('dispose is idempotent, unsubscribes everything and ignores later events', () => {
    const fc = createFakeCore();
    const d = makeDoor(fc);
    d.door.dispose();
    d.door.dispose();
    expect(fc.interactables.size + fc.systems.size).toBe(0);
    fc.flags.set('door.chapel.open', true);
    fc.fire('save.loaded');
    expect(d.pivot.rotation.y).toBe(0);
  });

  it('uses setEnabled when the collider supports it', () => {
    const fc = createFakeCore();
    const calls: boolean[] = [];
    const collider = { setEnabled: (b: boolean) => calls.push(b) };
    const pivot = new THREE.Group();
    createLocalDoor(fc.ctx, { id: 'door:x', pivot, openAngle: 1, seconds: 0.1, collider });
    fc.interactables.get('door:x')!.onInteract(player);
    for (let n = 0; n < 10; n++) fc.tick('rules');
    fc.interactables.get('door:x')!.onInteract(player);
    for (let n = 0; n < 10; n++) fc.tick('rules');
    expect(calls).toEqual([false, true]);
  });
});

describe('createLocalChest', () => {
  const loot = [{ itemId: 'healing-flask', count: 1 }];
  function chest(fc = createFakeCore()) {
    const object = new THREE.Group();
    const lid = new THREE.Object3D();
    lid.name = 'lid';
    object.add(lid);
    const c = createLocalChest(fc.ctx, { id: 'chest:bakery-barrel', object, loot });
    return { fc, object, lid, c, i: () => fc.interactables.get('chest:bakery-barrel')! };
  }

  it('opens once, grants loot once and disables itself', () => {
    const { fc, lid, i } = chest();
    expect(i().kind).toBe('chest');
    i().onInteract(player);
    i().onInteract(player);
    const granted = fc.emitted.filter((e) => e.type === 'loot.granted');
    expect(granted).toHaveLength(1);
    expect(granted[0].payload).toEqual({ sourceId: 'chest:bakery-barrel', items: loot });
    expect(fc.flags.get('chest.bakery-barrel.opened')).toBe(true);
    expect(i().enabled!()).toBe(false);
    expect(lid.rotation.x).not.toBe(0);
  });

  it('a chest opened in the save is open and empty after save.loaded', () => {
    const { fc, i } = chest();
    fc.flags.set('chest.bakery-barrel.opened', true);
    fc.fire('save.loaded');
    expect(i().enabled!()).toBe(false);
    i().onInteract(player);
    expect(fc.emitted.filter((e) => e.type === 'loot.granted')).toHaveLength(0);
  });

  it('a chest closed in the save is re-armed on save.loaded', () => {
    const { fc, i } = chest();
    i().onInteract(player);
    fc.flags.set('chest.bakery-barrel.opened', false);
    fc.fire('save.loaded');
    expect(i().enabled!()).toBe(true);
  });

  it('starts open when the flag is already set; duplicate id throws; dispose is idempotent', () => {
    const fc = createFakeCore();
    fc.flags.set('chest.bakery-barrel.opened', true);
    const a = chest(fc);
    expect(a.i().enabled!()).toBe(false);
    expect(() => chest(fc)).toThrow(/duplicate interactable/);
    a.c.dispose();
    a.c.dispose();
    expect(fc.interactables.size).toBe(0);
  });
});
