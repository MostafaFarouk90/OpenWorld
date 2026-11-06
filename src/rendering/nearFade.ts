// Act 4 (L2): fades the player's mesh while a wall holds the camera close (ThirdPersonCamera.nearFade), so a camera stopped at
// a wall in the Keep stairs or the deep run never shows the inside of the head. Each mesh's materials are cloned once, the
// first time it fades, so shared materials (the Knight's atlas, NPCs wearing the same kit) never fade with it.
import * as THREE from 'three';

/** The opacity at full fade. */
export const NEAR_FADE_MIN_OPACITY = 0.25;

interface Saved {
  originals: THREE.Material | THREE.Material[];
  /** What we put on the mesh (the array itself for an array material), to tell whether another system swapped it since. */
  installed: THREE.Material | THREE.Material[];
  faded: THREE.Material[];
}

/**
 * Another system may swap a mesh's material while it is faded (the weapon tier tint, gear/weaponTint.ts) and later put
 * back what it found, which may be our clone. So a clone is never left translucent: whenever we let go of one we set its
 * opacity and transparency back to its original's, and we only dispose clones that are still ours alone on the mesh.
 */
export class NearFade {
  private readonly saved = new Map<THREE.Mesh, Saved>();
  private last = 0;

  /** Applies `fade` (0 = untouched, 1 = most faded) to every mesh under `root`. Restores the original materials at 0. */
  apply(root: THREE.Object3D, fade: number): void {
    const f = Math.min(1, Math.max(0, Number.isFinite(fade) ? fade : 0));
    if (f === 0) {
      if (this.last !== 0) this.restore();
      this.last = 0;
      return;
    }
    this.last = f;
    const opacity = 1 - (1 - NEAR_FADE_MIN_OPACITY) * f;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      let s = this.saved.get(mesh);
      if (s && mesh.material !== s.installed) {
        // Swapped under us: our clones go opaque again (never disposed, the other system may hold one) and we start over.
        unfade(s);
        this.saved.delete(mesh);
        s = undefined;
      }
      if (!s) {
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const faded = list.map((m) => {
          const c = m.clone();
          c.transparent = true;
          return c;
        });
        const installed = Array.isArray(mesh.material) ? faded : faded[0]!;
        s = { originals: mesh.material, installed, faded };
        this.saved.set(mesh, s);
        mesh.material = installed;
      }
      for (const m of s.faded) m.opacity = opacity;
    });
  }

  /** Puts every original material back and frees the clones that are still only ours. */
  restore(): void {
    for (const [mesh, s] of this.saved) {
      unfade(s);
      if (mesh.material === s.installed) {
        mesh.material = s.originals;
        for (const m of s.faded) m.dispose();
      }
    }
    this.saved.clear();
  }
}

/** Sets each clone's opacity and transparency back to its original's. */
function unfade(s: Saved): void {
  const orig = Array.isArray(s.originals) ? s.originals : [s.originals];
  s.faded.forEach((m, i) => {
    const o = orig[i];
    if (!o) return;
    m.opacity = o.opacity;
    m.transparent = o.transparent;
  });
}
