import * as THREE from 'three';
import {
  ACTOR_FRAGMENT_DECL,
  ACTOR_VERTEX_DECL,
  ACTOR_VERTEX_MAIN,
  DISSOLVE_DISCARD,
  DISSOLVE_EMISSIVE,
  TELEGRAPH_EMISSIVE,
} from './shaders/glsl';

export const ACTOR_FX_CACHE_KEY = 'owgfx-v1';

export interface ActorFxUniforms {
  uTelegraph: { value: number };
  uTelegraphColor: { value: THREE.Color };
  uDissolve: { value: number };
  uDissolveTint: { value: THREE.Color };
  uTime: { value: number };
}

export function getFx(material: THREE.Material): ActorFxUniforms | undefined {
  return (material.userData as { fx?: ActorFxUniforms }).fx;
}

interface ShaderLike {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** Patches a MeshStandardMaterial shader with the telegraph and dissolve chunks. Exported for tests. */
export function patchActorShader(shader: ShaderLike, fx: ActorFxUniforms): void {
  shader.uniforms.uTelegraph = fx.uTelegraph;
  shader.uniforms.uTelegraphColor = fx.uTelegraphColor;
  shader.uniforms.uDissolve = fx.uDissolve;
  shader.uniforms.uDissolveTint = fx.uDissolveTint;
  shader.uniforms.uTime = fx.uTime;

  let vs = shader.vertexShader;
  vs = vs.includes('#include <common>')
    ? vs.replace('#include <common>', `#include <common>\n${ACTOR_VERTEX_DECL}`)
    : `${ACTOR_VERTEX_DECL}\n${vs}`;
  vs = vs.replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => `${m}\n${ACTOR_VERTEX_MAIN}`);
  shader.vertexShader = vs;

  let fs = `${ACTOR_FRAGMENT_DECL}\n${shader.fragmentShader}`;
  fs = fs.replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => `${m}\n${DISSOLVE_DISCARD}`);
  fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${TELEGRAPH_EMISSIVE}\n${DISSOLVE_EMISSIVE}`);
  shader.fragmentShader = fs;
}

interface Entry {
  /** Original material (or array) per mesh. */
  originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  /** Clones per mesh, in slot order (non-standard slots are skipped). */
  perMesh: Map<THREE.Mesh, THREE.MeshStandardMaterial[]>;
  clones: THREE.MeshStandardMaterial[];
}

/**
 * Per-actor material clones. Clones of one character share their material objects, so each actor root
 * (indeed each mesh) gets its own cloned MeshStandardMaterials carrying the fx uniforms.
 */
export class ActorMaterials {
  private readonly entries = new WeakMap<THREE.Object3D, Entry>();

  ensure(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
    let entry = this.entries.get(root);
    if (!entry) {
      entry = { originals: new Map(), perMesh: new Map(), clones: [] };
      this.entries.set(root, entry);
    }
    const e = entry;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || e.originals.has(mesh)) return;
      const orig = mesh.material;
      const list = Array.isArray(orig) ? orig : [orig];
      const mine: THREE.MeshStandardMaterial[] = [];
      const next = list.map((m) => {
        if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;
        const clone = (m as THREE.MeshStandardMaterial).clone();
        this.install(clone);
        mine.push(clone);
        return clone;
      });
      if (mine.length === 0) return;
      e.originals.set(mesh, orig);
      e.perMesh.set(mesh, mine);
      e.clones.push(...mine);
      mesh.material = Array.isArray(orig) ? next : next[0];
    });
    return e.clones;
  }

  /** Clones already installed, or an empty array. */
  get(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
    return this.entries.get(root)?.clones ?? [];
  }

  /** Clones grouped by mesh, for part-filtered effects. */
  meshes(root: THREE.Object3D): Array<{ mesh: THREE.Mesh; materials: THREE.MeshStandardMaterial[] }> {
    const e = this.entries.get(root);
    if (!e) return [];
    return [...e.perMesh].map(([mesh, materials]) => ({ mesh, materials }));
  }

  has(root: THREE.Object3D): boolean {
    return this.entries.has(root);
  }

  restore(root: THREE.Object3D): void {
    const e = this.entries.get(root);
    if (!e) return;
    for (const [mesh, orig] of e.originals) mesh.material = orig;
    for (const c of e.clones) c.dispose();
    this.entries.delete(root);
  }

  private install(mat: THREE.MeshStandardMaterial): void {
    const fx: ActorFxUniforms = {
      uTelegraph: { value: 0 },
      uTelegraphColor: { value: new THREE.Color(0xffd23a) },
      uDissolve: { value: 0 },
      uDissolveTint: { value: new THREE.Color(0xff8a2a) },
      uTime: { value: 0 },
    };
    mat.userData.fx = fx;
    mat.onBeforeCompile = (shader) => patchActorShader(shader as unknown as ShaderLike, fx);
    mat.customProgramCacheKey = () => ACTOR_FX_CACHE_KEY;
  }
}
