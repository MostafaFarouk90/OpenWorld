// Plugin `caldera-world` (Act 5 thread N1 PR 1, plans/act5-N1.md): the Caldera's places on top of the Act 4 world: their
// anchors, triggers and greybox structures, the Inner Gate's fog face, the Rim Gate's leaf and the Inner Gate's
// portcullis (drawn from flags), the Rim Beacon at the Last Anvil, and the orange sky. The bowl itself is terrain
// (src/terrain/shape/caldera.ts); containment is the region's (act5Containment.ts). Failing here costs only the Caldera's
// places: no other plugin depends on it.
import * as THREE from 'three';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { WALL_CULL } from '../region/act2/act2World';
import { innerGateFaceDef } from '../region/act5Fog';
import { BuildingLookup } from '../region/buildingLookup';
import { buildFogWallDef, registerFogWall, type FogWallDef } from '../region/fogWall';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { showToast } from '../waystones/toast';
import { CALDERA_LAYOUT } from './caldera.layout';
import { installCalderaGates } from './calderaGates';
import { installCalderaSky } from './calderaSky';
import { INNER_GATE } from './calderaSites';
import { RIM_BEACON_INTERACTABLE, RIM_BEACON_OFFSET, RIM_BEACON_SOURCE_ANCHOR, RIM_BEACON_STRINGS_EN, RIM_BEACON_TARGET_ANCHOR, RimBeacon } from './rimBeacon';

export interface CalderaPluginOptions {
  heightAt?: (x: number, z: number) => number;
  /** false skips the gates' meshes and the sky (plugin tests). */
  visuals?: boolean;
}

/** Ruins on the rim stand on ground that varies a little; 1.5 m along a 6 m tent is the most allowed. */
export const CALDERA_MAX_FOOTPRINT_SPREAD = 1.5;
/** How far behind the Inner Gate's face its push-back reaches (the floor hole holds past it). */
export const INNER_GATE_PUSH_DEPTH = 60;

export const INNER_GATE_WALL: FogWallDef = innerGateFaceDef({
  axis: 'z',
  halfLength: INNER_GATE.faceHalfLength,
  blockedSide: 1,
  cullBeyond: WALL_CULL,
  pushDepth: INNER_GATE_PUSH_DEPTH,
});

export const CALDERA_STRINGS_EN: Record<string, string> = { ...RIM_BEACON_STRINGS_EN };

export function createCalderaPlugin(opts: CalderaPluginOptions = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];
  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('caldera-world: teardown step failed', err);
      }
    }
  };
  return {
    id: 'caldera-world',
    // dragonspine defines the Last Anvil's stone (waystone.last-anvil), which the Rim Beacon stands beside.
    dependsOn: ['core', 'region', 'act4-world', 'dragonspine'],
    setup(ctx: CoreContext) {
      try {
        if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && !opts.heightAt) {
          const errors = validateLayout(CALDERA_LAYOUT, height, { spawnId: null, maxFootprintSpread: CALDERA_MAX_FOOTPRINT_SPREAD });
          if (errors.length) throw new Error(`caldera-world: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        ctx.strings.register('en', CALDERA_STRINGS_EN);
        const resolved = resolveLayout(CALDERA_LAYOUT, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));
        if (!ctx.physics.rapier) throw new Error('caldera-world: physics is not ready');

        // The Inner Gate's face (v0.9 item 3): what the player sees and bumps; the floor's round hole holds the rest.
        cleanups.push(registerFogWall(INNER_GATE_WALL));
        const face = ctx.anchors.get(INNER_GATE_WALL.anchorId).position;
        const wall = buildFogWallDef({ ...ctx, rapier: ctx.physics.rapier }, INNER_GATE_WALL, { x: face.x, y: face.y, z: face.z }, height);
        cleanups.push(() => wall.dispose());

        const structures = buildStructures({ ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) }, CALDERA_LAYOUT, height, new BuildingLookup());
        cleanups.push(() => structures.dispose());
        void structures.upgrade();

        if (opts.visuals !== false) {
          const gates = installCalderaGates(ctx, height);
          cleanups.push(() => gates.dispose());
          cleanups.push(installCalderaSky(ctx));
        }

        // The Rim Beacon (Q10): beside the Last Anvil's stone; it needs that stone's anchor (Act 3's Dragonspine).
        const source = ctx.anchors.find(RIM_BEACON_SOURCE_ANCHOR);
        if (!source) console.warn(`[caldera-world] ${RIM_BEACON_SOURCE_ANCHOR} is missing; the Rim Beacon is not offered`);
        else {
          const beacon = new RimBeacon({
            flag: (k) => ctx.state.getBool(k),
            blocked: () => {
              const ws = ctx.services.get('waystones');
              if (!ws) return 'no-waystones';
              if (ctx.services.get('movementMode')?.rule().fastTravel === 'refused') return 'movement';
              return ws.travelBlockedReason();
            },
            target: () => {
              const a = ctx.anchors.find(RIM_BEACON_TARGET_ANCHOR);
              return a ? { x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw } : null;
            },
            heightAt: height,
            teleport: (feet, yaw) => {
              const ws = ctx.services.get('waystones');
              return ws ? ws.safeTeleport(feet, yaw) : Promise.resolve({ ok: false });
            },
            toast: (key) => showToast(ctx.hud, ctx.strings.t(key)),
          });
          const at = new THREE.Vector3(source.position.x + RIM_BEACON_OFFSET.x, source.position.y, source.position.z + RIM_BEACON_OFFSET.z);
          cleanups.push(
            ctx.interaction.register({
              id: RIM_BEACON_INTERACTABLE,
              kind: 'use',
              position: (out) => out.copy(at),
              radius: 2,
              promptKey: 'caldera.beacon.prompt',
              enabled: () => beacon.offered(),
              onInteract: () => void beacon.use(),
            }),
          );
        }
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createCalderaPlugin();
