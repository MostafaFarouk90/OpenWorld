// Quadtree LOD terrain: chunks from 100 m to 3200 m stream in as the quadtree branches around the
// camera, with vertical skirts along chunk borders to hide cracks without stitching.
// Reference: Vheissu/emerald-bayou.
//
// Each frame `update` refines a forest of root tiles (TERRAIN.maxChunkSize) around the camera.
// A node splits when the camera is within `size * lodSplitFactor` of its footprint. Chunk meshes
// are built off-thread by the WorkerPool; while a node's children are still building, the node's
// own mesh stays visible, so streaming never opens holes. The fallback is local to that node.

import * as THREE from 'three';
import { TERRAIN } from '../config/constants';
import { buildChunkIndices, type ChunkData, type ChunkRequest } from './chunkGeometry';
import { heightAt } from './heightfield';
import { buildPhysicsHeightfield, type PhysicsHeightfield } from './physicsHeightfield';
import { WorkerPool } from './WorkerPool';

class QuadNode {
  children: QuadNode[] | null = null;
  mesh: THREE.Mesh | null = null;
  /** Worker job id while a build is queued or running, else 0. */
  jobId = 0;
  wantSplit = false;

  constructor(
    readonly centerX: number,
    readonly centerZ: number,
    readonly size: number,
  ) {}

  get ready(): boolean {
    return this.mesh !== null;
  }
}

export interface TerrainStats {
  /** Chunk meshes currently resident. */
  chunks: number;
  /** Chunk meshes drawn this frame. */
  visible: number;
  /** Chunk builds queued or running in workers. */
  pending: number;
}

export class TerrainManager {
  readonly group = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly indices: Uint16Array | Uint32Array;
  private readonly pool: WorkerPool;
  private readonly roots = new Map<string, QuadNode>();
  private readonly camera = new THREE.Vector3();
  private cameraHeight = 0;
  private chunkCount = 0;
  private visibleCount = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'terrain';
    scene.add(this.group);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.indices = buildChunkIndices(TERRAIN.chunkSegments);
    this.pool = new WorkerPool(TERRAIN.workerCount);
    this.pool.setPriority((req) => this.distanceTo(req.centerX, req.centerZ, req.size));
  }

  /** Terrain height in metres at world (x, z), sampled synchronously on the calling thread. */
  heightAt(x: number, z: number): number {
    return heightAt(x, z);
  }

  /** Rapier-ready heightfield patch; see physicsHeightfield.ts for the layout. */
  buildPhysicsHeightfield(centerX: number, centerZ: number, size: number, cells: number): PhysicsHeightfield {
    return buildPhysicsHeightfield(centerX, centerZ, size, cells);
  }

  get stats(): TerrainStats {
    return { chunks: this.chunkCount, visible: this.visibleCount, pending: this.pool.pending };
  }

  /** Streams and selects chunks for the given viewpoint. Call once per rendered frame. */
  update(cameraPosition: THREE.Vector3): void {
    this.camera.copy(cameraPosition);
    this.cameraHeight = Math.max(0, cameraPosition.y - heightAt(cameraPosition.x, cameraPosition.z));
    this.updateRoots();
    this.visibleCount = 0;
    for (const root of this.roots.values()) {
      this.refine(root, true);
      this.draw(root);
    }
  }

  dispose(): void {
    for (const root of this.roots.values()) this.disposeNode(root);
    this.roots.clear();
    this.pool.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }

  /** Distance from the camera to a chunk footprint, with the camera's height above ground. */
  private distanceTo(centerX: number, centerZ: number, size: number): number {
    const half = size / 2;
    const dx = Math.max(Math.abs(this.camera.x - centerX) - half, 0);
    const dz = Math.max(Math.abs(this.camera.z - centerZ) - half, 0);
    return Math.sqrt(dx * dx + dz * dz + this.cameraHeight * this.cameraHeight);
  }

  private updateRoots(): void {
    const size = TERRAIN.maxChunkSize;
    const range = TERRAIN.viewDistance;
    const minX = Math.floor((this.camera.x - range) / size);
    const maxX = Math.floor((this.camera.x + range) / size);
    const minZ = Math.floor((this.camera.z - range) / size);
    const maxZ = Math.floor((this.camera.z + range) / size);
    const wanted = new Set<string>();

    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const cx = (ix + 0.5) * size;
        const cz = (iz + 0.5) * size;
        const half = size / 2;
        const dx = Math.max(Math.abs(this.camera.x - cx) - half, 0);
        const dz = Math.max(Math.abs(this.camera.z - cz) - half, 0);
        if (dx * dx + dz * dz > range * range) continue;
        const key = `${ix},${iz}`;
        wanted.add(key);
        if (!this.roots.has(key)) this.roots.set(key, new QuadNode(cx, cz, size));
      }
    }

    for (const [key, root] of this.roots) {
      if (wanted.has(key)) continue;
      this.disposeNode(root);
      this.roots.delete(key);
    }
  }

  /** Updates split decisions and requests the chunks the current view needs. */
  private refine(node: QuadNode, isRoot: boolean): void {
    node.wantSplit =
      node.size > TERRAIN.minChunkSize &&
      this.distanceTo(node.centerX, node.centerZ, node.size) < node.size * TERRAIN.lodSplitFactor;

    // Roots are always built, as the coarse fallback while finer chunks stream in.
    if (!node.wantSplit || isRoot) this.ensureBuilt(node);

    if (node.wantSplit) {
      if (!node.children) node.children = this.createChildren(node);
      for (const child of node.children) this.refine(child, false);
    } else if (node.children) {
      if (node.ready) {
        for (const child of node.children) this.disposeNode(child);
        node.children = null;
      } else {
        // Keep finished children on screen until this coarser chunk is built; stop their builds.
        for (const child of node.children) this.cancelBuilds(child);
      }
    }
  }

  /** True when this node's footprint can be drawn without holes. */
  private covered(node: QuadNode): boolean {
    if (node.ready) return true;
    return node.children !== null && node.children.every((child) => this.covered(child));
  }

  private draw(node: QuadNode): void {
    const children = node.children;
    // Draw children when they fully cover this node, or when this node has nothing to show yet
    // (partial children beat a hole).
    const useChildren =
      children !== null &&
      (!node.ready || (node.wantSplit && children.every((child) => this.covered(child))));

    if (useChildren) {
      if (node.mesh) node.mesh.visible = false;
      for (const child of children) this.draw(child);
      return;
    }
    if (node.mesh) {
      node.mesh.visible = true;
      this.visibleCount++;
    }
    if (children) for (const child of children) this.hide(child);
  }

  private hide(node: QuadNode): void {
    if (node.mesh) node.mesh.visible = false;
    if (node.children) for (const child of node.children) this.hide(child);
  }

  private createChildren(node: QuadNode): QuadNode[] {
    const size = node.size / 2;
    const q = size / 2;
    return [
      new QuadNode(node.centerX - q, node.centerZ - q, size),
      new QuadNode(node.centerX + q, node.centerZ - q, size),
      new QuadNode(node.centerX - q, node.centerZ + q, size),
      new QuadNode(node.centerX + q, node.centerZ + q, size),
    ];
  }

  private ensureBuilt(node: QuadNode): void {
    if (node.mesh || node.jobId) return;
    const request: ChunkRequest = {
      centerX: node.centerX,
      centerZ: node.centerZ,
      size: node.size,
      segments: TERRAIN.chunkSegments,
      skirtDepth: Math.max(node.size * TERRAIN.skirtDepthRatio, TERRAIN.minSkirtDepth),
    };
    node.jobId = this.pool.request(request, (data) => {
      node.jobId = 0;
      node.mesh = this.createMesh(node, data, request.skirtDepth);
      node.mesh.visible = false;
      this.group.add(node.mesh);
      this.chunkCount++;
    });
  }

  private createMesh(node: QuadNode, data: ChunkData, skirtDepth: number): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    // Shared CPU index array; each geometry gets its own attribute so disposal stays independent.
    geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));

    // Bounds from the worker's height range: accurate culling without scanning vertices here.
    const half = node.size / 2;
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-half, data.minY - skirtDepth, -half),
      new THREE.Vector3(half, data.maxY, half),
    );
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(node.centerX, 0, node.centerZ);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  private cancelBuilds(node: QuadNode): void {
    if (node.jobId) {
      this.pool.cancel(node.jobId);
      node.jobId = 0;
    }
    if (node.children) for (const child of node.children) this.cancelBuilds(child);
  }

  private disposeNode(node: QuadNode): void {
    this.cancelBuilds(node);
    if (node.mesh) {
      node.mesh.geometry.dispose();
      this.group.remove(node.mesh);
      node.mesh = null;
      this.chunkCount--;
    }
    if (node.children) for (const child of node.children) this.disposeNode(child);
    node.children = null;
  }
}
