// T02 banner highlighting: the target banner glows (emissive), banners already seen stay dimly lit, the rest are
// plain cloth. Replaces the old 15% scale pulse (clarity review item 19). Banners are the meshes `banner:<anchorId>`
// that region/props.ts builds; this only touches their material colours, never their transform.
import * as THREE from 'three';

export const BANNER_PREFIX = 'banner:';
export const BANNER_GLOW = { target: 1.6, seen: 0.35, idle: 0 } as const;
const GLOW_COLOR = 0xffc060;

function bannerMeshes(scene: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if (o.name.startsWith(BANNER_PREFIX) && (o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/**
 * `targetId` and `seenIds` are anchor ids ('chapel.banner-2') or full mesh names ('banner:chapel.banner-2').
 * Pass `null` and `[]` to clear every glow. Safe to call every frame or on every change.
 */
export function setBanners(scene: THREE.Object3D, targetId: string | null, seenIds: readonly string[] = []): void {
  const strip = (id: string): string => (id.startsWith(BANNER_PREFIX) ? id.slice(BANNER_PREFIX.length) : id);
  const target = targetId === null ? null : strip(targetId);
  const seen = new Set(seenIds.map(strip));
  for (const mesh of bannerMeshes(scene)) {
    const id = mesh.name.slice(BANNER_PREFIX.length);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || !('emissive' in mat)) continue;
    mat.emissive.setHex(GLOW_COLOR);
    mat.emissiveIntensity = id === target ? BANNER_GLOW.target : seen.has(id) ? BANNER_GLOW.seen : BANNER_GLOW.idle;
  }
}

/** Current glow level of a banner (test and debug helper). */
export function bannerGlow(scene: THREE.Object3D, anchorId: string): number | undefined {
  const m = scene.getObjectByName(BANNER_PREFIX + anchorId) as THREE.Mesh | undefined;
  return m ? (m.material as THREE.MeshStandardMaterial).emissiveIntensity : undefined;
}
