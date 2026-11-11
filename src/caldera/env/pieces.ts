// Act 5 N1 PR 3: the code-placed env pieces (calderaEnvIds.ts, use 'piece'), loaded through the env library: the real file once it is
// in the manifest, the scripted stand-in until then (src/env/resolve.ts). Fitted to the catalogue's size, base-centre pivot, front +Z.
// Resolves to null when nothing loads (headless tests, a failed file); callers keep their primitives then.
import * as THREE from 'three';
import { explicitFit } from '../../assets/swap/fit';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { resolveModel } from '../../env/resolve';
import { CALDERA_ENV_IDS } from './calderaEnvIds';

const SIZE = new Map(CALDERA_ENV_IDS.map((e) => [e.id, e]));

export async function loadPiece(lib: ModelLibrary, id: string): Promise<THREE.Object3D | null> {
  const e = SIZE.get(id);
  const r = resolveModel(id);
  if (!e || r.source !== 'env') return null;
  try {
    const t = await lib.template(r.model);
    if (!t) return null;
    const b = t.bounds;
    const fit = explicitFit(b, e.w / (b.max.x - b.min.x), e.h / (b.max.y - b.min.y), e.d / (b.max.z - b.min.z));
    const obj = ModelLibrary.object(t, fit);
    obj.userData.envPiece = id;
    return obj;
  } catch {
    return null;
  }
}

/** Gives this object its own copy of the named material (so one crack-anvil can glow while the others stay dark). Returns the copies. */
export function ownMaterial(obj: THREE.Object3D, name: string): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    if (!Array.isArray(mat) && mat?.name === name && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      const copy = (mat as THREE.MeshStandardMaterial).clone();
      m.material = copy;
      out.push(copy);
    }
  });
  return out;
}
