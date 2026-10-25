// Plugin `dragonspine`: the lower slopes' places (Wyrmwatch Lodge, the Rime Pass shelter, the Hawk Cliffs, the collapsed cave's
// mouth, the Last Anvil site, the six wayside pads, M28's climb, three waystones) and their cast. The two interiors are registered
// through `src/interiors/act3/index.ts`; the rockfall blocker and the cave door follow their flags through the interiors plugin's
// gates, which re-derive after every load. Failing here costs only this region: the region and npcs plugins do not depend on it.
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import { BuildingLookup } from '../region/buildingLookup';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import type { LayoutData } from '../region/layoutTypes';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { validateLayout } from '../region/validateLayout';
import { createDragonspineArt } from './dragonspineArt';
import { defaultInputs, type DragonspineInputs, type HeightFn } from './inputs';
import { DRAGONSPINE_INTERIOR_STRINGS_EN } from './interiors';
import { buildDragonspine, dragonspineBuild } from './layout';
import { DRAGONSPINE_NPC_DEFS, DRAGONSPINE_NPC_STRINGS_EN } from './npcDefs';
import { registerDragonspineKinds } from './structureKinds';

export interface DragonspinePluginOptions {
  /** A ready layout (tests); otherwise it is built from `inputs` at setup. */
  layout?: LayoutData;
  /** K1's exports (plateaus, road, hearth, pads) and the ground; tests pass stand-ins. */
  inputs?: DragonspineInputs;
  heightAt?: HeightFn;
}

export function createDragonspinePlugin(opts: DragonspinePluginOptions = {}): GamePlugin {
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('dragonspine: teardown step failed', err);
      }
    }
  };

  return {
    id: 'dragonspine',
    // K1's ground is static (`ACT3_PLATEAUS` in the world shape, so `heightAt` is final at load) and its anchors are plain layout data
    // (`ACT3_WORLD_LAYOUT`, no plugin), so there is nothing to wait for beyond these.
    dependsOn: ['core', 'region', 'npcs'],
    setup(ctx: CoreContext) {
      try {
        // The shipped case (no options) takes the cached default build: setup costs nothing after the first build of the session.
        const shipped = !opts.inputs && !opts.heightAt;
        const height = opts.heightAt ?? opts.inputs?.heightAt ?? defaultInputs().heightAt;
        const layout =
          opts.layout ??
          (shipped ? dragonspineBuild() : buildDragonspine(opts.inputs && !opts.heightAt ? opts.inputs : { ...(opts.inputs ?? defaultInputs(opts.heightAt)), heightAt: height })).layout;
        cleanups.push(registerDragonspineKinds());
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          const errors = validateLayout(layout, height, { spawnId: null });
          if (errors.length) throw new Error(`dragonspine: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        cleanups.push(ctx.strings.register('en', { ...DRAGONSPINE_NPC_STRINGS_EN, ...DRAGONSPINE_INTERIOR_STRINGS_EN }));

        const resolved = resolveLayout(layout, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

        if (!ctx.physics.rapier) throw new Error('dragonspine: physics is not ready');
        const deps = { ...ctx, rapier: ctx.physics.rapier };
        const art = createDragonspineArt(modelLibraryFor(ctx.assets));
        const lookup = new BuildingLookup(undefined, undefined, art);
        const structures = buildStructures({ ...deps, ...coreFactories(ctx) }, layout, height, lookup);
        cleanups.push(() => structures.dispose());
        void structures.upgrade();

        // The cast is best effort: a failure here costs the NPCs, not the places.
        try {
          const npcs = ctx.services.get('npcs');
          if (!npcs) throw new Error('the npcs service is missing');
          cleanups.push(npcs.register(layout.npcs, DRAGONSPINE_NPC_DEFS));
        } catch (err) {
          console.warn('dragonspine: could not register the Dragonspine NPCs', err);
        }
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createDragonspinePlugin();
