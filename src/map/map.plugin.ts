import type { GamePlugin } from '../core/plugins';
import { heightAt } from '../terrain/heightfield';
import '../waystones/service';
import { FogGrid, buildMarkers, type MapMarker } from './MapModel';
import { createMapModal } from './MapView';
import { createMinimap } from './Minimap';
import { MAP_STRINGS_EN } from './strings.en';
import { renderLocalTile, renderTerrainBitmap, type TerrainBitmap } from './TerrainBitmap';
import { DEFAULT_WORLD_BOUNDS, MAP_TUNING } from './tuning';
import type { MapViewModel } from './viewTypes';

/** Metres the player may drift from the minimap tile centre before it is redrawn. */
const TILE_REFRESH_DISTANCE = 20;

const map: GamePlugin = {
  id: 'map',
  dependsOn: ['core', 'waystones'],
  setup(ctx) {
    ctx.strings.register('en', MAP_STRINGS_EN);
    const bounds = { ...DEFAULT_WORLD_BOUNDS };
    let fog = FogGrid.forBounds(bounds);
    const waystones = () => ctx.services.get('waystones');

    ctx.persist.register({
      key: 'map',
      version: 1,
      serialize: () => ({ fog: fog.encode() }),
      load: (data) => {
        const d = typeof data === 'object' && data !== null ? (data as { fog?: unknown }) : {};
        fog = FogGrid.decode(d.fog, fog.spec);
      },
    });

    // Terrain bitmaps are rendered in time-boxed slices, one slice per frame.
    let full: TerrainBitmap | null = null;
    const fullGen = renderTerrainBitmap(heightAt, {
      bounds,
      width: MAP_TUNING.fullMapPixels,
      height: MAP_TUNING.fullMapPixels,
    });
    let tile: { bitmap: TerrainBitmap; centerX: number; centerZ: number } | null = null;
    let tileGen: ReturnType<typeof renderLocalTile> | null = null;
    let tileCenter = { x: 0, z: 0 };

    const stepGenerators = () => {
      if (!full) {
        const r = fullGen.next();
        if (r.done) full = r.value;
      }
      if (!tileGen) {
        const f = ctx.player.feet;
        if (!tile || Math.hypot(f.x - tile.centerX, f.z - tile.centerZ) > TILE_REFRESH_DISTANCE) {
          tileCenter = { x: f.x, z: f.z };
          tileGen = renderLocalTile(heightAt, f.x, f.z);
        }
      }
      if (tileGen) {
        const r = tileGen.next();
        if (r.done) {
          tile = { bitmap: r.value, centerX: tileCenter.x, centerZ: tileCenter.z };
          tileGen = null;
        }
      }
    };

    const model: MapViewModel = {
      bounds,
      fullBitmap: () => full,
      minimapTile: () => tile,
      fog: () => fog,
      markers: (): MapMarker[] =>
        buildMarkers({
          waystones: (waystones()?.ids() ?? []).flatMap((id) => {
            const p = waystones()?.position(id);
            if (!p) return [];
            const lit = waystones()?.isLit(id) ?? false;
            return [{ id, x: p.x, z: p.z, state: lit ? ('rekindled' as const) : ('dormant' as const), discovered: lit || fog.isRevealed(p.x, p.z), label: id }];
          }),
        }),
      player: () => ({ x: ctx.player.feet.x, z: ctx.player.feet.z, yaw: ctx.player.facingYaw }),
      travelBlockedReason: () => waystones()?.travelBlockedReason() ?? 'busy',
      travel: (id) => void waystones()?.travel(id),
      t: (k, p) => ctx.strings.t(k, p),
    };

    let closeModal: (() => void) | null = null;
    ctx.systems.add({
      id: 'map.input',
      fixedPhase: 'input',
      order: 0,
      fixedUpdate() {
        if (typeof document === 'undefined') return;
        if (ctx.hud.modalOpen === 'map.modal' && (ctx.input.actions.pressed('map') || ctx.input.actions.pressed('menu'))) {
          closeModal?.();
          return;
        }
        if (!ctx.input.actions.pressed('map') || ctx.input.contexts.top() !== 'gameplay' || ctx.hud.modalOpen) return;
        const widget = createMapModal({ model, close: () => closeModal?.() });
        closeModal = ctx.hud.openModal(widget);
        if (closeModal) {
          widget.focusDefault();
          ctx.services.get('prompts')?.success('map');
        }
      },
    });

    let sinceReveal = 0;
    ctx.systems.add({
      id: 'map.fog',
      fixedPhase: 'late',
      order: 50,
      fixedUpdate(dt) {
        sinceReveal += dt;
        if (sinceReveal < 1 / MAP_TUNING.fogRevealHz) return;
        sinceReveal = 0;
        const f = ctx.player.feet;
        fog.reveal(f.x, f.z, MAP_TUNING.revealRadius);
      },
    });

    ctx.systems.add({
      id: 'map.bitmaps',
      renderPhase: 'hud',
      order: 100,
      render: stepGenerators,
    });

    if (typeof document !== 'undefined') {
      ctx.hud.mount('top-right', createMinimap({ model }));
    }
  },
};

export default map;
