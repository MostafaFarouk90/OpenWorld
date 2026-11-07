// Plugin `waste` (Act 4 L1 PR 2, plans/act4-L1.md sections 16 and 17): the Waste's places on top of the Act 4 world: their
// anchors, triggers and greybox structures. Failing here costs only the Waste's places; the act4-world plugin and the
// region do not depend on it.
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { BuildingLookup } from '../region/buildingLookup';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { WASTE_LAYOUT } from './waste.layout';

export interface WastePluginOptions {
  heightAt?: (x: number, z: number) => number;
}

/** Ruins and the cathedral's shell stand on ground that varies a little; 1.2 m along an 8 m wall is the most allowed. */
export const WASTE_MAX_FOOTPRINT_SPREAD = 1.2;

export function createWastePlugin(opts: WastePluginOptions = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];
  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('waste: teardown step failed', err);
      }
    }
  };
  return {
    id: 'waste',
    dependsOn: ['core', 'region', 'act4-world'],
    setup(ctx: CoreContext) {
      try {
        if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && !opts.heightAt) {
          const errors = validateLayout(WASTE_LAYOUT, height, { spawnId: null, maxFootprintSpread: WASTE_MAX_FOOTPRINT_SPREAD });
          if (errors.length) throw new Error(`waste: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        const resolved = resolveLayout(WASTE_LAYOUT, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));
        if (!ctx.physics.rapier) throw new Error('waste: physics is not ready');
        const structures = buildStructures({ ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) }, WASTE_LAYOUT, height, new BuildingLookup());
        cleanups.push(() => structures.dispose());
        void structures.upgrade();
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createWastePlugin();
