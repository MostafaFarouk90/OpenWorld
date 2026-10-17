// Quadtree LOD terrain: chunks from 100 m to 3200 m stream in as the quadtree branches around the
// camera, with vertical skirts along chunk borders to hide cracks without stitching.
// Reference: Vheissu/emerald-bayou.
//
// This class is the Three.js adapter: quadtree.ts decides which chunks exist and are drawn,
// WorkerPool builds their geometry off-thread, and this class turns results into meshes.

import * as THREE from 'three';
import { TERRAIN } from '../config/constants';
import { buildChunkIndices, type ChunkData, type ChunkRequest } from './chunkGeometry';
import { heightAt } from './heightfield';
import { buildPhysicsHeightfield, type PhysicsHeightfield } from './physicsHeightfield';
import { LodQuadtree, type QuadNode, type QuadtreeHost } from './quadtree';
import { WorkerPool, type WorkerFactory } from './WorkerPool';

export interface TerrainStats {
  /** Chunk meshes currently resident. */
  chunks: number;
  /** Chunk meshes drawn this frame. */
  visible: number;
  /** Chunk builds queued or running in workers. */
  pending: number;
}

type ChunkNode = QuadNode<THREE.Mesh>;

export function skirtDepthFor(size: number): number {
  return Math.max(size * TERRAIN.skirtDepthRatio, TERRAIN.minSkirtDepth);
}

export class TerrainManager {
  readonly group = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly indices: Uint16Array | Uint32Array;
  private readonly pool: WorkerPool;
  private readonly tree: LodQuadtree<THREE.Mesh>;
  private readonly jobs = new Map<ChunkNode, number>();
  private chunkCount = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, workerFactory?: WorkerFactory) {
    this.group.name = 'terrain';
    scene.add(this.group);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.indices = buildChunkIndices(TERRAIN.chunkSegments);
    this.pool = new WorkerPool(TERRAIN.workerCount, workerFactory);

    const host: QuadtreeHost<THREE.Mesh> = {
      build: (node) => this.requestBuild(node),
      cancel: (node) => {
        const id = this.jobs.get(node);
        if (id !== undefined) this.pool.cancel(id);
        this.jobs.delete(node);
      },
      release: (_node, mesh) => this.releaseMesh(mesh),
      setVisible: (_node, mesh, visible) => {
        mesh.visible = visible;
      },
    };
    this.tree = new LodQuadtree(host, TERRAIN, heightAt);
    this.pool.setPriority((req) => this.tree.distanceTo(req.centerX, req.centerZ, req.size));
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
    return { chunks: this.chunkCount, visible: this.tree.visibleCount, pending: this.pool.pending };
  }

  /** Streams and selects chunks for the given viewpoint. Call once per rendered frame. */
  update(cameraPosition: THREE.Vector3): void {
    if (this.disposed) return;
    // Dispatch after the whole frame's requests are queued, so the nearest chunks go first.
    this.pool.batch(() => this.tree.update(cameraPosition));
  }

  /** Frees every chunk, terminates the workers and detaches from the scene. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Pool first, so cancelling the tree's builds cannot dispatch queued jobs to doomed workers.
    this.pool.dispose();
    this.tree.dispose();
    this.jobs.clear();
    this.material.dispose();
    this.group.removeFromParent();
  }

  private requestBuild(node: ChunkNode): void {
    const request: ChunkRequest = {
      centerX: node.centerX,
      centerZ: node.centerZ,
      size: node.size,
      segments: TERRAIN.chunkSegments,
      skirtDepth: skirtDepthFor(node.size),
    };
    const id = this.pool.request(request, {
      onDone: (data) => {
        this.jobs.delete(node);
        if (this.disposed) return;
        const mesh = this.createMesh(node, data, request.skirtDepth);
        if (this.tree.complete(node, mesh)) {
          this.group.add(mesh);
          this.chunkCount++;
        }
      },
      onError: (error) => {
        this.jobs.delete(node);
        console.warn(`Terrain chunk build failed at (${node.centerX}, ${node.centerZ}): ${error}`);
        this.tree.fail(node);
      },
    });
    this.jobs.set(node, id);
  }

  private createMesh(node: ChunkNode, data: ChunkData, skirtDepth: number): THREE.Mesh {
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
    mesh.name = `terrain-chunk-${node.size}@${node.centerX},${node.centerZ}`;
    mesh.position.set(node.centerX, 0, node.centerZ);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    return mesh;
  }

  private releaseMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    if (mesh.parent) {
      mesh.removeFromParent();
      this.chunkCount--;
    }
  }
}
