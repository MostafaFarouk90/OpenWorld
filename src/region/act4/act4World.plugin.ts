// Plugin `act4-world` (L0, contracts v0.8 item 3): the Act 4 world anchors and the new fog faces (`fog.waste-edge`,
// `fog.caldera-rim.*`, `fog.waste-north`); thread L1 adds the triggers, Ashgate's and the shelters' greybox structures,
// the road ribbons and the rope-lines. The corridors and holes are containment's (act4Containment.ts). Failing here
// costs only the Act 4 world: the region plugin does not depend on it.
import { heightAt } from '../../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../coreTypes';
import { buildFogWallDef, registerFogWall, type FogWallDef } from '../fogWall';
import { BuildingLookup } from '../buildingLookup';
import { resolveLayout } from '../resolveLayout';
import { buildStructures, coreFactories } from '../StructureBuilder';
import { validateLayout } from '../validateLayout';
import { buildAct4Roads } from './act4Roads';
import { buildRopePosts } from './ropePosts';
import { ACT4_FOG_WALLS } from './act4World';
import { ACT4_WORLD_LAYOUT } from './act4World.layout';

export interface Act4WorldPluginOptions {
  heightAt?: (x: number, z: number) => number;
  walls?: readonly FogWallDef[];
}

export function createAct4WorldPlugin(opts: Act4WorldPluginOptions = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const walls = opts.walls ?? ACT4_FOG_WALLS;
  const cleanups: Array<() => void> = [];
  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('act4-world: teardown step failed', err);
      }
    }
  };
  return {
    id: 'act4-world',
    dependsOn: ['core', 'region', 'act3-world'],
    setup(ctx: CoreContext) {
      try {
        if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && !opts.heightAt) {
          // L1: the shelters stand on fitted pads; a 14% line grade leaves up to about 0.7 m along a 5 m roof.
          const errors = validateLayout(ACT4_WORLD_LAYOUT, height, { spawnId: null, maxFootprintSpread: 1 });
          if (errors.length) throw new Error(`act4-world: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        const resolved = resolveLayout(ACT4_WORLD_LAYOUT, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));
        if (!ctx.physics.rapier) throw new Error('act4-world: physics is not ready');
        for (const def of walls) {
          cleanups.push(registerFogWall(def));
          const at = ctx.anchors.get(def.anchorId).position;
          const wall = buildFogWallDef({ ...ctx, rapier: ctx.physics.rapier }, def, { x: at.x, y: at.y, z: at.z }, height);
          cleanups.push(() => wall.dispose());
        }

        // L1: Ashgate's refuge and the shelters' lean-tos (greybox), the road ribbons and the rope-lines.
        const structures = buildStructures({ ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) }, ACT4_WORLD_LAYOUT, height, new BuildingLookup());
        cleanups.push(() => structures.dispose());
        void structures.upgrade();
        const roads = buildAct4Roads(height);
        ctx.scene.add(roads.object);
        cleanups.push(() => roads.dispose());
        const ropes = buildRopePosts(height);
        ctx.scene.add(ropes.object);
        cleanups.push(() => ropes.dispose());
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createAct4WorldPlugin();
