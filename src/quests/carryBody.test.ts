import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CARRY_FORWARD, CARRY_HEIGHT, VillagerBody } from './carryBody';

describe('VillagerBody', () => {
  it('stands upright at its feet when not carried', () => {
    const b = new VillagerBody(0, 0x888888, null);
    b.setPose({ x: 3, y: 1, z: -2 });
    expect(b.root.position.toArray()).toEqual([3, 1, -2]);
    expect(b.root.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('rides in front of the carrier, at chest height, lying across their arms', () => {
    const b = new VillagerBody(0, 0x888888, null);
    b.setPose({ x: 0, y: 0, z: 0 }, 0); // yaw 0 faces -Z
    expect(b.root.position.x).toBeCloseTo(0);
    expect(b.root.position.y).toBeCloseTo(CARRY_HEIGHT);
    expect(b.root.position.z).toBeCloseTo(-CARRY_FORWARD);
    b.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(b.root);
    // lying, not standing: the body is wider than it is tall, and nothing hangs below the carrier's waist
    expect(box.max.y - box.min.y).toBeLessThan(1);
    expect(box.min.y).toBeGreaterThan(0.5);
  });

  it('turns with the carrier', () => {
    const b = new VillagerBody(0, 0x888888, null);
    b.setPose({ x: 0, y: 0, z: 0 }, Math.PI / 2); // faces -X
    expect(b.root.position.x).toBeCloseTo(-CARRY_FORWARD);
    expect(b.root.position.z).toBeCloseTo(0);
  });

  it('keeps the capsule when the model fails to load', async () => {
    const loader = { load: () => Promise.reject(new Error('no glb')), instantiate: () => new THREE.Group(), animations: () => [] };
    const b = new VillagerBody(1, 0x888888, loader);
    await new Promise((r) => setTimeout(r, 0));
    expect(b.root.children.length).toBe(1);
    b.dispose();
  });
});
