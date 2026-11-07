import type { GamePlugin } from '../../core/plugins';
import './overlays';
import './events';
import { resolveLayout } from '../../region/resolveLayout';
import { heightAt } from '../../terrain/heightfield';
import { CALDERA_FAUNA_LAYOUT } from './calderaFauna.layout';
import { resetLines } from './warhost/lines';

/**
 * Act 5 N5, the Caldera creatures (plans/act5-N5.md): resets every Warhost shield line on a rest and a load. The kill XP
 * factor is set by `act5-core` (by area); the bestiary rows are N9's to register (`CALDERA_CODEX_ROWS`). The ambient
 * spawner table (spawners.ts) stands on N1's CALDERA_FAUNA_SITES; this plugin defines its anchors.
 */
const plugin: GamePlugin = {
  id: 'act5-creatures',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    for (const a of resolveLayout(CALDERA_FAUNA_LAYOUT, heightAt).anchors) {
      offs.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
    }
    offs.push(
      ctx.events.on('rest', () => resetLines()),
      ctx.events.on('save.loaded', () => resetLines()),
    );
    (plugin as { _offs?: Array<() => void> })._offs = offs;
  },
  dispose() {
    const offs = (plugin as { _offs?: Array<() => void> })._offs;
    for (const off of (offs ?? []).reverse()) off();
    (plugin as { _offs?: Array<() => void> })._offs = undefined;
  },
};

export default plugin;
