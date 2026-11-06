// Plugin `waste-life` (Act 4 L1 PR 2): discovery of the Waste's five sites and eleven POIs (`place.<placeId>.discovered`
// once, `discover { kind: 'poi' }`, a toast; L9 reads the flags for the map and codex), and the story dressing of the
// Ashgate refuge and the Walker Camp, re-derived on every flag change and on a load.
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { NpcModelLoader } from '../../npcs/types';
import { heightAt } from '../../terrain/heightfield';
import { cisternsFull, discoveredFlag, R19_CHOICE_FLAG, R21_CHOICE_FLAG, R24_CHOICE_FLAG, REFUGE_PRESENT_FLAG, refugeDressing, WASTE_PLACES } from './wasteLife';
import { WasteLifeVisuals } from './wasteLifeVisuals';
import { WASTE_LIFE_STRINGS_EN } from './strings.en';

const WATCHED = new Set([REFUGE_PRESENT_FLAG, R19_CHOICE_FLAG, R21_CHOICE_FLAG, R24_CHOICE_FLAG]);

export interface WasteLifeOptions {
  heightAt?: (x: number, z: number) => number;
}

export function createWasteLifePlugin(opts: WasteLifeOptions = {}): GamePlugin {
  return {
    id: 'waste-life',
    dependsOn: ['core'],
    setup(ctx: GameContext) {
      ctx.strings.register('en', WASTE_LIFE_STRINGS_EN);
      const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
      const offs: (() => void)[] = [];

      // ---- discovery
      const byTrigger = new Map(WASTE_PLACES.map((p) => [p.triggerId, p]));
      offs.push(
        ctx.events.on('trigger.enter', (e) => {
          const p = byTrigger.get(e.triggerId);
          if (!p || e.actorId !== ctx.player.actor.id || ctx.state.getBool(discoveredFlag(p.placeId))) return;
          ctx.state.setFlag(discoveredFlag(p.placeId), true);
          emit('discover', { placeId: p.placeId, kind: 'poi' });
          emit('hud.toast', { textKey: 'waste.found', params: { name: ctx.strings.t(p.nameKey) } });
        }),
      );

      // ---- the refuge and the camp
      const assets = ctx.assets as unknown;
      const l = assets as Partial<NpcModelLoader> | null | undefined;
      const loader = l && typeof l.load === 'function' && typeof l.instantiate === 'function' && typeof l.animations === 'function' ? (l as NpcModelLoader) : undefined;
      const visuals = new WasteLifeVisuals({ heightAt: opts.heightAt ?? heightAt, loader });
      ctx.scene.add(visuals.refuge, visuals.camp);
      const flags = { getBool: (k: string) => ctx.state.getBool(k), getString: (k: string) => String(ctx.state.getFlag(k) ?? '') };
      const derive = () => {
        visuals.apply(refugeDressing(flags));
        visuals.setCisterns(cisternsFull(flags));
      };
      derive();
      offs.push(ctx.events.on('flag.changed', ({ key }) => WATCHED.has(key) && derive()));
      offs.push(ctx.events.on('save.loaded', derive));

      ctx.systems.add({
        id: 'waste-life.render',
        renderPhase: 'world',
        render(_alpha, frameTime) {
          visuals.update(frameTime);
        },
        dispose() {
          for (const off of offs.splice(0)) off();
          visuals.dispose();
        },
      });
    },
  };
}

export default createWasteLifePlugin();
