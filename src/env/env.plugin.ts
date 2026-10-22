// Plugin `env`: the environment pass. Draws each tile's placement rows (vegetation, hedges, clutter) with instancing, thinned by the
// quality step and hidden by distance. Pure scenery: no colliders, no anchors, no flags, so a failure here costs only the dressing
// (nothing depends on it). Tiles are added in src/env/tiles.ts as the pass builds them; with none registered the plugin does nothing.
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { heightAt } from '../terrain/heightfield';
import { EnvModelSource } from './envSource';
import { PlacementField, type PlacementRow } from './PlacementField';
import { TILES } from './tiles';

export interface EnvPluginOptions {
  tiles?: Readonly<Record<string, readonly PlacementRow[]>>;
  heightAt?: (x: number, z: number) => number;
}

export interface EnvService {
  /** Instances drawn per class for a tile (tests, debug); null for an unknown tile. */
  drawn(tile: string): Record<string, number> | null;
  /** Rows that fell back to a scripted placeholder for a tile. */
  placeholders(tile: string): number | null;
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

export function createEnvPlugin(opts: EnvPluginOptions = {}): GamePlugin {
  const tiles = opts.tiles ?? TILES;
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];
  return {
    id: 'env',
    dependsOn: ['core'],
    setup(ctx: CoreContext) {
      if (!envEnabled(typeof location === 'undefined' ? '' : location.search)) return;
      const lib = new ModelLibrary(new EnvModelSource(ctx.assets ?? undefined), (m) => console.warn(m));
      cleanups.push(() => lib.dispose());
      const fields = new Map<string, PlacementField>();
      for (const [name, rows] of Object.entries(tiles)) {
        const field = new PlacementField(lib, height);
        fields.set(name, field);
        ctx.scene.add(field.object);
        cleanups.push(() => field.dispose());
        void field
          .build(rows)
          .then(() => field.setDensity(ctx.services.get('quality')?.step ?? 'medium'))
          .catch((err) => console.warn(`env: tile ${name} could not be built`, err));
      }
      let step = ctx.services.get('quality')?.step;
      cleanups.push(
        ctx.systems.add({
          id: 'env.update',
          renderPhase: 'world',
          order: 91,
          render: () => {
            const now = ctx.services.get('quality')?.step;
            const f = ctx.player.feet;
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
