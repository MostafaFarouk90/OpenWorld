// Plugin `act4-world` (L0, contracts v0.8 item 3): the Act 4 world anchors placed by L0 and the five new fog faces
// (`fog.waste-edge`, `fog.caldera-rim.*`). The Ash Road corridor and the Caldera hole are containment's
// (act4Containment.ts). Failing here costs only these faces: the region plugin does not depend on it.
import { heightAt } from '../../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../coreTypes';
import { buildFogWallDef, registerFogWall, type FogWallDef } from '../fogWall';
import { resolveLayout } from '../resolveLayout';
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
        const resolved = resolveLayout(ACT4_WORLD_LAYOUT, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        if (!ctx.physics.rapier) throw new Error('act4-world: physics is not ready');
        for (const def of walls) {
          cleanups.push(registerFogWall(def));
          const at = ctx.anchors.get(def.anchorId).position;
          const wall = buildFogWallDef({ ...ctx, rapier: ctx.physics.rapier }, def, { x: at.x, y: at.y, z: at.z }, height);
          cleanups.push(() => wall.dispose());
        }
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createAct4WorldPlugin();
