import type { GamePlugin } from '../../core/plugins';
import './overlays';
import './events';
import { resetLines } from './warhost/lines';

/**
 * Act 5 N5, the Caldera creatures (plans/act5-N5.md): resets every Warhost shield line on a rest and a load. The kill XP
 * factor is set by `act5-core` (by area); the bestiary rows are N9's to register (`CALDERA_CODEX_ROWS`). The ambient
 * spawner table joins once N1 lists its sites.
 */
const plugin: GamePlugin = {
  id: 'act5-creatures',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const offs: Array<() => void> = [
      ctx.events.on('rest', () => resetLines()),
      ctx.events.on('save.loaded', () => resetLines()),
    ];
    (plugin as { _offs?: Array<() => void> })._offs = offs;
  },
  dispose() {
    const offs = (plugin as { _offs?: Array<() => void> })._offs;
    for (const off of (offs ?? []).reverse()) off();
    (plugin as { _offs?: Array<() => void> })._offs = undefined;
  },
};

export default plugin;
