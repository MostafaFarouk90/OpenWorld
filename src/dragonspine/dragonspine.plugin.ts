// Plugin `dragonspine`: the lower slopes' places (Wyrmwatch Lodge, the Rime Pass shelter, the Hawk Cliffs, the collapsed cave's
// mouth, the Last Anvil site, the six wayside pads, M28's climb, three waystones) and, from PR 2, the summit's (the summit gate, the
// Wyrm's Hearth, the roost and M31's climb, Skyhold Cliffs, Frostfang Aerie, the glide ledge dressing, two more waystones) and
// their cast. The interiors are registered through `src/interiors/act3/index.ts`; the rockfall blocker and the cave and keep doors
// follow their flags through the interiors plugin's gates, which re-derive after every load. The flag readers (worldChanges.ts),
// the walker catch over the chasm and moat and the Aerie's arrival watcher (chasmCatch.ts) are set up here. Failing here costs only
// this region: the region and npcs plugins do not depend on it.
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import { BuildingLookup } from '../region/buildingLookup';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import type { LayoutData } from '../region/layoutTypes';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { validateLayout } from '../region/validateLayout';
import { envModelLibraryFor } from '../env/envStructureArt';
import { createDragonspineArt } from './dragonspineArt';
import { defaultInputs, type DragonspineInputs, type HeightFn } from './inputs';
import { DRAGONSPINE_INTERIOR_STRINGS_EN } from './interiors';
import { installWalkerCatch, onShelfOf, watchAerieArrival } from './chasmCatch';
import { buildDragonspine, dragonspineBuild } from './layout';
import { watchToggles } from './worldChanges';
import { DRAGONSPINE_NPC_DEFS, DRAGONSPINE_NPC_STRINGS_EN } from './npcDefs';
import { registerDragonspineKinds } from './structureKinds';

/** The `dragonspine` service: what the readers show and the walker catch's state (tests, debugging). */
export interface DragonspineService {
  /** Ids of the flag-driven pieces shown now (worldChanges.ts). */
  shownToggles(): string[];
  /** Catches fired since setup, where the last one went, and whether the player was last grounded on the Aerie. */
  catchState(): { catches: number; lastTarget: string | null; lastOnAerie: boolean; busy: boolean };
}

declare module '../core/Services' {
  interface GameServices {
    dragonspine: DragonspineService;
  }
}

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
        const build = shipped ? dragonspineBuild() : buildDragonspine(opts.inputs && !opts.heightAt ? opts.inputs : { ...(opts.inputs ?? defaultInputs(opts.heightAt)), heightAt: height });
        const layout = opts.layout ?? build.layout;
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
        const art = createDragonspineArt(modelLibraryFor(ctx.assets), envModelLibraryFor(ctx.assets));
        const lookup = new BuildingLookup(undefined, undefined, art);
        const structures = buildStructures({ ...deps, ...coreFactories(ctx) }, layout, height, lookup);
        cleanups.push(() => structures.dispose());
        void structures.upgrade();

        // The flag readers (the aerie gate, the net, the axe, the lit hearth, the burned banner, the drake's roost), re-derived through ctx.gates.
        const toggles = watchToggles(deps, build.toggles, height, art);
        cleanups.push(() => toggles.dispose());
        // The walker catch over the chasm and moat (stands down while gliding), and the Aerie waystone attuned on arrival.
        const walker = installWalkerCatch(ctx, build.catchVolumes, build.summit.aerie, height);
        cleanups.push(walker.dispose);
        cleanups.push(watchAerieArrival(ctx, onShelfOf(build.summit.aerie, height)));
        const w = walker.walker;
        cleanups.push(
          ctx.services.provide('dragonspine', {
            shownToggles: () => toggles.shown(),
            catchState: () => ({ catches: w.catches, lastTarget: w.lastTarget, lastOnAerie: w.lastOnAerie, busy: w.busy }),
          }),
        );

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
