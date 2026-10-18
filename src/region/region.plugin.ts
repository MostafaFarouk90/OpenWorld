// Plugin `region`: lays the Brightwater tutorial footprint onto the terrain (anchors, triggers, greybox
// structures, props, the scarecrow, barley), exposes the `region` service and reports region changes.
import { heightAt } from '../terrain/heightfield';
import { BuildingLookup } from './buildingLookup';
import { barleyVariantOf, buildBarley } from './barley';
import { buildCorridorScenery } from './corridorScenery';
import { FOG_WALL_X } from './corridor.layout';
import { buildFogWall } from './fogWall';
import { buildPoiProps } from './poiProps';
import { TOLL_POST_BROKEN_FLAG, spawnTollPost, type TollPostHandle } from './tollPost';
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

/** The flag that makes a region's `discover` fire once per save: `place.<regionId>.discovered`. */
export const discoveredFlag = (regionId: string): string => `place.${regionId}.discovered`;
export const BRIGHTWATER_DISCOVERED_FLAG = discoveredFlag('brightwater');
/** R01's field state (thread 6 writes `'scorched'` or `'saved'`). */
export const BARLEY_FLAG = 'world.brightwater.barley';

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

        // Wynn's field takes R01's outcome and re-derives it on a loaded save.
        const solid = layout.structures.filter((st) => st.mode !== 'open');
        let barley = buildBarley(layout.fields, height, 1, solid);
        ctx.scene.add(barley.object);
        const swapBarley = (): void => {
          barley.dispose();
          barley = buildBarley(layout.fields, height, 1, solid, {
            variant: barleyVariantOf(ctx.state.getFlag(BARLEY_FLAG)),
            variantFields: ['barley-west'],
          });
          ctx.scene.add(barley.object);
        };
        // The value changes between two truthy words, which a boolean gate would not notice: listen for the key and for loads.
        cleanups.push(ctx.events.on('flag.changed', (e: { key?: string } | undefined) => e?.key === BARLEY_FLAG && swapBarley()));
        cleanups.push(ctx.events.on('save.loaded', swapBarley));
        cleanups.push(() => {
          ctx.scene.remove(barley.object);
          barley.dispose();
        });
        if (ctx.state.getFlag(BARLEY_FLAG) !== undefined) swapBarley();

        // The corridor beyond Kettlewick: road, water, reeds; the Leap POIs; the toll-post; the slice fog wall.
        const scenery = buildCorridorScenery(height);
        ctx.scene.add(scenery.object);
        cleanups.push(() => scenery.dispose());
        const poi = buildPoiProps(ctx, ctx.anchors);
        cleanups.push(() => poi.dispose());
        const tollAnchor = ctx.anchors.find('ford.toll-post');
        if (tollAnchor) {
          let toll: TollPostHandle | null = spawnTollPost(ctx, tollAnchor, { broken: ctx.state.getBool(TOLL_POST_BROKEN_FLAG) });
          cleanups.push(() => toll?.dispose());
          cleanups.push(
            ctx.events.on('save.loaded', () => {
              toll?.dispose();
              toll = spawnTollPost(ctx, tollAnchor, { broken: ctx.state.getBool(TOLL_POST_BROKEN_FLAG) });
            }),
          );
        }
        const fogAnchor = ctx.anchors.find('fog.harrowmark');
        if (fogAnchor && ctx.physics.rapier) {
          const fog = buildFogWall({ ...ctx, rapier: ctx.physics.rapier }, { x: FOG_WALL_X, y: fogAnchor.position.y, z: fogAnchor.position.z });
          cleanups.push(() => fog.dispose());
        }

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
              const flag = discoveredFlag(now);
              if (!ctx.state.getBool(flag)) {
                ctx.state.setFlag(flag, true);
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
