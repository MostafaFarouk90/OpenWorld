import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWeaponMarkers } from './weaponMarkers';

describe('createWeaponMarkers', () => {
  it('finds the long Y axis', () => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshBasicMaterial());
    w.position.set(3, 2, 1);
    w.rotation.z = 1;
    const { hilt, tip } = createWeaponMarkers(w);
    expect(hilt).not.toBe(tip);
    expect(hilt.name).toBe('weaponHilt');
    expect(tip.name).toBe('weaponTip');
    expect(hilt.parent).toBe(w);
    expect(hilt.position.y).toBeCloseTo(-0.5);
    expect(tip.position.y).toBeCloseTo(0.5);
    expect(tip.position.x).toBeCloseTo(0);
  });

  it('finds the long X axis', () => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.2), new THREE.MeshBasicMaterial());
    const { hilt, tip } = createWeaponMarkers(w);
    expect(hilt.position.x).toBeCloseTo(-1);
    expect(tip.position.x).toBeCloseTo(1);
    expect(tip.position.y).toBeCloseTo(0);
  });

  it('handles children geometry in the weapon frame', () => {
    const w = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
    blade.scale.set(1, 10, 1);
    blade.position.y = 1;
    w.add(blade);
    w.scale.setScalar(2);
    const { hilt, tip } = createWeaponMarkers(w);
    expect(hilt.position.y).toBeCloseTo(0.5);
    expect(tip.position.y).toBeCloseTo(1.5);
  });

  it('handles no geometry', () => {
    const w = new THREE.Group();
    const { hilt, tip } = createWeaponMarkers(w);
    expect(hilt.position.toArray()).toEqual([0, 0, 0]);
    expect(tip.position.toArray()).toEqual([0, 1, 0]);
    expect(hilt).not.toBe(tip);
  });

  it('is idempotent', () => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshBasicMaterial());
    const a = createWeaponMarkers(w);
    const b = createWeaponMarkers(w);
    expect(b.hilt).toBe(a.hilt);
    expect(b.tip).toBe(a.tip);
    expect(w.children).toHaveLength(2);
    expect(b.tip.position.y).toBeCloseTo(0.5);
  });
});
