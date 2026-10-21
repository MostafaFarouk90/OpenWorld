// Plugin `oldsmoke`: Deepgate's surface (walls, market, rows, Grisel Hall's shell, the shaft head, the furnace houses, two
// waystones), its cast and the choice readers. The hall interior is registered through `src/interiors/act2/index.ts`. Failing here
// costs only this region: the region and npcs plugins do not depend on it.
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { BuildingLookup } from '../region/buildingLookup';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { GRISEL_HALL_STRINGS_EN } from './griselHall';
import { OLDSMOKE_NPC_DEFS, OLDSMOKE_NPC_STRINGS_EN } from './npcDefs';
import { createOldsmokeArt } from './oldsmokeArt';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';
import { watchChoices } from './readers';
import { registerOldsmokeKinds } from './structureKinds';

export interface OldsmokePluginOptions {
  layout?: typeof OLDSMOKE_LAYOUT;
  heightAt?: (x: number, z: number) => number;
}

export function createOldsmokePlugin(opts: OldsmokePluginOptions = {}): GamePlugin {
  const layout = opts.layout ?? OLDSMOKE_LAYOUT;
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('oldsmoke: teardown step failed', err);
      }
    }
  };

  return {
    id: 'oldsmoke',
    dependsOn: ['core', 'region', 'npcs'],
    setup(ctx: CoreContext) {
      try {
        cleanups.push(registerOldsmokeKinds());
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          const errors = validateLayout(layout, height, { spawnId: null });
          if (errors.length) throw new Error(`oldsmoke: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        cleanups.push(ctx.strings.register('en', { ...OLDSMOKE_NPC_STRINGS_EN, ...GRISEL_HALL_STRINGS_EN }));

        const resolved = resolveLayout(layout, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

        if (!ctx.physics.rapier) throw new Error('oldsmoke: physics is not ready');
        const deps = { ...ctx, rapier: ctx.physics.rapier };
        const art = createOldsmokeArt(modelLibraryFor(ctx.assets));
        const lookup = new BuildingLookup(undefined, undefined, art);
        const structures = buildStructures({ ...deps, ...coreFactories(ctx) }, layout, height, lookup);
        cleanups.push(() => structures.dispose());
        void structures.upgrade();

        cleanups.push(watchChoices(ctx));

        // The cast is best effort: a failure here costs the NPCs, not the places.
        try {
          const npcs = ctx.services.get('npcs');
          if (!npcs) throw new Error('the npcs service is missing');
          cleanups.push(npcs.register(layout.npcs, OLDSMOKE_NPC_DEFS));
        } catch (err) {
          console.warn('oldsmoke: could not register the Deepgate NPCs', err);
        }
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createOldsmokePlugin();
