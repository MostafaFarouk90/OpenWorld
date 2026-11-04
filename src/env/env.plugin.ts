// Plugin `env`: the environment pass. Draws each tile's placement rows (vegetation, hedges, clutter) with instancing, thinned by the
// quality step and hidden by distance. Cosmetic scenery: no anchors, no flags, so a failure here costs only the dressing (nothing depends
// on it). The solid pieces (fence and wall runs, carts, hearths, stall tables, B-tile trunks) also get simple static colliders streamed
// around the player (src/env/colliders.ts); `?env=off` creates none. Tiles are added in src/env/tiles.ts as the pass builds them; with none registered the plugin does nothing.
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import type { FireLightProvider } from '../tutorial/CrisisDressing';
import { heightAt } from '../terrain/heightfield';
import { EnvModelSource } from './envSource';
import { buildTileColliders, type ColliderStats } from './colliders';
import { defaultKeepOut } from './colliderKeepOut';
import { ColliderStreamer } from './colliderStreamer';
import { EnvGlow, type GlowCounts } from './glow';
import type { KeepOut } from './colliders';
import { PlacementField, type PlacementRow } from './PlacementField';
import { LAZY_TILES, TILES } from './tiles';

export interface EnvPluginOptions {
  tiles?: Readonly<Record<string, readonly PlacementRow[]>>;
  /** Tiles whose rows load on demand (default: the Dead Road tiles, unless `tiles` is given). */
  lazyTiles?: Readonly<Record<string, () => Promise<readonly PlacementRow[]>>>;
  heightAt?: (x: number, z: number) => number;
  /** Keep-walkable list for the colliders (default: the shipped lanes, chase lines, triggers, anchors and doors). */
  keepOut?: KeepOut;
}

/** Colliders in the physics world and what each tile made (tests, debug, shot harness). */
export interface ColliderCounts {
  /** Static cuboids in the physics world now. */
  live: number;
  liveCells: number;
  /** Boxes registered across the built tiles. */
  total: number;
  tiles: Record<string, ColliderStats>;
}

export interface EnvService {
  /** Instances drawn per class for a tile (tests, debug); null for an unknown tile. */
  drawn(tile: string): Record<string, number> | null;
  /** Rows that fell back to a scripted placeholder for a tile. */
  placeholders(tile: string): number | null;
  /** Measure the distance culling from (x, z) instead of the player (the shot harness frames a far camera without moving the Knight); null returns to the player. */
  focus(point: { x: number; z: number } | null): void;
  /** What the glow system holds right now (tests, debug, shot harness): the pooled lights, the fires it knows, the flickering materials. */
  glow(): GlowCounts;
  /** The pooled fire light, in the shape the tutorial's CrisisDressing takes (`deps.lights`): one slot of the glow pool at a time, null on Low. */
  readonly fireLights: FireLightProvider;
  /** The colliders the plugin keeps around the player; all zero before physics is ready and in headless runs. */
  colliders(): ColliderCounts;
}

declare module '../core/Services' {
  interface GameServices {
    env: EnvService;
  }
}

/** `?env=off` leaves the environment dressing out (frame-rate comparisons, like `?grass=off`). */
export function envEnabled(search: string): boolean {
  return new URLSearchParams(search).get('env') !== 'off';
}

/** The loaded Rapier module, or null while physics is still starting (the getter throws until `init()` completes; the fake core has none). */
function readRapier(ctx: CoreContext): NonNullable<ColliderStreamerRapier> | null {
  try {
    return ctx.physics.rapier ?? null;
  } catch {
    return null;
  }
}
type ColliderStreamerRapier = CoreContext['physics']['rapier'];

export function createEnvPlugin(opts: EnvPluginOptions = {}): GamePlugin {
  const tiles = opts.tiles ?? TILES;
  const lazyTiles = opts.lazyTiles ?? (opts.tiles ? {} : LAZY_TILES);
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];
  return {
    id: 'env',
    dependsOn: ['core'],
    setup(ctx: CoreContext) {
      if (!envEnabled(typeof location === 'undefined' ? '' : location.search)) return;
      const lib = new ModelLibrary(new EnvModelSource(ctx.assets ?? undefined), (m) => console.warn(m));
      cleanups.push(() => lib.dispose());
      // Glow: flicker on the fires' emissive materials and a small fixed pool of point lights (src/env/glow.ts). Created once, here.
      const glow = new EnvGlow({ scene: ctx.scene, lib, tier: () => ctx.services.get('quality')?.step, heightAt: height });
      cleanups.push(() => glow.dispose());
      const fields = new Map<string, PlacementField>();
      for (const [name, rows] of Object.entries(tiles)) {
        const field = new PlacementField(lib, height);
        fields.set(name, field);
        ctx.scene.add(field.object);
        cleanups.push(() => field.dispose());
        void field
          .build(rows)
          .then(() => {
            field.setDensity(ctx.services.get('quality')?.step ?? 'medium');
            glow.addTile(name, rows);
          })
          .catch((err) => console.warn(`env: tile ${name} could not be built`, err));
      }
      // Lazy tiles: their rows arrive as a separate chunk, then the tile builds like any other.
      let gone = false;
      cleanups.push(() => void (gone = true));
      for (const [name, load] of Object.entries(lazyTiles)) {
        void load()
          .then(async (rows) => {
            if (gone) return;
            const field = new PlacementField(lib, height);
            fields.set(name, field);
            ctx.scene.add(field.object);
            cleanups.push(() => field.dispose());
            await field.build(rows);
            field.setDensity(ctx.services.get('quality')?.step ?? 'medium');
            glow.addTile(name, rows);
          })
          .catch((err) => console.warn(`env: tile ${name} could not be built`, err));
      }
      // Colliders: the tiles' boxes are made one tile per fixed tick once Rapier exists, and streamed in 64 m cells around the player.
      const colliderStats: Record<string, ColliderStats> = {};
      let streamer: ColliderStreamer | null = null;
      const pending = Object.keys(tiles);
      cleanups.push(() => {
        streamer?.dispose();
        streamer = null;
      });
      cleanups.push(
        ctx.systems.add({
          id: 'env.colliders',
          fixedPhase: 'rules',
          order: 420,
          fixedUpdate: () => {
            if (!streamer) {
              const rapier = readRapier(ctx);
              if (!rapier) return;
              streamer = new ColliderStreamer({ rapier, physics: ctx.physics, heightAt: height, warn: (m, e) => console.warn(m, ...(e === undefined ? [] : [e])) });
            }
            const name = pending.shift();
            if (name !== undefined) {
              try {
                const made = buildTileColliders(name, tiles[name]!, opts.keepOut ?? defaultKeepOut());
                colliderStats[name] = made.stats;
                streamer.addBoxes(made.boxes);
                if (made.stats.dropped) console.warn(`env colliders: ${name} dropped ${made.stats.dropped} of ${made.stats.modules} boxes that stood on a walking path`, made.stats.droppedBy);
              } catch (err) {
                console.warn(`env colliders: tile ${name} has no colliders`, err);
              }
            }
            const f = ctx.player.feet;
            streamer.update(f.x, f.z);
          },
        }),
      );
      let step = ctx.services.get('quality')?.step;
      let focus: { x: number; z: number } | null = null;
      cleanups.push(
        ctx.systems.add({
          id: 'env.update',
          renderPhase: 'world',
          order: 91,
          render: (_alpha, frameTime) => {
            const now = ctx.services.get('quality')?.step;
            const f = focus ?? ctx.player.feet;
            glow.update(frameTime, f, now);
            for (const field of fields.values()) {
              if (now && now !== step) field.setDensity(now);
              field.update(f.x, f.z);
            }
            step = now;
          },
        }),
      );
      cleanups.push(
        ctx.services.provide('env', {
          drawn: (tile) => fields.get(tile)?.drawn() ?? null,
          placeholders: (tile) => fields.get(tile)?.stats.placeholders ?? null,
          focus: (point) => {
            focus = point;
          },
          glow: () => glow.counts(),
          fireLights: glow.fireLights,
          colliders: () => ({ live: streamer?.liveColliders ?? 0, liveCells: streamer?.liveCells ?? 0, total: streamer?.totalBoxes ?? 0, tiles: { ...colliderStats } }),
        }),
      );
    },
    dispose() {
      for (const c of cleanups.splice(0).reverse()) {
        try {
          c();
        } catch (err) {
          console.warn('env: teardown step failed', err);
        }
      }
    },
  };
}

export default createEnvPlugin();
