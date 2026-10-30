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
const NO_FOG_COLOR = new THREE.Color(0x888888);

/**
 * Blends the scene fog toward the fen's haze by the player's Greyfen weight without fighting the graphics service. Each
 * field (near, far, colour) is tracked on its own: a field that no longer holds what this last wrote was changed by
 * someone else (a view-distance step changes near and far only), so its current value becomes that field's base, and
 * the other fields keep theirs. Weight 0 puts every field this still owns back to its base. The caller skips the
 * blender while indoors, so an interior that saves and restores the hazed fog hands back exactly what was written.
 */
export function createFogBlender(): { apply(fog: THREE.Fog, weight: number): void; restore(fog: THREE.Fog): void } {
  const base = { near: 0, far: 0, color: new THREE.Color() };
  const written = { near: 0, far: 0, color: new THREE.Color() };
  let active = false;
  const scratch = new THREE.Color();
  const sameColor = (a: THREE.Color, b: THREE.Color): boolean => Math.abs(a.r - b.r) <= 1 / 255 && Math.abs(a.g - b.g) <= 1 / 255 && Math.abs(a.b - b.b) <= 1 / 255;
  const restore = (fog: THREE.Fog): void => {
    if (!active) return;
    if (fog.near === written.near) fog.near = base.near;
    if (fog.far === written.far) fog.far = base.far;
    if (sameColor(fog.color, written.color)) fog.color.copy(base.color);
    active = false;
  };
  return {
    apply(fog, weight) {
      if (weight <= 0) {
        restore(fog);
        return;
      }
      if (!active) {
        base.near = fog.near;
        base.far = fog.far;
        base.color.copy(fog.color);
      } else {
        if (fog.near !== written.near) base.near = fog.near;
        if (fog.far !== written.far) base.far = fog.far;
        if (!sameColor(fog.color, written.color)) base.color.copy(fog.color);
      }
      const m = mistFog(base.near, base.far, base.color, weight, scratch);
      fog.near = m.near;
      fog.far = m.far;
      fog.color.copy(m.color);
      written.near = fog.near;
      written.far = fog.far;
      written.color.copy(fog.color);
      active = true;
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
              // Indoors the interior owns the fog: leave it and the blender's base alone until the player is back out.
              if (fog && !indoors) blender.apply(fog, weight);
              water.update(cam.position, seconds);
              water.object.visible = !indoors;
              mist.update(cam.position, weight, seconds, fog?.color ?? NO_FOG_COLOR);
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
