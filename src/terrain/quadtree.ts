// Pure quadtree LOD logic with no Three.js imports: root tile streaming, split and merge decisions,
// and which nodes to draw. A host (TerrainManager) supplies chunk builds and visibility through
// callbacks, so this file is unit-testable without WebGL or workers.
// Reference: Vheissu/emerald-bayou.
//
// Rules:
// - Root tiles (maxChunkSize) are kept while their footprint is within viewDistance of the camera.
// - A node splits when the camera's distance to its footprint (horizontal gap combined with the
//   camera's height above ground) is below size * lodSplitFactor, down to minChunkSize.
// - Leaves and roots are built; roots are the coarse fallback while finer chunks stream in.
// - A node shows its children only once they fully cover it, so streaming never opens holes, and
//   the fallback is local to that node. A node with nothing built shows whatever children it has.
// - On merge, children stay drawn (their pending builds cancelled) until the parent is built.

export interface LodSettings {
  minChunkSize: number;
  maxChunkSize: number;
  lodSplitFactor: number;
  viewDistance: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export class QuadNode<T> {
  children: QuadNode<T>[] | null = null;
  /** Built chunk payload (a mesh, for TerrainManager). */
  data: T | null = null;
  building = false;
  wantSplit = false;
  visible = false;
  disposed = false;
  /** Consecutive failed builds, for retry backoff. */
  failures = 0;
  /** Earliest update() frame at which a failed build is requested again. */
  retryFrame = 0;

  constructor(
    readonly centerX: number,
    readonly centerZ: number,
    readonly size: number,
  ) {}

  get ready(): boolean {
    return this.data !== null;
  }
}

export interface QuadtreeHost<T> {
  /** Start building `node`; later call `tree.complete(node, data)` or `tree.fail(node)`. */
  build(node: QuadNode<T>): void;
  /** Stop a build started with `build` (its completion, if it still arrives, is ignored). */
  cancel(node: QuadNode<T>): void;
  /** Free a payload that is no longer needed. */
  release(node: QuadNode<T>, data: T): void;
  /** Called when a built node's visibility changes. */
  setVisible(node: QuadNode<T>, data: T, visible: boolean): void;
}

/** Frames to wait before re-requesting a failed build, growing with consecutive failures. */
export function retryDelayFrames(failures: number): number {
  return Math.min(30 * 2 ** (failures - 1), 600);
}

export class LodQuadtree<T> {
  readonly roots = new Map<string, QuadNode<T>>();
  private camX = 0;
  private camY = 0;
  private camZ = 0;
  private camHeight = 0;
  private frame = 0;
  private visibleNodes = 0;

  constructor(
    private readonly host: QuadtreeHost<T>,
    private readonly settings: LodSettings,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {}

  /** Nodes drawn after the last update. */
  get visibleCount(): number {
    return this.visibleNodes;
  }

  /** Distance from the last camera position to a footprint, including height above ground. */
  distanceTo(centerX: number, centerZ: number, size: number): number {
    const half = size / 2;
    const dx = Math.max(Math.abs(this.camX - centerX) - half, 0);
    const dz = Math.max(Math.abs(this.camZ - centerZ) - half, 0);
    return Math.sqrt(dx * dx + dz * dz + this.camHeight * this.camHeight);
  }

  /** True when a node of this footprint should split for the current camera. */
  shouldSplit(centerX: number, centerZ: number, size: number): boolean {
    return (
      size > this.settings.minChunkSize &&
      this.distanceTo(centerX, centerZ, size) < size * this.settings.lodSplitFactor
    );
  }

  update(camera: Vec3Like): void {
    if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y) || !Number.isFinite(camera.z)) return;
    this.frame++;
    this.camX = camera.x;
    this.camY = camera.y;
    this.camZ = camera.z;
    this.camHeight = Math.max(0, this.camY - this.groundHeight(camera.x, camera.z));
    this.updateRoots();
    this.visibleNodes = 0;
    for (const root of this.roots.values()) {
      this.refine(root, true);
      this.draw(root);
    }
  }

  /** Attaches a finished build. Returns false (and releases `data`) if the node no longer wants it. */
  complete(node: QuadNode<T>, data: T): boolean {
    if (node.disposed || !node.building || node.data !== null) {
      this.host.release(node, data);
      return false;
    }
    node.building = false;
    node.failures = 0;
    node.data = data;
    node.visible = false;
    this.host.setVisible(node, data, false);
    return true;
  }

  /** Records a failed build; the node is re-requested after a backoff. */
  fail(node: QuadNode<T>): void {
    if (node.disposed || !node.building) return;
    node.building = false;
    node.failures++;
    node.retryFrame = this.frame + retryDelayFrames(node.failures);
  }

  dispose(): void {
    for (const root of this.roots.values()) this.disposeNode(root);
    this.roots.clear();
    this.visibleNodes = 0;
  }

  private updateRoots(): void {
    const size = this.settings.maxChunkSize;
    const range = this.settings.viewDistance;
    const half = size / 2;
    const wanted = new Set<string>();
    const minX = Math.floor((this.camX - range) / size);
    const maxX = Math.floor((this.camX + range) / size);
    const minZ = Math.floor((this.camZ - range) / size);
    const maxZ = Math.floor((this.camZ + range) / size);

    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const cx = (ix + 0.5) * size;
        const cz = (iz + 0.5) * size;
        const dx = Math.max(Math.abs(this.camX - cx) - half, 0);
        const dz = Math.max(Math.abs(this.camZ - cz) - half, 0);
        if (dx * dx + dz * dz > range * range) continue;
        const key = `${ix},${iz}`;
        wanted.add(key);
        if (!this.roots.has(key)) this.roots.set(key, new QuadNode<T>(cx, cz, size));
      }
    }

    for (const [key, root] of this.roots) {
      if (wanted.has(key)) continue;
      this.disposeNode(root);
      this.roots.delete(key);
    }
  }

  private refine(node: QuadNode<T>, isRoot: boolean): void {
    node.wantSplit = this.shouldSplit(node.centerX, node.centerZ, node.size);

    if (!node.wantSplit || isRoot) this.ensureBuilt(node);

    if (node.wantSplit) {
      if (!node.children) node.children = this.createChildren(node);
      for (const child of node.children) this.refine(child, false);
    } else if (node.children) {
      if (node.ready) {
        for (const child of node.children) this.disposeNode(child);
        node.children = null;
      } else {
        for (const child of node.children) this.cancelBuilds(child);
      }
    }
  }

  private covered(node: QuadNode<T>): boolean {
    if (node.ready) return true;
    return node.children !== null && node.children.every((child) => this.covered(child));
  }

  private draw(node: QuadNode<T>): void {
    const children = node.children;
    const useChildren =
      children !== null &&
      (!node.ready || (node.wantSplit && children.every((child) => this.covered(child))));

    if (useChildren) {
      this.setVisible(node, false);
      for (const child of children) this.draw(child);
      return;
    }
    this.setVisible(node, true);
    if (children) for (const child of children) this.hide(child);
  }

  private hide(node: QuadNode<T>): void {
    this.setVisible(node, false);
    if (node.children) for (const child of node.children) this.hide(child);
  }

  private setVisible(node: QuadNode<T>, visible: boolean): void {
    if (node.data === null) return;
    if (visible) this.visibleNodes++;
    if (node.visible === visible) return;
    node.visible = visible;
    this.host.setVisible(node, node.data, visible);
  }

  private createChildren(node: QuadNode<T>): QuadNode<T>[] {
    const size = node.size / 2;
    const q = size / 2;
    return [
      new QuadNode<T>(node.centerX - q, node.centerZ - q, size),
      new QuadNode<T>(node.centerX + q, node.centerZ - q, size),
      new QuadNode<T>(node.centerX - q, node.centerZ + q, size),
      new QuadNode<T>(node.centerX + q, node.centerZ + q, size),
    ];
  }

  private ensureBuilt(node: QuadNode<T>): void {
    if (node.data !== null || node.building || this.frame < node.retryFrame) return;
    node.building = true;
    this.host.build(node);
  }

  private cancelBuilds(node: QuadNode<T>): void {
    if (node.building) {
      node.building = false;
      this.host.cancel(node);
    }
    if (node.children) for (const child of node.children) this.cancelBuilds(child);
  }

  private disposeNode(node: QuadNode<T>): void {
    this.cancelBuilds(node);
    node.disposed = true;
    if (node.data !== null) {
      const data = node.data;
      node.data = null;
      node.visible = false;
      this.host.release(node, data);
    }
    if (node.children) for (const child of node.children) this.disposeNode(child);
    node.children = null;
  }
}
