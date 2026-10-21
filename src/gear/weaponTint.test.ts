import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TIER3_EMISSIVE, setWeaponTint } from './weaponTint';

function weapon() {
  const shared = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const b = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const basic = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const root = new THREE.Group();
  root.add(a, b, basic);
  return { root, a, b, basic, shared };
}

describe('setWeaponTint', () => {
  it('gives each mesh a private emissive copy and leaves the shared material alone', () => {
    const w = weapon();
    setWeaponTint(w.root, true);
    const ma = w.a.material as THREE.MeshStandardMaterial;
    expect(ma).not.toBe(w.shared);
    expect(ma.emissive.getHex()).toBe(TIER3_EMISSIVE);
    expect(w.shared.emissive.getHex()).toBe(0);
    expect(w.b.material).not.toBe(ma);
    expect(w.basic.material).toBeInstanceOf(THREE.MeshBasicMaterial); // no emissive channel: untouched
  });
  it('is idempotent and restores the originals', () => {
    const w = weapon();
    setWeaponTint(w.root, true);
    const first = w.a.material;
    setWeaponTint(w.root, true);
    expect(w.a.material).toBe(first);
    setWeaponTint(w.root, false);
    expect(w.a.material).toBe(w.shared);
    expect(w.b.material).toBe(w.shared);
    setWeaponTint(w.root, false);
    expect(w.a.material).toBe(w.shared);
  });
  it('accepts a missing weapon and handles material arrays', () => {
    setWeaponTint(null, true);
    setWeaponTint(undefined, false);
    const m = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()]);
    setWeaponTint(m, true);
    const mats = m.material as THREE.Material[];
    expect((mats[0] as THREE.MeshStandardMaterial).emissive.getHex()).toBe(TIER3_EMISSIVE);
    expect(mats[1]).toBeInstanceOf(THREE.MeshBasicMaterial);
    setWeaponTint(m, false);
    expect((m.material as THREE.Material[])[0]).not.toHaveProperty('gearTint');
    expect(((m.material as THREE.Material[])[0] as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
  });
});
