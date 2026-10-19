import * as THREE from 'three';
import { InstancedModel } from '../instancing';
import type { ModelTemplate } from './ModelLibrary';

export interface BatchStats {
  /** InstancedMesh count: one draw call each when in view. */
  batches: number;
  instances: number;
  triangles: number;
}

/**
 * Collects placements of templates under a group key (a district) and builds one InstancedModel per (group, template). Each
 * group gets its own Group with a bounding sphere, so the caller can hide a whole group by distance (LOD) and three culls the
 * batches by frustum.
 */
export class ModelBatches {
  private readonly placements = new Map<string, Map<string, { template: ModelTemplate; matrices: THREE.Matrix4[] }>>();

  add(group: string, template: ModelTemplate, matrix: THREE.Matrix4): void {
    const byModel = this.placements.get(group) ?? new Map();
    this.placements.set(group, byModel);
    const entry = byModel.get(template.id) ?? { template, matrices: [] };
    byModel.set(template.id, entry);
    entry.matrices.push(matrix.clone());
  }

  get groups(): string[] {
    return [...this.placements.keys()];
  }

  /** One Group per key; `userData.sphere` holds the group's world bounding sphere. */
  build(): { groups: Map<string, THREE.Group>; stats: BatchStats } {
    const groups = new Map<string, THREE.Group>();
    const stats: BatchStats = { batches: 0, instances: 0, triangles: 0 };
    for (const [key, byModel] of this.placements) {
      const group = new THREE.Group();
      group.name = `models:${key}`;
      const box = new THREE.Box3();
      const tmp = new THREE.Box3();
      for (const { template, matrices } of byModel.values()) {
        const batch = new InstancedModel(template.parts, matrices.length);
        for (const mesh of batch.meshes) {
          mesh.castShadow = false;
          mesh.receiveShadow = true;
        }
        for (const m of matrices) {
          batch.addInstance(m);
          tmp.set(new THREE.Vector3(template.bounds.min.x, template.bounds.min.y, template.bounds.min.z), new THREE.Vector3(template.bounds.max.x, template.bounds.max.y, template.bounds.max.z)).applyMatrix4(m);
          box.union(tmp);
        }
        for (const mesh of batch.meshes) mesh.computeBoundingSphere();
        group.add(batch);
        stats.batches += batch.meshes.length;
        stats.instances += matrices.length;
        stats.triangles += template.triangles * matrices.length;
      }
      group.userData.sphere = box.getBoundingSphere(new THREE.Sphere());
      groups.set(key, group);
    }
    return { groups, stats };
  }

  clear(): void {
    this.placements.clear();
  }
}
