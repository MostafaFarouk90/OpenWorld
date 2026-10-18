import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CalmShell, PounceDecal } from './grimtoothFx';
import { LOOK, POUNCE } from './tuning';

describe('PounceDecal', () => {
  it('is hidden until started, then spans the actual from-to distance on the floor', () => {
    const d = new PounceDecal();
    expect(d.active).toBe(false);
    d.start({ x: 1, y: 2, z: 1 }, { x: 4, y: 2, z: 5 });
    expect(d.active).toBe(true);
    expect(d.mesh.position.y).toBeCloseTo(2.03);
    d.update(POUNCE.decalFillSeconds);
    expect(d.mesh.scale.z).toBeCloseTo(5);
    expect(d.mesh.scale.x).toBeCloseTo(0.9);
    d.dispose();
  });

  it('points along the heading (yaw 0 faces -Z)', () => {
    const d = new PounceDecal();
    for (const [dx, dz] of [[0, -3], [3, 0], [0, 3], [-2, -2]]) {
      d.start({ x: 0, y: 0, z: 0 }, { x: dx, y: 0, z: dz });
      d.update(1);
      d.mesh.updateMatrixWorld(true);
      const tip = new THREE.Vector3(0, 0, -1).applyMatrix4(d.mesh.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1, 1, 1)));
      // The strip's far end (local z = -1 of the unit geometry) lands on the aim point.
      expect(tip.x).toBeCloseTo(dx, 5);
      expect(tip.z).toBeCloseTo(dz, 5);
    }
    d.dispose();
  });

  it('fills from 0 to full length over decalFillSeconds and holds', () => {
    const d = new PounceDecal();
    d.start({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -4 });
    expect(d.mesh.scale.z).toBeLessThan(0.01);
    d.update(POUNCE.decalFillSeconds / 2);
    expect(d.mesh.scale.z).toBeCloseTo(2);
    d.update(POUNCE.decalFillSeconds);
    expect(d.mesh.scale.z).toBeCloseTo(4);
    d.update(5);
    expect(d.active).toBe(true);
    expect(d.mesh.scale.z).toBeCloseTo(4);
    d.update(NaN);
    d.stop();
    expect(d.active).toBe(false);
    d.dispose();
  });

  it('survives a zero-length leap and disposes its geometry and material', () => {
    const d = new PounceDecal();
    d.start({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 });
    d.update(1);
    expect(d.mesh.scale.z).toBeGreaterThan(0);
    let freed = 0;
    d.mesh.geometry.addEventListener('dispose', () => freed++);
    (d.mesh.material as THREE.Material).addEventListener('dispose', () => freed++);
    d.dispose();
    expect(freed).toBe(2);
  });
});

describe('CalmShell', () => {
  const at = { x: 3, y: 1, z: -2 };
  const hex = (s: CalmShell) => (s.mesh.material as THREE.MeshBasicMaterial).color.getHex();

  it('is an ellipsoid about 1.3 x 1.1 x 2.0 m', () => {
    const s = new CalmShell();
    expect(s.mesh.scale.x * 2).toBeCloseTo(1.3);
    expect(s.mesh.scale.y * 2).toBeCloseTo(1.1);
    expect(s.mesh.scale.z * 2).toBeCloseTo(2);
    s.dispose();
  });

  it('goes orange to gold over calmShellSeconds and holds gold', () => {
    const s = new CalmShell();
    expect(s.active).toBe(false);
    s.start();
    s.update(0, at, 1.2);
    expect(s.active).toBe(true);
    expect(s.progress).toBe(0);
    expect(hex(s)).toBe(LOOK.calmShellFrom);
    expect(s.mesh.position.x).toBe(3);
    expect(s.mesh.rotation.y).toBeCloseTo(1.2);
    s.update(LOOK.calmShellSeconds / 2, at, 0);
    expect(s.progress).toBeCloseTo(0.5);
    const mid = new THREE.Color(LOOK.calmShellFrom).lerp(new THREE.Color(LOOK.calmShellTo), 0.5).getHex();
    expect(hex(s)).toBe(mid);
    s.update(LOOK.calmShellSeconds / 2, at, 0);
    expect(s.progress).toBe(1);
    expect(hex(s)).toBe(LOOK.calmShellTo);
    s.update(10, at, 0);
    expect(s.progress).toBe(1);
    expect(hex(s)).toBe(LOOK.calmShellTo);
    s.dispose();
  });

  it('stop hides it and start restarts from orange', () => {
    const s = new CalmShell();
    s.start();
    s.update(1, at, 0);
    s.stop();
    expect(s.active).toBe(false);
    s.start();
    expect(s.progress).toBe(0);
    expect(hex(s)).toBe(LOOK.calmShellFrom);
    s.dispose();
  });

  it('dispose frees the geometry and material', () => {
    const s = new CalmShell();
    let freed = 0;
    s.mesh.geometry.addEventListener('dispose', () => freed++);
    (s.mesh.material as THREE.Material).addEventListener('dispose', () => freed++);
    s.dispose();
    expect(freed).toBe(2);
  });
});
