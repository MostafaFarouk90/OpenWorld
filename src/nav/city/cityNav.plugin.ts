// Plugin `city-nav` (thread 3a): Harrowmark's district-block nav grids, streamed around the player. It depends on
// `harrowmark`, so a city that fails to build leaves no grids over missing buildings.
import type { GamePlugin } from '../../core/plugins';
import { HARROWMARK_LAYOUT } from '../../harrowmark/harrowmark.layout';
import type { StructureSpec } from '../../region/layoutTypes';
import { heightAt } from '../../terrain/heightfield';
import '../service';
import { blockGridDef, CITY_NAV_BLOCKS, type CityNavBlock } from './blocks';
import { CityNavStreamer } from './CityNavStreamer';

/** After the interiors' bounds rule (400) has settled where the player is; nothing reads the grids before AI. */
export const CITY_NAV_RULES_ORDER = 410;

export interface CityNavPluginOptions {
  blocks?: readonly CityNavBlock[];
  structures?: readonly StructureSpec[];
  heightAt?: (x: number, z: number) => number;
}

export function createCityNavPlugin(opts: CityNavPluginOptions = {}): GamePlugin {
  const blocks = opts.blocks ?? CITY_NAV_BLOCKS;
  const structures = opts.structures ?? HARROWMARK_LAYOUT.structures;
  const height = opts.heightAt ?? heightAt;
  let streamer: CityNavStreamer | null = null;
  return {
    id: 'city-nav',
    dependsOn: ['core', 'nav', 'harrowmark'],
    setup(ctx) {
      const nav = ctx.services.get('nav');
      if (!nav) throw new Error('city-nav: the nav service is missing');
      const s = new CityNavStreamer(blocks, {
        def: (b) => blockGridDef(b, structures, height),
        add: (grid) => nav.addGrid(grid),
        warn: (message, err) => console.warn(message, ...(err === undefined ? [] : [err])),
      });
      streamer = s;
      ctx.systems.add({
        id: 'city-nav.stream',
        fixedPhase: 'rules',
        order: CITY_NAV_RULES_ORDER,
        fixedUpdate() {
          const feet = ctx.player.feet;
          s.update(feet.x, feet.z);
        },
      });
      ctx.services.provide('cityNav', { active: () => s.active });
    },
    dispose() {
      streamer?.dispose();
      streamer = null;
    },
  };
}

declare module '../../core/Services' {
  interface GameServices {
    /** Debug and tests: the blocks whose grids are registered now. */
    cityNav: { active(): string[] };
  }
}

export default createCityNavPlugin();
