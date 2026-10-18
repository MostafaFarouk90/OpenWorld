// Plugin `region`: lays the Brightwater tutorial footprint onto the terrain (anchors, triggers, greybox
// structures, props, the scarecrow, barley), exposes the `region` service and reports region changes.
import { heightAt } from '../terrain/heightfield';
import { BuildingLookup } from './buildingLookup';
import { buildBarley } from './barley';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import type { CoreContext, GamePlugin } from './coreTypes';
import type { LayoutData } from './layoutTypes';
import { buildProps } from './props';
import { regionAt } from './regionMask';
import { resolveLayout } from './resolveLayout';
import { SCARECROW_TOPPLED_FLAG, spawnScarecrow } from './scarecrow';
import type { RegionService } from './serviceTypes';
import { buildStructures, coreFactories } from './StructureBuilder';
import { REGION_STRINGS_EN } from './strings.en';
import { validateLayout } from './validateLayout';

export interface RegionPluginOptions {
  layout?: LayoutData;
  heightAt?: (x: number, z: number) => number;
}

/** `placeId` of the discover event and the flag that makes it fire once per save. */
export const BRIGHTWATER_DISCOVERED_FLAG = 'place.brightwater.discovered';

export function createRegionPlugin(opts: RegionPluginOptions = {}): GamePlugin {
  const layout = opts.layout ?? BRIGHTWATER_LAYOUT;
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('region: teardown step failed', err);
      }
    }
  };

  return {
    id: 'region',
    dependsOn: ['core'],
    setup(ctx: CoreContext) {
      try {
        // The layout is static data; checking it costs a 250k-cell flood fill, so only dev builds and tests pay.
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          const errors = validateLayout(layout, height);
          if (errors.length) throw new Error(`region: invalid layout:\n${errors.join('\n')}`);
        }

        cleanups.push(ctx.strings.register('en', REGION_STRINGS_EN));

        const resolved = resolveLayout(layout, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

        const lookup = new BuildingLookup();
        const structures = buildStructures({ ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) }, layout, height, lookup);
        cleanups.push(() => structures.dispose());
        void structures.upgrade();

        const barley = buildBarley(layout.fields, height, 1, layout.structures.filter((s) => s.mode !== 'open'));
        ctx.scene.add(barley.object);
        cleanups.push(() => {
          ctx.scene.remove(barley.object);
          barley.dispose();
        });

        const props = buildProps({ ...ctx, ...coreFactories(ctx) }, ctx.anchors);
        cleanups.push(() => props.dispose());

        // A scarecrow already knocked down in this save stays down (checked again when a save loads).
        const anchorOf = () => ctx.anchors.get('brightwater.scarecrow');
        let scarecrow = ctx.state.getBool(SCARECROW_TOPPLED_FLAG) ? null : spawnScarecrow(ctx, anchorOf(), height);
        cleanups.push(() => scarecrow?.dispose());
        cleanups.push(
          ctx.events.on('save.loaded', () => {
            // Resync both ways: a save from before the topple stands the scarecrow up again.
            scarecrow?.dispose();
            scarecrow = ctx.state.getBool(SCARECROW_TOPPLED_FLAG) ? null : spawnScarecrow(ctx, anchorOf(), height);
          }),
        );

        // The training dummies belong to the core; move them into the Practice Yard when it can.
        const dummies = ctx.services.get('dummies');
        try {
          dummies?.place(['yard.dummy-1', 'yard.dummy-2'].map((id) => {
            const a = ctx.anchors.get(id);
            return { feet: a.position, yaw: a.yaw };
          }));
        } catch (err) {
          console.warn('region: could not place the training dummies', err);
        }

        const service: RegionService = {
          at: regionAt,
          waystoneObject(anchorId) {
            const stone = ctx.anchors.find(anchorId);
            if (!stone?.tags?.includes('waystone')) return undefined;
            return structures.objectById.get(anchorId.replace('.', '-'));
          },
        };
        cleanups.push(ctx.services.provide('region', service));

        let current: string | null = null;
        cleanups.push(
          ctx.systems.add({
            id: 'region-tracker',
            fixedPhase: 'intent',
            order: -90,
            fixedUpdate() {
              const { x, z } = ctx.player.feet;
              const now = regionAt(x, z)?.id ?? null;
              if (now === current) return;
              const previous = current;
              current = now;
              if (!now) return;
              ctx.events.emit('region.entered', { regionId: now, previous });
              if (!ctx.state.getBool(BRIGHTWATER_DISCOVERED_FLAG)) {
                ctx.state.setFlag(BRIGHTWATER_DISCOVERED_FLAG, true);
                ctx.events.emit('discover', { placeId: now, kind: 'region' });
              }
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

export default createRegionPlugin();
