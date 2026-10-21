import * as THREE from 'three';

export const TIER3_EMISSIVE = 0xff5a1f;
export const TIER3_EMISSIVE_INTENSITY = 0.7;
const KEY = 'gearTint';

type Emissive = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number };
const hasEmissive = (m: THREE.Material): m is Emissive => 'emissive' in m && (m as Emissive).emissive instanceof THREE.Color;

/**
 * Gives every mesh under `weapon` a private, emissive copy of its material (the kit's materials are shared) or puts the
 * originals back. Colour only: nothing here reads world position. Idempotent either way.
 */
export function setWeaponTint(weapon: THREE.Object3D | null | undefined, on: boolean): void {
  if (!weapon) return;
  weapon.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const saved = mesh.userData[KEY] as THREE.Material | THREE.Material[] | undefined;
    if (on && !saved) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!mats.some(hasEmissive)) return;
      mesh.userData[KEY] = mesh.material;
      const tinted = mats.map((m) => {
        if (!hasEmissive(m)) return m;
        const c = m.clone() as Emissive;
        c.emissive.setHex(TIER3_EMISSIVE);
        c.emissiveIntensity = TIER3_EMISSIVE_INTENSITY;
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
    } else if (!on && saved) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const orig = Array.isArray(saved) ? saved : [saved];
      for (const m of mats) if (!orig.includes(m)) m.dispose();
      mesh.material = saved;
      delete mesh.userData[KEY];
    }
  });
}

