import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWaystoneMesh, setLit } from './waystoneMesh';

const glow = (o: THREE.Object3D): number =>
  ((o.getObjectByName('crystal') as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity;

describe('waystoneMesh', () => {
  it('builds a pillar about 2.4 m tall with a dim crystal by default', () => {
    const o = buildWaystoneMesh();
    const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(2);
    expect(size.y).toBeLessThan(2.8);
    expect(glow(o)).toBeLessThan(0.3);
  });

  it('setLit toggles only that stone', () => {
    const a = buildWaystoneMesh();
    const b = buildWaystoneMesh();
    setLit(a, true);
    expect(glow(a)).toBeGreaterThan(1);
    expect(glow(b)).toBeLessThan(0.3);
    setLit(a, false);
    expect(glow(a)).toBeLessThan(0.3);
  });

  it('setLit on an object without a crystal is a harmless no-op', () => {
    expect(() => setLit(new THREE.Group(), true)).not.toThrow();
  });
});
