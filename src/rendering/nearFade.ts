// Act 4 (L2): fades the player's mesh while a wall holds the camera close (ThirdPersonCamera.nearFade), so a camera stopped at
// a wall in the Keep stairs or the deep run never shows the inside of the head. Each mesh's materials are cloned once, the
// first time it fades, so shared materials (the Knight's atlas, NPCs wearing the same kit) never fade with it.
import * as THREE from 'three';

/** The opacity at full fade. */
export const NEAR_FADE_MIN_OPACITY = 0.25;

interface Saved {
  originals: THREE.Material | THREE.Material[];
  faded: THREE.Material[];
}

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
      if (!s) {
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const faded = list.map((m) => {
          const c = m.clone();
          c.transparent = true;
          return c;
        });
        s = { originals: mesh.material, faded };
        this.saved.set(mesh, s);
        mesh.material = Array.isArray(mesh.material) ? faded : faded[0]!;
      }
      for (const m of s.faded) m.opacity = opacity;
    });
  }

  /** Puts every original material back and frees the clones. */
  restore(): void {
    for (const [mesh, s] of this.saved) {
      mesh.material = s.originals;
      for (const m of s.faded) m.dispose();
    }
    this.saved.clear();
  }
}
