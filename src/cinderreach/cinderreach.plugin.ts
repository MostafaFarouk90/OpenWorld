// Plugin `cinderreach`: the places of Act 2's first region (Cinderford, Stonefold, the dens, Fellwalker Pasture, the Hushed
// Anvil's ridge, the hunters' camp, Scorchhold Fort and its keep, three waystones), their cast, the choice readers and the
// flag-driven pieces. Failing here costs only this region: the region and npcs plugins do not depend on it.
import type * as THREE from 'three';
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { BuildingLookup } from '../region/buildingLookup';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { envModelLibraryFor } from '../env/envStructureArt';
import { createCinderreachArt } from './cinderreachArt';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { CINDERREACH_NPC_DEFS, CINDERREACH_NPC_STRINGS_EN } from './npcDefs';
import { watchChoices } from './readers';
import { SCORCHHOLD_KEEP_STRINGS_EN } from './scorchholdKeep';
import { registerCinderKinds } from './structureKinds';
import { CINDERREACH_TOGGLES } from './toggles';
import { ToggleStructure } from './toggleStructure';
import { buildCinderfordWater } from './water';

export interface CinderreachPluginOptions {
  layout?: typeof CINDERREACH_LAYOUT;
  heightAt?: (x: number, z: number) => number;
}

export interface CinderreachService {
  /** Toggled structures that are showing right now (tests, debug). */
  shownToggles(): string[];
}

declare module '../core/Services' {
  interface GameServices {
    cinderreach: CinderreachService;
  }
}

export function createCinderreachPlugin(opts: CinderreachPluginOptions = {}): GamePlugin {
  const layout = opts.layout ?? CINDERREACH_LAYOUT;
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('cinderreach: teardown step failed', err);
      }
    }
  };

  return {
    id: 'cinderreach',
    dependsOn: ['core', 'region', 'npcs'],
    setup(ctx: CoreContext) {
      try {
        cleanups.push(registerCinderKinds());
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          const errors = validateLayout(layout, height, { spawnId: null });
          if (errors.length) throw new Error(`cinderreach: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        cleanups.push(ctx.strings.register('en', { ...CINDERREACH_NPC_STRINGS_EN, ...SCORCHHOLD_KEEP_STRINGS_EN }));

        const resolved = resolveLayout(layout, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

        if (!ctx.physics.rapier) throw new Error('cinderreach: physics is not ready');
        const deps = { ...ctx, rapier: ctx.physics.rapier };
        const art = createCinderreachArt(modelLibraryFor(ctx.assets), envModelLibraryFor(ctx.assets));
        const lookup = new BuildingLookup(undefined, undefined, art);
        const structures = buildStructures({ ...deps, ...coreFactories(ctx) }, layout, height, lookup);
        cleanups.push(() => structures.dispose());
        void structures.upgrade();

        const water = buildCinderfordWater(height);
        ctx.scene.add(water.object);
        cleanups.push(() => water.dispose());

        // The toggled pieces: shown or hidden by a derived flag, re-derived on a load through ctx.gates.
        const toggles = CINDERREACH_TOGGLES.map((def) => {
          const toggle = new ToggleStructure(deps, def.spec, height);
          cleanups.push(() => toggle.dispose());
          cleanups.push(ctx.gates.flag(def.flag, (on) => toggle.setVisible(on === def.show)));
          void art(def.spec).then(
            (obj: THREE.Object3D | null) => toggle.setArt(obj),
            () => undefined,
          );
          return { def, toggle };
        });

        cleanups.push(watchChoices(ctx));

        // The cast is best effort: a failure here costs the NPCs, not the places.
        try {
          const npcs = ctx.services.get('npcs');
          if (!npcs) throw new Error('the npcs service is missing');
          cleanups.push(npcs.register(layout.npcs, CINDERREACH_NPC_DEFS));
        } catch (err) {
          console.warn('cinderreach: could not register the Cinderreach NPCs', err);
        }

        cleanups.push(ctx.services.provide('cinderreach', { shownToggles: () => toggles.filter((t) => t.toggle.visible).map((t) => t.def.id) }));
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createCinderreachPlugin();
