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

  it('lies face-up while carried (the model front, +Z, points at the sky) and stands facing level when set down', () => {
    const b = new VillagerBody(0, 0x888888, null);
    const face = new THREE.Object3D();
    face.position.set(0, 1.6, 0.3); // a point in front of the head, in the figure's frame
    (b.root.children[0] as THREE.Object3D).add(face);
    const head = new THREE.Object3D();
    head.position.set(0, 1.6, 0);
    (b.root.children[0] as THREE.Object3D).add(head);
    const dirOf = () => {
      b.root.updateMatrixWorld(true);
      const f = face.getWorldPosition(new THREE.Vector3());
      const h = head.getWorldPosition(new THREE.Vector3());
      return f.sub(h).normalize();
    };
    for (const yaw of [0, 1.1, Math.PI, -2.4]) {
      b.setPose({ x: 5, y: 2, z: -7 }, yaw);
      expect(b.isCarried).toBe(true);
      // within 15 degrees of straight up
      expect(dirOf().y).toBeGreaterThan(Math.cos((15 * Math.PI) / 180));
    }
    b.setPose({ x: 5, y: 2, z: -7 });
    expect(b.isCarried).toBe(false);
    expect(Math.abs(dirOf().y)).toBeLessThan(1e-6);
  });

  it('holds the idle clip still while carried and plays it again once set down', () => {
    const b = new VillagerBody(0, 0x888888, null);
    let advanced = 0;
    (b as unknown as { mixer: { update(dt: number): void; stopAllAction(): void } }).mixer = { update: (dt) => void (advanced += dt), stopAllAction() {} };
    b.setVisible(true);
    b.setPose({ x: 0, y: 0, z: 0 });
    b.update(0.5);
    expect(advanced).toBe(0.5);
    b.setPose({ x: 0, y: 0, z: 0 }, 0);
    b.update(0.5);
    expect(advanced).toBe(0.5);
    b.setPose({ x: 0, y: 0, z: 0 });
    b.update(0.25);
    expect(advanced).toBe(0.75);
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
