// Plugin `greyfen`: the places of Act 3's first region (Reedgate and its ferry landing, the causeways with M23's bridges,
// R12's reed beds, Hathren's Mere shore, the Greywatch posts, Mireweather Hut, the drowned chapel's and monastery's fronts,
// four waystones), their cast, the choice readers, the flag-driven pieces, and the water of its sites and dive interiors
// (registered on K7's `water` service once it exists; without it the dive interiors are inert, their doors locked).
// Failing here costs only this region: the region and npcs plugins do not depend on it.
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import type { LayoutData } from '../region/layoutTypes';

export interface GreyfenPluginOptions {
  /** A replacement layout (tests). */
  layout?: LayoutData;
}

export interface GreyfenService {
  /** Toggled structures that are showing right now (tests, debug). */
  shownToggles(): string[];
  /** Whether the site and interior water is registered on the water service. */
  waterRegistered(): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    greyfen: GreyfenService;
  }
}

export function createGreyfenPlugin(opts: GreyfenPluginOptions = {}): GamePlugin {
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('greyfen: teardown step failed', err);
      }
    }
  };

  return {
    id: 'greyfen',
    dependsOn: ['core', 'region', 'npcs'],
    async setup(ctx: CoreContext) {
      try {
        const region = await import('./greyfenRegion');
        region.setupGreyfen(ctx, opts.layout ?? region.GREYFEN_LAYOUT, cleanups);
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createGreyfenPlugin();
