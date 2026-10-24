// Plugin `harrowmark`: the greybox city inside the ring wall. Anchors, triggers, walls and districts, the South Gate's
// portcullis, the Harrowmark cast (through `npcs.register`) and the mini-ending world change. Failing here costs only
// this city: the region and npcs plugins do not depend on it.
import type * as THREE from 'three';
import { heightAt } from '../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { resolveLayout } from '../region/resolveLayout';
import { modelLibraryFor } from '../assets/swap/ModelLibrary';
import { buildCityModels, type CityModels } from './cityArt';
import { buildCity } from './cityBuild';
import { watchNorthwestGate, watchRiverGate, watchSouthGate } from './gate';
import { NORTHWEST_PORTCULLIS_ID, RIVER_PORTCULLIS_ID } from './city';
import { DOORS, HARROWMARK_LAYOUT } from './harrowmark.layout';
import { HARROWMARK_NPC_DEFS, HARROWMARK_NPC_STRINGS_EN } from './npcDefs';
import './types';
import { validateCity } from './validateCity';
import { buildWorldChange } from './worldChange';

export interface HarrowmarkPluginOptions {
  layout?: typeof HARROWMARK_LAYOUT;
  heightAt?: (x: number, z: number) => number;
}

export function createHarrowmarkPlugin(opts: HarrowmarkPluginOptions = {}): GamePlugin {
  const layout = opts.layout ?? HARROWMARK_LAYOUT;
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('harrowmark: teardown step failed', err);
      }
    }
  };

  return {
    id: 'harrowmark',
    dependsOn: ['core', 'region', 'npcs'],
    setup(ctx: CoreContext) {
      try {
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          const errors = validateCity(layout, { doors: DOORS });
          if (errors.length) throw new Error(`harrowmark: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        cleanups.push(ctx.strings.register('en', HARROWMARK_NPC_STRINGS_EN));

        const resolved = resolveLayout(layout, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

        if (!ctx.physics.rapier) throw new Error('harrowmark: physics is not ready');
        const city = buildCity({ ...ctx, rapier: ctx.physics.rapier }, layout.structures, height);
        cleanups.push(() => city.dispose());

        // The asset swap: instanced KayKit models per 96 m chunk, shown by distance. The greybox above stays as the far tier and
        // the fallback; without a loader (headless) or when no model loads this is a no-op.
        let models: CityModels | null = null;
        let stopped = false;
        cleanups.push(() => {
          stopped = true;
          models?.dispose();
        });
        void buildCityModels(modelLibraryFor(ctx.assets), layout.structures, height).then(
          (m) => {
            if (!m) return;
            if (stopped) return m.dispose();
            models = m;
            // Not under the city group: that group's dispose frees every mesh geometry, and these are the shared library's.
            ctx.scene.add(m.root);
          },
          (err) => console.warn('harrowmark: the city models failed, keeping the greybox', err),
        );
        let sinceLod = 1;
        cleanups.push(
          ctx.systems.add({
            id: 'harrowmark-models',
            renderPhase: 'world',
            order: 900,
            render: (_alpha, frameTime) => {
              sinceLod += frameTime;
              const cam = ctx.camera?.position;
              if (!models || !cam || sinceLod < 0.25) return;
              sinceLod = 0;
              const step = ctx.services.get('quality')?.step;
              models.chunks.update(cam.x, cam.y, cam.z, step === 'low' ? 0.6 : step === 'medium' ? 0.85 : 1);
            },
          }),
        );

        const gate = watchSouthGate(ctx.gates, (state) => city.setPortcullis(state === 'closed'));
        cleanups.push(() => gate.dispose());
        const river = watchRiverGate(ctx.gates, (open) => city.setShutter(RIVER_PORTCULLIS_ID, !open));
        cleanups.push(() => river.dispose());
        const northwest = watchNorthwestGate(ctx.gates, (open) => city.setShutter(NORTHWEST_PORTCULLIS_ID, !open));
        cleanups.push(() => northwest.dispose());

        const change = buildWorldChange(ctx);
        cleanups.push(() => change.dispose());

        // The cast is best effort: a failure here (a missing home anchor) costs the NPCs, not the city.
        try {
          const npcs = ctx.services.get('npcs');
          if (!npcs) throw new Error('the npcs service is missing');
          cleanups.push(npcs.register(layout.npcs, HARROWMARK_NPC_DEFS));
        } catch (err) {
          console.warn('harrowmark: could not register the Harrowmark NPCs', err);
        }

        cleanups.push(
          ctx.services.provide('harrowmark', {
            southGate: { state: gate.state, override: gate.override },
            riverGate: { open: river.open },
            northwestGate: { open: northwest.open },
            drawCalls: () => city.drawCalls,
            modelBatches: () => {
              const m = models;
              if (!m) return { built: 0, chunks: 0, shownChunks: 0, shownMeshes: 0, shownTriangles: 0 };
              const shown = m.chunks.visibleKeys();
              let meshes = 0;
              for (const k of shown) m.chunks.groups.get(k)!.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && meshes++);
              return { built: m.stats.batches, chunks: m.chunks.groups.size, shownChunks: shown.length, shownMeshes: meshes, shownTriangles: m.visibleTriangles() };
            },
            worldChange: () => ({ active: change.active, ...change.counts() }),
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

export default createHarrowmarkPlugin();
