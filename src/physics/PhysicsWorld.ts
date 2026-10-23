import type RAPIER_API from '@dimforge/rapier3d';
import { FIXED_TIMESTEP, WORLD_GRAVITY } from '../config/constants';

export type Rapier = typeof RAPIER_API;
export type Vec3 = { x: number; y: number; z: number };

/**
 * A static terrain heightfield. Matches `PhysicsHeightfield` from src/terrain/physicsHeightfield.ts
 * and the shared contract in contracts/heightfield.md:
 * - `nrows` / `ncols` are cell counts (integers >= 1); rows run along local z, columns along local x.
 * - `heights` holds (nrows + 1) * (ncols + 1) finite samples, column-major:
 *   heights[row + col * (nrows + 1)] is the sample at
 *   x = -scale.x / 2 + col * scale.x / ncols, z = -scale.z / 2 + row * scale.z / nrows.
 * - `scale.x` / `scale.z` are the patch extent in metres; each sample is multiplied by `scale.y`.
 * - The shape is centred on `center`, the collider's world position.
 */
export interface HeightfieldDesc {
  nrows: number;
  ncols: number;
  heights: Float32Array;
  scale: Vec3;
  center: Vec3;
}

export interface RayHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
  collider: RAPIER_API.Collider;
}

/**
 * Read-only queries other modules (combat, camera, AI) may run against the physics world.
 * Queries see colliders as of the last `step()`: a collider added since then is not hit yet.
 */
export interface PhysicsQueries {
  /** Closest hit along a ray, or null. `direction` need not be normalized; `maxDistance` is in metres. */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, exclude?: RAPIER_API.Collider): RayHit | null;
  /** Calls `onHit` for every collider overlapping `shape` at the given pose; return false to stop early. */
  overlapShape(
    shape: RAPIER_API.Shape,
    position: Vec3,
    rotation: RAPIER_API.Rotation,
    onHit: (collider: RAPIER_API.Collider) => boolean,
  ): void;
  /** First hit of `shape` swept along `velocity` for up to `maxToi` (in units of `velocity`), or null. */
  sweepShape(
    shape: RAPIER_API.Shape,
    position: Vec3,
    rotation: RAPIER_API.Rotation,
    velocity: Vec3,
    maxToi: number,
  ): RAPIER_API.ColliderShapeCastHit | null;
}

export type RapierLoader = () => Promise<Rapier>;

const loadRapier: RapierLoader = () => import('@dimforge/rapier3d');

/**
 * Owns the Rapier world. Created once at startup and stepped once per fixed tick, so the
 * simulation is deterministic for a given input sequence.
 * Reference: Viridia's Rapier + Three.js WASM template.
 */
export class PhysicsWorld implements PhysicsQueries {
  private _rapier: Rapier | null = null;
  private _world: RAPIER_API.World | null = null;
  private initPromise: Promise<void> | null = null;

  /** `loader` is injectable so tests can simulate the WASM module failing to load. */
  constructor(private readonly loader: RapierLoader = loadRapier) {}

  /**
   * Loads the Rapier WASM module and creates the world. Concurrent calls share one load.
   * On failure it rejects with a descriptive error, the world stays unusable, and a later call retries.
   */
  init(): Promise<void> {
    this.initPromise ??= this.load().catch((err: unknown) => {
      this.initPromise = null;
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load the Rapier physics engine (WASM): ${reason}`, { cause: err });
    });
    return this.initPromise;
  }

  get ready(): boolean {
    return this._world !== null;
  }

  get rapier(): Rapier {
    if (!this._rapier) throw new Error('PhysicsWorld.init() has not completed');
    return this._rapier;
  }

  get world(): RAPIER_API.World {
    if (!this._world) throw new Error('PhysicsWorld.init() has not completed');
    return this._world;
  }

  /**
   * Frees the Rapier world's WASM memory. The world is unusable afterwards (`ready` is false) until `init()` runs again.
   * Calling it twice, or before `init()` completed, is a no-op.
   */
  dispose(): void {
    const w = this._world;
    if (!w) return;
    this._world = null;
    this.initPromise = null;
    w.free();
  }

  /** Advances the simulation by exactly one fixed tick (FIXED_TIMESTEP). */
  step(): void {
    this.world.step();
  }

  /**
   * Adds a collider with no rigid body (fixed in place) and returns it. Keep walkable cuboids
   * under about 10 m half-extent; use a heightfield (see `flatGround`) for large floors.
   * Queries and the character controller only see it after the next `step()`, so add colliders
   * before the tick's step (e.g. from the fixed update), not between a step and the next tick.
   */
  addStaticCollider(desc: RAPIER_API.ColliderDesc): RAPIER_API.Collider {
    return this.world.createCollider(desc);
  }

  /**
   * Registers a static terrain heightfield (see `HeightfieldDesc` for the layout) and returns its
   * collider. Which chunks get colliders is the terrain module's call; remove them with `removeCollider`.
   * Like `addStaticCollider`, it takes effect for queries at the next `step()`.
   */
  addHeightfield(field: HeightfieldDesc): RAPIER_API.Collider {
    const { nrows, ncols, heights, scale, center } = field;
    if (!Number.isInteger(nrows) || !Number.isInteger(ncols) || nrows < 1 || ncols < 1) {
      throw new Error(`Heightfield nrows and ncols must be integers >= 1, got ${nrows} x ${ncols}`);
    }
    const expected = (nrows + 1) * (ncols + 1);
    if (heights.length !== expected) {
      throw new Error(`Heightfield ${nrows} x ${ncols} needs ${expected} samples, got ${heights.length}`);
    }
    if (!(scale.x > 0 && scale.y > 0 && scale.z > 0) || ![scale.x, scale.y, scale.z].every(Number.isFinite)) {
      throw new Error(`Heightfield scale must be finite and positive, got (${scale.x}, ${scale.y}, ${scale.z})`);
    }
    if (![center.x, center.y, center.z].every(Number.isFinite)) {
      throw new Error(`Heightfield center must be finite, got (${center.x}, ${center.y}, ${center.z})`);
    }
    for (let i = 0; i < heights.length; i++) {
      if (!Number.isFinite(heights[i])) throw new Error(`Heightfield sample ${i} is not finite (${heights[i]})`);
    }
    const desc = this.rapier.ColliderDesc.heightfield(nrows, ncols, heights, scale).setTranslation(
      center.x,
      center.y,
      center.z,
    );
    return this.addStaticCollider(desc);
  }

  /** Removes a collider. Removing one that is already gone is a no-op. */
  removeCollider(collider: RAPIER_API.Collider): void {
    if (!this.world.colliders.contains(collider.handle)) return;
    this.world.removeCollider(collider, false);
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance: number, exclude?: RAPIER_API.Collider): RayHit | null {
    const len = Math.hypot(direction.x, direction.y, direction.z);
    if (len === 0 || !Number.isFinite(len) || !(maxDistance > 0)) return null;
    const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
    const ray = new this.rapier.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, exclude);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: hit.timeOfImpact,
      collider: hit.collider,
    };
  }

  overlapShape(
    shape: RAPIER_API.Shape,
    position: Vec3,
    rotation: RAPIER_API.Rotation,
    onHit: (collider: RAPIER_API.Collider) => boolean,
  ): void {
    this.world.intersectionsWithShape(position, rotation, shape, onHit);
  }

  sweepShape(
    shape: RAPIER_API.Shape,
    position: Vec3,
    rotation: RAPIER_API.Rotation,
    velocity: Vec3,
    maxToi: number,
  ): RAPIER_API.ColliderShapeCastHit | null {
    return this.world.castShape(position, rotation, velocity, shape, 0, maxToi, true);
  }

  private async load(): Promise<void> {
    const rapier = await this.loader();
    const world = new rapier.World(WORLD_GRAVITY);
    world.timestep = FIXED_TIMESTEP;
    this._rapier = rapier;
    this._world = world;
  }
}
