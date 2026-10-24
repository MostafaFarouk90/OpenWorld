// Plugin `act3-world` (thread K1): the Act 3 world that has no other home. The Act 3 world anchors (roads, fog faces,
// the camp hearth), the four new fog wall faces, the roads' ribbons, the fen's water planes and mist, and the
// Dragonspine summit's far stand-in. Terrain shaping and ground rules are data the terrain reads (src/terrain/shape,
// src/terrain/ground.ts); the corridors and the summit hole are K0's (act3Containment.ts, registered by containment).
// Failing here costs only these: the region plugin and the cities do not depend on it.
import * as THREE from 'three';
import { heightAt } from '../../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../coreTypes';
import { buildFogWallDef, registerFogWall, type FogWallDef } from '../fogWall';
import { resolveLayout } from '../resolveLayout';
import { buildGreyfenMist, greyfenWeight, mistFog } from './act3Mist';
import { buildAct3Roads } from './act3Roads';
import { buildAct3Water } from './act3Water';
import { ACT3_FOG_WALLS } from './act3World';
import { ACT3_WORLD_LAYOUT } from './act3World.layout';
import { buildSummitLandmark } from './summitLandmark';

export interface Act3WorldPluginOptions {
  heightAt?: (x: number, z: number) => number;
  walls?: readonly FogWallDef[];
  /** Skip the render-only parts (water, mist, landmark): tests that only read anchors and walls. */
  visuals?: boolean;
}

export const ACT3_WORLD_SYSTEM_ID = 'act3-world.render';

/**
 * Blends the scene fog toward the fen's haze by the player's Greyfen weight without fighting the graphics service:
 * whatever the fog holds when it differs from what this last wrote is taken as the new base (a quality step or an
 * interior changes it), and weight 0 restores the base exactly.
 */
export function createFogBlender(): { apply(fog: THREE.Fog, weight: number): void; restore(fog: THREE.Fog): void } {
  let base: { near: number; far: number; color: THREE.Color } | null = null;
  let written: { near: number; far: number; color: THREE.Color } | null = null;
  const capture = (fog: THREE.Fog) => {
    if (!written || fog.near !== written.near || fog.far !== written.far || !fog.color.equals(written.color)) {
      base = { near: fog.near, far: fog.far, color: fog.color.clone() };
    }
  };
  const restore = (fog: THREE.Fog) => {
    if (base && written && fog.near === written.near && fog.far === written.far && fog.color.equals(written.color)) {
      fog.near = base.near;
      fog.far = base.far;
      fog.color.copy(base.color);
    }
    base = null;
    written = null;
  };
  return {
    apply(fog, weight) {
      if (weight <= 0) {
        if (written) restore(fog);
        return;
      }
      capture(fog);
      const b = base!;
      const m = mistFog(b.near, b.far, b.color, weight);
      fog.near = m.near;
      fog.far = m.far;
      fog.color.copy(m.color);
      written = { near: fog.near, far: fog.far, color: fog.color.clone() };
    },
    restore,
  };
}

export function createAct3WorldPlugin(opts: Act3WorldPluginOptions = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const walls = opts.walls ?? ACT3_FOG_WALLS;
  const visuals = opts.visuals ?? true;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('act3-world: teardown step failed', err);
      }
    }
  };

  return {
    id: 'act3-world',
    dependsOn: ['core', 'region', 'act2-world'],
    setup(ctx: CoreContext) {
      try {
        const resolved = resolveLayout(ACT3_WORLD_LAYOUT, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));

        if (!ctx.physics.rapier) throw new Error('act3-world: physics is not ready');
        for (const def of walls) {
          cleanups.push(registerFogWall(def));
          const at = ctx.anchors.get(def.anchorId).position;
          const wall = buildFogWallDef({ ...ctx, rapier: ctx.physics.rapier }, def, { x: at.x, y: at.y, z: at.z }, height);
          cleanups.push(() => wall.dispose());
        }

        const roads = buildAct3Roads(height);
        ctx.scene.add(roads.object);
        cleanups.push(() => roads.dispose());

        if (!visuals) return;
        const water = buildAct3Water();
        ctx.scene.add(water.object);
        cleanups.push(() => water.dispose());
        const mist = buildGreyfenMist();
        ctx.scene.add(mist.object);
        cleanups.push(() => mist.dispose());
        const summit = buildSummitLandmark(height);
        ctx.scene.add(summit.object);
        cleanups.push(() => summit.dispose());
        const blender = createFogBlender();
        cleanups.push(() => {
          if (ctx.scene.fog instanceof THREE.Fog) blender.restore(ctx.scene.fog);
        });

        let seconds = 0;
        cleanups.push(
          ctx.systems.add({
            id: ACT3_WORLD_SYSTEM_ID,
            renderPhase: 'world',
            order: 911,
            render: (_alpha, frameTime) => {
              seconds += frameTime;
              const cam = ctx.camera;
              if (!cam) return;
              const indoors = Boolean(ctx.services.get('interiors')?.current);
              const fog = ctx.scene.fog instanceof THREE.Fog ? ctx.scene.fog : null;
              const weight = indoors ? 0 : greyfenWeight(cam.position.x, cam.position.z);
              if (fog) blender.apply(fog, weight);
              water.update(cam.position, seconds);
              water.object.visible = !indoors;
              mist.update(cam.position, weight, seconds, fog?.color ?? new THREE.Color(0x888888));
              summit.update(cam.position, cam.far, fog?.color ?? null, indoors);
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

export default createAct3WorldPlugin();
