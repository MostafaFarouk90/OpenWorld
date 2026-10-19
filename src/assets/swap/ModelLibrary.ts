import * as THREE from 'three';
import { extractMeshParts, type MeshPart } from '../instancing';
import { fitToBox, type Bounds, type FitPolicy, type FitTarget, type Fit } from './fit';

/** The part of AssetLoader the library needs; tests pass stand-ins. */
export interface ModelSource {
  load(id: string): Promise<unknown>;
  instantiate(id: string): THREE.Object3D;
  /** Optional: the pack a model belongs to, so one atlas material is shared per pack. */
  packOf?(id: string): string | undefined;
}

/** A loaded static model reduced to baked mesh parts and measured bounds. */
export interface ModelTemplate {
  id: string;
  parts: MeshPart[];
  bounds: Bounds;
  triangles: number;
}

/**
 * Loads swap models once and hands out templates. A model that is missing or fails to load resolves to null and warns once, so
 * the caller keeps its greybox. Nothing here rejects.
 */
export class ModelLibrary {
  private readonly pending = new Map<string, Promise<ModelTemplate | null>>();
  private readonly ready = new Map<string, ModelTemplate>();
  private readonly failed = new Set<string>();
  private readonly atlas = new Map<string, THREE.Material>();
  private disposed = false;

  constructor(
    private readonly source: ModelSource | undefined,
    private readonly warn: (message: string) => void = (m) => console.warn(m),
  ) {}

  /** The template for `id`, or null (no source, load failure, or disposed). */
  template(id: string): Promise<ModelTemplate | null> {
    const cached = this.pending.get(id);
    if (cached) return cached;
    const p = this.build(id);
    this.pending.set(id, p);
    return p;
  }

  /** Loads several; resolves to the templates that arrived (in request order, nulls dropped). */
  async preload(ids: readonly string[]): Promise<ModelTemplate[]> {
    const all = await Promise.all(ids.map((id) => this.template(id)));
    return all.filter((t): t is ModelTemplate => t !== null);
  }

  /** The template if already loaded, else null (never triggers a load). */
  peek(id: string): ModelTemplate | null {
    return this.ready.get(id) ?? null;
  }

  /** True once `id` failed to load (so callers can stop retrying). */
  hasFailed(id: string): boolean {
    return this.failed.has(id);
  }

  /** A fresh object placing the template's parts as plain meshes (geometry and material shared, not owned). */
  async instance(id: string, fit?: Fit): Promise<THREE.Object3D | null> {
    const t = await this.template(id);
    return t ? ModelLibrary.object(t, fit) : null;
  }

  static object(t: ModelTemplate, fit?: Fit): THREE.Object3D {
    const g = new THREE.Group();
    g.name = `model:${t.id}`;
    for (const part of t.parts) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.castShadow = false;
      m.receiveShadow = true;
      g.add(m);
    }
    if (fit) {
      g.scale.set(fit.sx, fit.sy, fit.sz);
      g.position.set(fit.offset.x, fit.offset.y, fit.offset.z);
    }
    g.userData.ownsGeometry = false;
    return g;
  }

  /** Fit of a template into a box, measured from its real geometry. */
  fit(t: ModelTemplate, target: FitTarget, policy?: FitPolicy): Fit {
    return fitToBox(t.bounds, target, policy);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.ready.values()) for (const p of t.parts) p.geometry.dispose();
    this.ready.clear();
    this.pending.clear();
    this.atlas.clear();
  }

  private async build(id: string): Promise<ModelTemplate | null> {
    if (!this.source) return null;
    try {
      await this.source.load(id);
      if (this.disposed) return null;
      const root = this.source.instantiate(id);
      // The baked door leaves and portcullis bars: the core's Door and the city's portcullis are the only moving parts.
      const doors: THREE.Object3D[] = [];
      root.traverse((o) => o !== root && /_door(_left|_right)?$/i.test(o.name) && doors.push(o));
      for (const o of doors) o.removeFromParent();
      const parts = extractMeshParts(root);
      if (parts.length === 0) throw new Error('no static meshes');
      const pack = this.source.packOf?.(id);
      if (pack) {
        // Every file of a pack carries its own copy of the atlas material; share the first so batches merge.
        const shared = this.atlas.get(pack) ?? parts[0].material;
        this.atlas.set(pack, shared);
        for (const p of parts) p.material = shared;
      }
      const box = new THREE.Box3();
      let triangles = 0;
      for (const p of parts) {
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox!);
        triangles += (p.geometry.index?.count ?? p.geometry.getAttribute('position').count) / 3;
      }
      const t: ModelTemplate = { id, parts, bounds: { min: box.min.clone(), max: box.max.clone() }, triangles };
      this.ready.set(id, t);
      return t;
    } catch (err) {
      if (!this.failed.has(id)) {
        this.failed.add(id);
        this.warn(`ModelLibrary: "${id}" unavailable (${err instanceof Error ? err.message : String(err)}); keeping the greybox`);
      }
      return null;
    }
  }
}

const shared = new WeakMap<object, ModelLibrary>();

/**
 * The one library per AssetLoader, so the region, the city, the interiors and the props share loads and the pack atlas
 * material. Without a loader (headless tests) it is a library with no source: every template is null and callers keep the greybox.
 */
export function modelLibraryFor(assets: (ModelSource & object) | null | undefined): ModelLibrary {
  if (!assets) return new ModelLibrary(undefined);
  let lib = shared.get(assets);
  if (!lib || lib.isDisposed) {
    lib = new ModelLibrary(assets);
    shared.set(assets, lib);
  }
  return lib;
}
