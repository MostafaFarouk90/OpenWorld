// The built city against real Rapier: the wall blocks, the plugged gates block, the South Gate follows the portcullis,
// a building blocks and the street between buildings does not.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { buildCity, districtOf } from './cityBuild';
import { gatePosition, polar } from './city';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  physics.world.step();
});

function build() {
  const scene = new THREE.Scene();
  const city = buildCity({ scene, physics: physics as never, rapier: physics.rapier }, HARROWMARK_LAYOUT.structures, heightAt);
  physics.world.step();
  return { scene, city };
}

/** A horizontal ray from `from` towards `to` at chest height; true when something solid lies in between. */
function blocked(from: { x: number; z: number }, to: { x: number; z: number }, groundAt = heightAt(from.x, from.z)): boolean {
  const y = groundAt + 1.2;
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const ray = new physics.rapier.Ray({ x: from.x, y, z: from.z }, { x: (to.x - from.x) / len, y: 0, z: (to.z - from.z) / len });
  return physics.world.castRay(ray, len, true) !== null;
}

describe('built city colliders', () => {
  it('blocks the wall, the six plugged gates and a building; leaves the street open', () => {
    const { city } = build();
    expect(blocked({ x: 8300, z: 1500 }, { x: 8300, z: 1180 })).toBe(true); // straight through the south wall west of the gate
    for (const g of ['smelter', 'west', 'northwest', 'northeast', 'river', 'guild'] as const) {
      const b = { smelter: 231.4, west: 282.9, northwest: 334.3, northeast: 25.7, river: 77.1, guild: 128.6 }[g];
      expect(blocked(polar(b, 700), polar(b, 800)), g).toBe(true);
    }
    expect(blocked({ x: 8300, z: 1330 }, { x: 8420, z: 1330 })).toBe(true); // the barracks hall (x 8338-8382)
    expect(blocked({ x: 8500, z: 1330 }, { x: 8500, z: 1700 - 20 })).toBe(false); // main street to the fountain
    city.dispose();
  });

  it('follows the portcullis: down blocks the South Gate, up opens it', () => {
    const { city } = build();
    const south = gatePosition('south');
    // The ray runs at the gate's own height: the Dead Road climbs to the gate, so the ground 30 m south of it is lower.
    const through = () => blocked({ x: south.x, z: south.z - 30 }, { x: south.x, z: south.z + 30 }, heightAt(south.x, south.z));
    expect(city.portcullisClosed()).toBe(true);
    expect(through()).toBe(true);
    city.setPortcullis(false);
    physics.world.step();
    expect(through()).toBe(false);
    expect(city.group.getObjectByName('portcullis')!.visible).toBe(false);
    city.setPortcullis(true);
    physics.world.step();
    expect(through()).toBe(true);
    city.dispose();
  });

  it('frees every collider and mesh on dispose', () => {
    const { scene, city } = build();
    const n = physics.world.colliders.len();
    expect(city.colliders).toBeGreaterThan(150);
    city.dispose();
    expect(physics.world.colliders.len()).toBeLessThan(n);
    expect(scene.children).toHaveLength(0);
    city.dispose(); // idempotent
  });

  it('merges the visuals per district into a handful of meshes', () => {
    const { city } = build();
    expect(city.drawCalls).toBeLessThan(40);
    const names = new Set<string>();
    city.group.traverse((o) => o.name.startsWith('harrowmark:') && names.add(o.name));
    expect(names.has('harrowmark:ring')).toBe(true);
    expect(names.has('harrowmark:ward')).toBe(true);
    city.dispose();
  });

  it('buckets ids by district', () => {
    expect(districtOf('wall.12a')).toBe('ring');
    expect(districtOf('tower.south-l')).toBe('ring');
    expect(districtOf('plug.river')).toBe('ring');
    expect(districtOf('hide-prop.gate-cart')).toBe('hide');
    expect(districtOf('ward.b10')).toBe('ward');
    expect(districtOf('keep-road.w1850')).toBe('keep');
  });
});
