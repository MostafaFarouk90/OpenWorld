import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { BuildingLookup } from './buildingLookup';
import { coreFactories, buildStructures, type StructureDeps } from './StructureBuilder';
import { createFakeCore } from './testing/fakeCore';
import type { StructureSpec } from './layoutTypes';
import type { AssetId } from '../assets/AssetManifest';
import * as THREE from 'three';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

const flat = (): number => 3;

function makeDeps(fc = createFakeCore(), physicsOverride?: StructureDeps['physics']): StructureDeps {
  return {
    ...fc.ctx,
    ...(physicsOverride ? { physics: physicsOverride } : {}),
    rapier: physics.rapier,
    ...coreFactories(fc.ctx),
  };
}

const solid = (id: string, over: Partial<StructureSpec> = {}): StructureSpec => ({
  id,
  kind: 'house',
  x: 10,
  z: 20,
  yawDeg: 0,
  footprint: [8, 6],
  mode: 'solid',
  ...over,
});
const chapel: StructureSpec = {
  id: 'chapel',
  kind: 'chapel',
  x: 52,
  z: 60,
  yawDeg: 0,
  footprint: [12, 18],
  mode: 'enterable',
  height: 8,
  door: { name: 'chapel', side: 'W', width: 2.4, openWhen: ['tutorial.t04.begin'] },
};
const lookup = new BuildingLookup();
/** The chapel's door-fill collider is the last one added. */
const fillOf = (fc: ReturnType<typeof createFakeCore>): { enabled: boolean } => [...fc.colliders].pop() as { enabled: boolean };

describe('buildStructures', () => {
  it('places a solid structure at terrain height with yaw and a footprint cuboid', () => {
    const fc = createFakeCore();
    const h = buildStructures(makeDeps(fc), { structures: [solid('a', { yawDeg: 90 })] }, flat, lookup);
    const o = h.objectById.get('a')!;
    expect(o.position.toArray()).toEqual([10, 3, 20]);
    expect(o.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(h.colliders).toHaveLength(1);
    expect(fc.colliders.size).toBe(1);
    expect(fc.scene.children).toContain(h.group);
    h.dispose();
  });

  it('adds no collider for open structures except gate and loft posts', () => {
    const fc = createFakeCore();
    const specs: StructureSpec[] = [
      solid('fy', { kind: 'yard-fence', mode: 'open', footprint: [24, 24] }),
      solid('g', { kind: 'gate', mode: 'open', footprint: [8, 1] }),
      solid('l', { kind: 'loft', mode: 'open', footprint: [8, 8] }),
    ];
    const h = buildStructures(makeDeps(fc), { structures: specs }, flat, lookup);
    expect(h.colliders).toHaveLength(2 + 4);
    h.dispose();
  });

  it('builds an enterable with one cuboid per wall segment plus a door fill, and a locked door', () => {
    const fc = createFakeCore();
    const h = buildStructures(makeDeps(fc), { structures: [chapel] }, flat, lookup);
    expect(h.colliders).toHaveLength(5 + 1);
    expect(h.doors).toHaveLength(1);
    const door = fc.interactables.get('door:chapel')!;
    expect(door.promptKey).toBe('interact.locked');
    door.onInteract({} as never);
    expect(fc.flags.has('door.chapel.open')).toBe(false);
    fc.flags.set('tutorial.t04.begin', true);
    expect(door.promptKey).toBe('interact.door');
    door.onInteract({} as never);
    expect(fc.flags.get('door.chapel.open')).toBe(true);
    expect(fc.colliders.size).toBe(6);
    expect(fillOf(fc).enabled).toBe(false); // door fill collider disabled while open
    h.dispose();
  });

  it('a door with no openWhen flags is never locked', () => {
    const fc = createFakeCore();
    const open = { ...chapel, door: { name: 'chapel', side: 'W' as const, width: 2.4 } };
    const h = buildStructures(makeDeps(fc), { structures: [open] }, flat, lookup);
    const door = fc.interactables.get('door:chapel')!;
    expect(door.promptKey).toBe('interact.door');
    door.onInteract({} as never);
    expect(fc.flags.get('door.chapel.open')).toBe(true);
    h.dispose();
  });

  it('door round trip across dispose and rebuild restores it open from the save', () => {
    const fc = createFakeCore();
    fc.flags.set('tutorial.t04.begin', true);
    let h = buildStructures(makeDeps(fc), { structures: [chapel] }, flat, lookup);
    fc.interactables.get('door:chapel')!.onInteract({} as never);
    h.dispose();
    expect(fc.interactables.size).toBe(0);
    h = buildStructures(makeDeps(fc), { structures: [chapel] }, flat, lookup);
    fc.fire('save.loaded');
    const pivot = h.group.getObjectByName('door-pivot:chapel')!;
    expect(pivot.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(fc.colliders.size).toBe(6);
    expect(fillOf(fc).enabled).toBe(false);
    h.dispose();
  });

  it('dispose is idempotent and leaves nothing behind', () => {
    const fc = createFakeCore();
    const h = buildStructures(makeDeps(fc), { structures: [solid('a'), chapel] }, flat, lookup);
    h.dispose();
    h.dispose();
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.interactables.size).toBe(0);
    expect(fc.systems.size).toBe(0);
  });

  it('a throw mid-build removes everything built so far and rethrows', () => {
    const fc = createFakeCore();
    let n = 0;
    const physicsFake = {
      addStaticCollider: (d: never) => {
        if (++n === 4) throw new Error('boom');
        return fc.ctx.physics.addStaticCollider(d);
      },
      removeCollider: fc.ctx.physics.removeCollider,
      rapier: physics.rapier,
    } as unknown as PhysicsWorld;
    const specs = [solid('a'), solid('b', { x: 40 }), chapel];
    expect(() => buildStructures(makeDeps(fc, physicsFake), { structures: specs }, flat, lookup)).toThrow('boom');
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.interactables.size).toBe(0);
  });

  it('a duplicate door name throws and cleans up', () => {
    const fc = createFakeCore();
    const second = { ...chapel, id: 'chapel2', x: 90 };
    expect(() => buildStructures(makeDeps(fc), { structures: [chapel, second] }, flat, lookup)).toThrow(/duplicate/);
    expect(fc.colliders.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
  });

  it('upgrade swaps in a real model, keeps the doors, and never rejects', async () => {
    const fc = createFakeCore();
    const real = new THREE.Group();
    real.name = 'real-house';
    const loader = { load: async () => ({}), instantiate: () => real.clone() };
    const lk = new BuildingLookup(loader, { house: 'x' as AssetId, chapel: 'y' as AssetId });
    const h = buildStructures(makeDeps(fc), { structures: [solid('a'), chapel] }, flat, lk);
    expect(h.objectById.get('a')!.getObjectByName('visual')!.userData.greybox).toBe(true);
    await h.upgrade();
    expect(h.objectById.get('a')!.getObjectByName('visual')!.userData.greybox).toBeUndefined();
    expect(h.doors).toHaveLength(1);
    expect(h.group.getObjectByName('door-pivot:chapel')).toBeDefined();
    h.dispose();
  });

  it('upgrade survives a failing lookup and a dispose while loading', async () => {
    const fc = createFakeCore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { tryReal: async () => { throw new Error('x'); } };
    const h = buildStructures(makeDeps(fc), { structures: [solid('a')] }, flat, bad);
    await expect(h.upgrade()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    let release!: (o: THREE.Object3D) => void;
    const slow = { tryReal: () => new Promise<THREE.Object3D | null>((r) => (release = r)) };
    const h2 = buildStructures(makeDeps(fc), { structures: [solid('b', { x: 50 })] }, flat, slow);
    const p = h2.upgrade();
    h2.dispose();
    release(new THREE.Group());
    await expect(p).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('works against real Rapier colliders', () => {
    const fc = createFakeCore();
    const real = makeDeps(fc, physics);
    const before = physics.world.colliders.len();
    const h = buildStructures(real, { structures: [solid('a'), chapel] }, flat, lookup);
    expect(physics.world.colliders.len()).toBe(before + 1 + 6);
    h.dispose();
    expect(physics.world.colliders.len()).toBe(before);
  });

  it('builds the whole Brightwater layout', () => {
    const fc = createFakeCore();
    const h = buildStructures(makeDeps(fc), BRIGHTWATER_LAYOUT, flat, lookup);
    expect(h.objectById.size).toBe(BRIGHTWATER_LAYOUT.structures.length);
    for (const s of BRIGHTWATER_LAYOUT.structures) expect(h.objectById.has(s.id)).toBe(true);
    expect(fc.interactables.has('door:bakery')).toBe(true);
    expect(fc.interactables.has('door:chapel')).toBe(true);
    expect(h.doors).toHaveLength(2);
    const solids = BRIGHTWATER_LAYOUT.structures.filter((s) => s.mode === 'solid').length;
    expect(h.colliders.length).toBeGreaterThanOrEqual(solids + 2 * 6);
    expect(h.colliders.length).toBeLessThan(solids + 40);
    expect(fc.colliders.size).toBe(h.colliders.length);
    h.dispose();
    expect(fc.colliders.size).toBe(0);
  });
});
