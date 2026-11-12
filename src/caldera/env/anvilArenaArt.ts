// Act 5 N1 PR 3: the art on N6's D10 arena (src/bosses/act5/ulthred/anvilArena.ts). N6 keeps every position, body and collider; this
// puts the env pieces (arena-platform-a, crack-anvil-a, spirit-flame-post-a: the real files once in the manifest, the stand-ins until
// then) on its primitives and hides each primitive once its piece has loaded. A piece that does not load leaves the primitive showing.
import * as THREE from 'three';
import type { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { loadPiece, ownMaterial } from './pieces';

export interface AnvilArenaParts {
  /** Each platform slab (a child of its turning group: the piece rides with it). */
  slabs: readonly THREE.Mesh[];
  anvils: readonly THREE.Mesh[];
  posts: readonly THREE.Mesh[];
  /** The flame meshes over the posts (raised onto the piece's dish). */
  flames: readonly THREE.Mesh[];
}

export interface AnvilArenaArt {
  /** Lights or darkens one crack-anvil's crack (no-op until its piece has loaded; the state is kept and applied on load). */
  setCracked(index: number, cracked: boolean): void;
  /** Resolves once every piece has loaded or failed (tests, renders). */
  readonly ready: Promise<void>;
  dispose(): void;
}

/** The post piece's dish top: the flame sits on it. */
export const FLAME_POST_TOP = 2.2;

export function dressAnvilArena(lib: ModelLibrary, parts: AnvilArenaParts): AnvilArenaArt {
  let disposed = false;
  const added: THREE.Object3D[] = [];
  const cracked: boolean[] = parts.anvils.map(() => false);
  const cracks: { mat: THREE.MeshStandardMaterial; lit: number }[][] = parts.anvils.map(() => []);
  const paint = (i: number): void => {
    for (const c of cracks[i] ?? []) c.mat.emissiveIntensity = cracked[i] ? c.lit : 0;
  };

  /** The piece stands where the primitive's base is, turned as it is, and the primitive hides. */
  const swap = async (id: string, prim: THREE.Mesh, baseY: number, after?: (o: THREE.Object3D) => void): Promise<void> => {
    const o = await loadPiece(lib, id);
    if (!o || disposed) return;
    const holder = new THREE.Group();
    holder.name = `caldera-art:${prim.name || id}`;
    holder.position.set(prim.position.x, prim.position.y - baseY, prim.position.z);
    holder.rotation.copy(prim.rotation);
    holder.add(o);
    prim.parent?.add(holder);
    prim.visible = false;
    added.push(holder);
    after?.(o);
  };

  const jobs: Promise<void>[] = [];
  for (const s of parts.slabs) {
    const g = s.geometry as THREE.BoxGeometry;
    jobs.push(swap('arena-platform-a', s, (g.parameters?.height ?? 0.35) / 2));
  }
  parts.anvils.forEach((a, i) => {
    const g = a.geometry as THREE.BoxGeometry;
    jobs.push(
      swap('crack-anvil-a', a, (g.parameters?.height ?? 1) / 2, (o) => {
        cracks[i] = ownMaterial(o, 'Glow').map((mat) => ({ mat, lit: mat.emissiveIntensity > 0 ? mat.emissiveIntensity : 1 }));
        paint(i);
      }),
    );
  });
  parts.posts.forEach((p, i) => {
    const g = p.geometry as THREE.CylinderGeometry;
    jobs.push(
      swap('spirit-flame-post-a', p, (g.parameters?.height ?? 1.6) / 2, () => {
        const f = parts.flames[i];
        if (f) f.position.y = p.position.y - (g.parameters?.height ?? 1.6) / 2 + FLAME_POST_TOP + 0.45;
      }),
    );
  });

  return {
    setCracked(i, on) {
      if (i < 0 || i >= cracked.length) return;
      cracked[i] = on;
      paint(i);
    },
    ready: Promise.all(jobs).then(() => undefined),
    dispose() {
      disposed = true;
      for (const o of added.splice(0)) o.removeFromParent();
      for (const list of cracks) for (const c of list) c.mat.dispose();
    },
  };
}
