import * as THREE from 'three';

export const TIER3_EMISSIVE = 0xff5a1f;
export const TIER3_EMISSIVE_INTENSITY = 0.7;
/** K10 (design 9.6): Wyrm-tempered edges burn cold, teal-white against tier 3's ember orange. */
export const TIER4_EMISSIVE = 0x7fe8ff;
export const TIER4_EMISSIVE_INTENSITY = 0.85;
const KEY = 'gearTint';
const TIER_KEY = 'gearTintTier';

type Emissive = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number };
const hasEmissive = (m: THREE.Material): m is Emissive => 'emissive' in m && (m as Emissive).emissive instanceof THREE.Color;

/**
 * Gives every mesh under `weapon` a private, emissive copy of its material (the kit's materials are shared) or puts the
 * originals back. Colour only: nothing here reads world position. Idempotent either way. `tier` 4 (K10) uses the
 * Wyrm-tempered palette; switching tier re-tints from the originals.
 */
export function setWeaponTint(weapon: THREE.Object3D | null | undefined, on: boolean, tier = 3): void {
  if (!weapon) return;
  const hex = tier >= 4 ? TIER4_EMISSIVE : TIER3_EMISSIVE;
  const intensity = tier >= 4 ? TIER4_EMISSIVE_INTENSITY : TIER3_EMISSIVE_INTENSITY;
  weapon.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (on && mesh.userData[KEY] && mesh.userData[TIER_KEY] !== tier) restore(mesh);
    const saved = mesh.userData[KEY] as THREE.Material | THREE.Material[] | undefined;
    if (on && !saved) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!mats.some(hasEmissive)) return;
      mesh.userData[KEY] = mesh.material;
      mesh.userData[TIER_KEY] = tier;
      const tinted = mats.map((m) => {
        if (!hasEmissive(m)) return m;
        const c = m.clone() as Emissive;
        c.emissive.setHex(hex);
        c.emissiveIntensity = intensity;
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
    } else if (!on && saved) restore(mesh);
  });
}

function restore(mesh: THREE.Mesh): void {
  const saved = mesh.userData[KEY] as THREE.Material | THREE.Material[];
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const orig = Array.isArray(saved) ? saved : [saved];
  for (const m of mats) if (!orig.includes(m)) m.dispose();
  mesh.material = saved;
  delete mesh.userData[KEY];
  delete mesh.userData[TIER_KEY];
}
