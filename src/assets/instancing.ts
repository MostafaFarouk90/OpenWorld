import * as THREE from 'three';

/** One draw-able piece of a static model: baked geometry plus its material. */
export interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Collects the static meshes under `root` as parts with their transform relative to `root`
 * baked into cloned geometry. SkinnedMesh nodes are silently skipped (they cannot be instanced).
 * Multi-material meshes are split per geometry group; otherwise the first material is used.
 */
export function extractMeshParts(root: THREE.Object3D): MeshPart[] {
  root.updateWorldMatrix(true, true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const parts: MeshPart[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || (obj as THREE.SkinnedMesh).isSkinnedMesh) return;
    rel.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const baked = mesh.geometry.clone().applyMatrix4(rel);

    if (Array.isArray(mesh.material)) {
      const groups = baked.groups.length > 0 ? baked.groups : null;
      if (!groups) {
        parts.push({ geometry: baked, material: mesh.material[0] });
        return;
      }
      for (const group of groups) {
        const material = mesh.material[group.materialIndex ?? 0];
        if (material) parts.push({ geometry: sliceGroup(baked, group), material });
      }
      baked.dispose();
    } else {
      parts.push({ geometry: baked, material: mesh.material });
    }
  });
  return parts;
}

/** Builds a geometry sharing `src` attributes but indexing only the given group's range. */
function sliceGroup(
  src: THREE.BufferGeometry,
  group: { start: number; count: number },
): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) out.setAttribute(name, src.attributes[name]);
  const indices = new Uint32Array(group.count);
  const srcIndex = src.index;
  for (let i = 0; i < group.count; i++) {
    indices[i] = srcIndex ? srcIndex.getX(group.start + i) : group.start + i;
  }
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
}

/** A static model drawn many times: one InstancedMesh per part. */
export class InstancedModel extends THREE.Group {
  readonly meshes: THREE.InstancedMesh[];
  private used = 0;

  constructor(parts: MeshPart[], readonly capacity: number) {
    super();
    this.meshes = parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      this.add(mesh);
      return mesh;
    });
  }

  /** Number of instances in use. */
  get count(): number {
    return this.used;
  }

  /** Appends an instance and returns its index. Throws when capacity is exhausted. */
  addInstance(matrix: THREE.Matrix4): number {
    if (this.used >= this.capacity) throw new Error('InstancedModel: capacity exceeded');
    const index = this.used++;
    for (const mesh of this.meshes) mesh.count = this.used;
    this.setMatrixAt(index, matrix);
    return index;
  }

  /** Overwrites the transform of an existing instance. */
  setMatrixAt(index: number, matrix: THREE.Matrix4): void {
    if (index < 0 || index >= this.used) throw new RangeError(`InstancedModel: bad index ${index}`);
    for (const mesh of this.meshes) {
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      // Recomputing here would make filling n instances O(n^2); three recomputes lazily when null.
      mesh.boundingSphere = null;
      mesh.boundingBox = null;
    }
  }
}

/**
 * Packs several models into one THREE.BatchedMesh (a single draw call).
 * All parts must share one material: KayKit packs use a single atlas, but each GLTF load has
 * its own material instance, so atlas users should pass `material` explicitly. Without it, all
 * parts must already reference the same material instance. Geometries must share the same
 * attribute set (e.g. position/normal/uv); non-indexed ones are copied with a sequential index
 * (the caller's geometry is not modified).
 * Returns the mesh and, per model, the geometry ids of its parts.
 */
export function buildBatchedMesh(
  models: MeshPart[][],
  maxInstances: number,
  material?: THREE.Material,
): { mesh: THREE.BatchedMesh; geometryIds: number[][] } {
  if (!Number.isInteger(maxInstances) || maxInstances < 1) {
    // three r168 BatchedMesh cannot even register geometry with zero instance slots.
    throw new RangeError(`buildBatchedMesh: maxInstances must be a positive integer, got ${maxInstances}`);
  }
  const parts = models.flat();
  const shared = material ?? parts[0]?.material;
  if (!shared) throw new Error('buildBatchedMesh: no mesh parts supplied');
  if (!material && parts.some((p) => p.material.uuid !== shared.uuid)) {
    throw new Error(
      'buildBatchedMesh: parts use more than one material; pass a shared `material` ' +
        '(e.g. the texture atlas material) to override',
    );
  }

  const geometries = parts.map((p) => ensureIndexed(p.geometry));
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.getAttribute('position').count;
    indexCount += g.getIndex()?.count ?? 0;
  }

  const mesh = new THREE.BatchedMesh(maxInstances, vertexCount, indexCount, shared);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  let next = 0;
  const geometryIds = models.map((model) => model.map(() => mesh.addGeometry(geometries[next++])));
  return { mesh, geometryIds };
}

/**
 * Adds one instance of a multi-part model; returns the instance id of each part. If the mesh runs
 * out of instance slots part-way, the parts already added are hidden and the error rethrown, so a
 * model is never left half-drawn (three r168 does not reclaim BatchedMesh slots).
 */
export function addBatchedInstance(
  mesh: THREE.BatchedMesh,
  geometryIds: number[],
  matrix: THREE.Matrix4,
): number[] {
  const added: number[] = [];
  try {
    for (const geometryId of geometryIds) {
      const instanceId = mesh.addInstance(geometryId);
      added.push(instanceId);
      mesh.setMatrixAt(instanceId, matrix);
    }
  } catch (err) {
    for (const instanceId of added) mesh.setVisibleAt(instanceId, false);
    throw err;
  } finally {
    // three r168 caches BatchedMesh bounds on first use and never invalidates them itself.
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  }
  return added;
}

function ensureIndexed(source: THREE.BufferGeometry): THREE.BufferGeometry {
  if (source.index) return source;
  const geometry = source.clone();
  const count = geometry.getAttribute('position').count;
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}
