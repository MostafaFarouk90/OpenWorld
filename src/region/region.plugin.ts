// Plugin `region`: lays the Brightwater tutorial footprint onto the terrain (anchors, triggers, greybox
// structures, props, the scarecrow, barley), exposes the `region` service and reports region changes.
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import { heightAt } from '../terrain/heightfield';
import { BuildingLookup } from './buildingLookup';
import { barleyVariantOf, buildBarley } from './barley';
import { buildCorridorScenery } from './corridorScenery';
import { DEAD_ROAD_FULL, LANE_TRACK_DRAWN, LANE_WIDTH, ROAD_WIDTH } from './deadRoad';
import { FOG_WALL_X } from './corridor.layout';
import { installContainment } from './containmentSystem';
import { buildFogWallDef, fogWalls } from './fogWall';
import { pointInFootprint } from './geometry';
import { distanceToPolyline, GrassField, type GrassAccept } from './grass';
import { drawnWidth } from './act2/act2Roads';
import { ACT2_ROAD_STRIPS } from './act2/act2World';
import { buildPoiProps } from './poiProps';
import { watchTollPost } from './tollPost';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import type { CoreContext, GamePlugin } from './coreTypes';
import type { LayoutData } from './layoutTypes';
import type { PhysicsQueries } from '../physics/PhysicsWorld';
import { buildProps } from './props';
import { regionAt } from './regionMask';
import { resolveLayout } from './resolveLayout';
import { SCARECROW_TOPPLED_FLAG, spawnScarecrow } from './scarecrow';
import type { RegionService } from './serviceTypes';
import { buildStructures, coreFactories } from './StructureBuilder';
import { createStructureArt } from './structureArt';
import { REGION_STRINGS_EN } from './strings.en';
import { validateLayout } from './validateLayout';
import { CENTER as CITY_CENTER, MAX_STRUCTURE_RADIUS } from '../harrowmark/city';
import { BROOK_COURSE, BROOK_WIDTH, RIVER_COURSE, RIVER_WIDTH } from './water';

export interface RegionPluginOptions {
  /** One layout only (tests). Without `layout` or `layouts` the plugin lays out Brightwater and the Dead Road. */
  layout?: LayoutData;
  /**
   * Several layouts resolved together. Only anchors, triggers and structures are used from the later ones; the first
   * holds the barley fields and the tutorial spawn (NPCs are read from BRIGHTWATER_LAYOUT by the npcs plugin).
   */
  layouts?: LayoutData[];
  heightAt?: (x: number, z: number) => number;
}

/** The flag that makes a region's `discover` fire once per save: `place.<regionId>.discovered`. */
export const discoveredFlag = (regionId: string): string => `place.${regionId}.discovered`;
export const BRIGHTWATER_DISCOVERED_FLAG = discoveredFlag('brightwater');
/** R01's field state (thread 6 writes `'scorched'` or `'saved'`). */
export const BARLEY_FLAG = 'world.brightwater.barley';

/** Grass density by quality step: the low step draws half the tufts. */
export const GRASS_DENSITY = { low: 0.5, medium: 1, high: 1 } as const;

/** `?grass=off` turns the meadow grass off, to compare frame rates on a weak GPU. */
export function grassEnabled(search: string): boolean {
  return new URLSearchParams(search).get('grass') !== 'off';
}

/** A ray straight down from this high above the ground finds fences, walls and props standing on it. */
const COLLIDER_PROBE_HEIGHT = 6;

/** The slice of the physics queries the grass check uses. */
type RayQuery = Pick<PhysicsQueries, 'raycast'>;

/**
 * True when a static collider stands on the ground at (x, z): a downward ray from 6 m hits something above the
 * ground. Sensors and moving bodies (the player, NPCs, enemies) hide what is under them, so they count as clear;
 * the footprint check still covers buildings.
 */
export function staticColliderAt(physics: RayQuery, x: number, ground: number, z: number): boolean {
  const hit = physics.raycast({ x, y: ground + COLLIDER_PROBE_HEIGHT, z }, { x: 0, y: -1, z: 0 }, COLLIDER_PROBE_HEIGHT + 0.5);
  if (!hit) return false;
  if (hit.collider.isSensor()) return false;
  const body = hit.collider.parent();
  if (body && !body.isFixed()) return false;
  return hit.point.y > ground + 0.1;
}

/** Inside this radius of Harrowmark's centre is the walled city: streets and yards, no grass. */
export const CITY_NO_GRASS_RADIUS = MAX_STRUCTURE_RADIUS + 4;

/**
 * Where grass may grow: everywhere outside Harrowmark's walls (Brightwater, the Dead Road corridor and the farms around
 * the city), never in the water, on the Dead Road or the lane, inside a structure's footprint (a tuft would poke
 * through a floor) or under any static collider. (Every Harrowmark structure stands inside the wall's radius.)
 */
export function grassAcceptFor(layouts: readonly LayoutData[], heightAt: (x: number, z: number) => number, physics?: RayQuery): GrassAccept {
  // A bounding radius per structure skips the rotated-footprint test for all but the few nearby.
  const structures = layouts.flatMap((l) => l.structures).map((st) => ({ st, reach: Math.hypot(st.footprint[0], st.footprint[1]) / 2 + 0.4 }));
  const strips: Array<[readonly (readonly [number, number])[], number]> = [
    [RIVER_COURSE, RIVER_WIDTH / 2 + 0.5],
    [BROOK_COURSE, BROOK_WIDTH / 2 + 0.5],
    [DEAD_ROAD_FULL, ROAD_WIDTH / 2 + 0.3],
    [LANE_TRACK_DRAWN, LANE_WIDTH / 2 + 0.3],
    // The Act 2 roads' gravel ribbons (thread A1), as wide as drawn.
    ...ACT2_ROAD_STRIPS.map((r) => [r.points, drawnWidth(r.halfWidth) / 2 + 0.3] as [readonly (readonly [number, number])[], number]),
  ];
  // A padded box per strip skips the polyline walk for every strip far from the tuft.
  const boxed = strips.map(([pts, half]) => ({
    pts,
    half,
    minX: Math.min(...pts.map((p) => p[0])) - half,
    maxX: Math.max(...pts.map((p) => p[0])) + half,
    minZ: Math.min(...pts.map((p) => p[1])) - half,
    maxZ: Math.max(...pts.map((p) => p[1])) + half,
  }));
  return (x, z) =>
    Math.hypot(x - CITY_CENTER.x, z - CITY_CENTER.z) > CITY_NO_GRASS_RADIUS &&
    !boxed.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && distanceToPolyline(b.pts, x, z) < b.half) &&
    !structures.some(({ st, reach }) => Math.abs(x - st.x) <= reach && Math.abs(z - st.z) <= reach && pointInFootprint(st, x, z, 0.4)) &&
    !(physics && staticColliderAt(physics, x, heightAt(x, z), z));
}

export function createRegionPlugin(opts: RegionPluginOptions = {}): GamePlugin {
  const layouts = opts.layouts ?? (opts.layout ? [opts.layout] : [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT]);
  const layout = layouts[0];
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('region: teardown step failed', err);
      }
    }
  };

  return {
    id: 'region',
    dependsOn: ['core'],
    setup(ctx: CoreContext) {
      try {
        // The layout is static data; checking it costs a 250k-cell flood fill, so only dev builds and tests pay.
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          // Only the first layout holds the tutorial spawn the flood fill starts from.
          const errors = layouts.flatMap((l, i) => validateLayout(l, height, i === 0 ? {} : { spawnId: null }));
          if (errors.length) throw new Error(`region: invalid layout:\n${errors.join('\n')}`);
        }

        cleanups.push(ctx.strings.register('en', REGION_STRINGS_EN));

        for (const l of layouts) {
          const resolved = resolveLayout(l, height);
          for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
          for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));
        }

        const lookup = new BuildingLookup(undefined, undefined, createStructureArt(modelLibraryFor(ctx.assets)));
        const built = layouts.map((l) => buildStructures({ ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) }, l, height, lookup));
        for (const structures of built) {
          cleanups.push(() => structures.dispose());
          void structures.upgrade();
        }

        // Wynn's field takes R01's outcome and re-derives it on a loaded save.
        const solid = layout.structures.filter((st) => st.mode !== 'open');
        let barley = buildBarley(layout.fields, height, 1, solid);
        ctx.scene.add(barley.object);
        let shown = 'unset';
        const swapBarley = (): void => {
          const variant = barleyVariantOf(ctx.state.getFlag(BARLEY_FLAG));
          if (variant === shown) return;
          shown = variant;
          barley.dispose();
          barley = buildBarley(layout.fields, height, 1, solid, {
            variant,
            variantFields: ['barley-west'],
          });
          ctx.scene.add(barley.object);
        };
        // The value changes between two truthy words, which a boolean gate would not notice: listen for the key and for loads.
        cleanups.push(ctx.events.on('flag.changed', (e: { key?: string } | undefined) => e?.key === BARLEY_FLAG && swapBarley()));
        cleanups.push(ctx.events.on('save.loaded', swapBarley));
        cleanups.push(() => {
          ctx.scene.remove(barley.object);
          barley.dispose();
        });
        swapBarley();

        // The corridor beyond Kettlewick: road, water, reeds; the Leap POIs; the toll-post flag (the actor is the enemies module's); the slice fog wall.
        const scenery = buildCorridorScenery(height);
        ctx.scene.add(scenery.object);
        cleanups.push(() => scenery.dispose());
        const poi = buildPoiProps(ctx, ctx.anchors);
        cleanups.push(() => poi.dispose());
        cleanups.push(watchTollPost(ctx));
        // Every registered fog wall whose anchor exists (v0.6 data). The slice wall keeps its x at FOG_WALL_X.
        for (const def of fogWalls()) {
          const fogAnchor = ctx.anchors.find(def.anchorId);
          if (!fogAnchor || !ctx.physics.rapier) continue;
          const x = def.id === 'fog.harrowmark' ? FOG_WALL_X : fogAnchor.position.x;
          const fog = buildFogWallDef({ ...ctx, rapier: ctx.physics.rapier }, def, { x, y: fogAnchor.position.y, z: fogAnchor.position.z });
          cleanups.push(() => fog.dispose());
        }

        // Meadow grass around the player, thinned on the low quality step; `?grass=off` leaves it out.
        if (grassEnabled(typeof location === 'undefined' ? '' : location.search)) {
          const physics = typeof ctx.physics.raycast === 'function' ? ctx.physics : undefined;
          const grass = new GrassField(height, grassAcceptFor(layouts, height, physics));
          ctx.scene.add(grass.object);
          cleanups.push(() => grass.dispose());
          cleanups.push(
            ctx.systems.add({
              id: 'region.grass',
              renderPhase: 'world',
              order: 90,
              render: () => {
                // Queries see colliders only after a physics step: wait for the first tick so fences are found.
                if (ctx.clock.tick === 0) return;
                const step = ctx.services.get('quality')?.step;
                if (step) grass.setDensity(GRASS_DENSITY[step]);
                const f = ctx.player.feet;
                grass.update(f.x, f.y, f.z);
              },
            }),
          );
        }

        const props = buildProps({ ...ctx, ...coreFactories(ctx) }, ctx.anchors);
        cleanups.push(() => props.dispose());

        // A scarecrow already knocked down in this save stays down (checked again when a save loads).
        const anchorOf = () => ctx.anchors.get('brightwater.scarecrow');
        let scarecrow = ctx.state.getBool(SCARECROW_TOPPLED_FLAG) ? null : spawnScarecrow(ctx, anchorOf(), height);
        cleanups.push(() => scarecrow?.dispose());
        cleanups.push(
          ctx.events.on('save.loaded', () => {
            // Resync both ways: a save from before the topple stands the scarecrow up again.
            scarecrow?.dispose();
            scarecrow = ctx.state.getBool(SCARECROW_TOPPLED_FLAG) ? null : spawnScarecrow(ctx, anchorOf(), height);
          }),
        );

        // The training dummies belong to the core; move them into the Practice Yard when it can.
        const dummies = ctx.services.get('dummies');
        try {
          dummies?.place(['yard.dummy-1', 'yard.dummy-2'].map((id) => {
            const a = ctx.anchors.get(id);
            return { feet: a.position, yaw: a.yaw };
          }));
        } catch (err) {
          console.warn('region: could not place the training dummies', err);
        }

        const service: RegionService = {
          at: regionAt,
          waystoneObject(anchorId) {
            const stone = ctx.anchors.find(anchorId);
            if (!stone?.tags?.includes('waystone')) return undefined;
            const key = anchorId.replace('.', '-');
            for (const structures of built) {
              const found = structures.objectById.get(key);
              if (found) return found;
            }
            return undefined;
          },
        };
        cleanups.push(ctx.services.provide('region', service));

        // Containment (v0.6): provides `containment`; its push-back runs before the tracker below.
        const containment = installContainment(ctx, height);
        cleanups.push(() => containment.dispose());

        let current: string | null = null;
        cleanups.push(
          ctx.systems.add({
            id: 'region-tracker',
            fixedPhase: 'intent',
            order: -90,
            fixedUpdate() {
              const { x, z } = ctx.player.feet;
              const now = regionAt(x, z)?.id ?? null;
              if (now === current) return;
              const previous = current;
              current = now;
              if (!now) return;
              ctx.events.emit('region.entered', { regionId: now, previous });
              const flag = discoveredFlag(now);
              if (!ctx.state.getBool(flag)) {
                ctx.state.setFlag(flag, true);
                ctx.events.emit('discover', { placeId: now, kind: 'region' });
              }
            },
          }),
        );
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createRegionPlugin();
