// Plugin `act2-world` (thread A1): the Act 2 world that has no other home. The `cinderroad.*` anchors, the road
// corridors on the containment service, the Act 2 fog wall faces, the roads' gravel ribbons and the Oldsmoke stacks.
// Terrain shaping and ground rules are data the terrain reads (src/terrain/shape, src/terrain/ground.ts). Failing here
// costs only these: the region plugin and the city do not depend on it.
import { heightAt } from '../../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../coreTypes';
import { buildFogWallDef, registerFogWall, type FogWallDef } from '../fogWall';
import { resolveLayout } from '../resolveLayout';
import { buildAct2Roads } from './act2Roads';
import { ACT2_CORRIDORS, ACT2_FOG_WALLS, ACT2_WORLD_STRINGS_EN } from './act2World';
import { ACT2_WORLD_LAYOUT } from './act2World.layout';
import { buildOldsmokeStacks } from './oldsmokeStacks';

export interface Act2WorldPluginOptions {
  heightAt?: (x: number, z: number) => number;
  walls?: readonly FogWallDef[];
}

export const ACT2_STACKS_SYSTEM_ID = 'act2-world.stacks';

export function createAct2WorldPlugin(opts: Act2WorldPluginOptions = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const walls = opts.walls ?? ACT2_FOG_WALLS;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('act2-world: teardown step failed', err);
      }
    }
  };

  return {
    id: 'act2-world',
    dependsOn: ['core', 'region'],
    setup(ctx: CoreContext) {
      try {
        cleanups.push(ctx.strings.register('en', ACT2_WORLD_STRINGS_EN));
        const resolved = resolveLayout(ACT2_WORLD_LAYOUT, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));

        const containment = ctx.services.get('containment');
        if (!containment) throw new Error('act2-world: the containment service is missing');
        for (const c of ACT2_CORRIDORS) cleanups.push(containment.addCorridor(c));

        // The region plugin builds the walls registered before its setup; these are built here, after the anchors.
        if (!ctx.physics.rapier) throw new Error('act2-world: physics is not ready');
        for (const def of walls) {
          cleanups.push(registerFogWall(def));
          const at = ctx.anchors.get(def.anchorId).position;
          const wall = buildFogWallDef({ ...ctx, rapier: ctx.physics.rapier }, def, { x: at.x, y: at.y, z: at.z }, height);
          cleanups.push(() => wall.dispose());
        }

        const roads = buildAct2Roads(height);
        ctx.scene.add(roads.object);
        cleanups.push(() => roads.dispose());

        const stacks = buildOldsmokeStacks();
        ctx.scene.add(stacks.object);
        cleanups.push(() => stacks.dispose());
        let seconds = 0;
        cleanups.push(
          ctx.systems.add({
            id: ACT2_STACKS_SYSTEM_ID,
            renderPhase: 'world',
            order: 910,
            render: (_alpha, frameTime) => {
              seconds += frameTime;
              const cam = ctx.camera;
              if (!cam) return;
              const fog = ctx.scene.fog as { color?: import('three').Color } | null;
              stacks.update(cam.position, cam.far, seconds, fog?.color ?? null, Boolean(ctx.services.get('interiors')?.current));
            },
          }),
        );
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createAct2WorldPlugin();
