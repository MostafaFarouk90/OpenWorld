// Plugin `heat-haze` (N3, plans/act5-N3.md 1.5): the `heatHaze` service. Follows the quality tier live (High and Medium
// on, Low off). Each render frame, before the scene draws, it picks the nearest cards in view; the copy happens in the first
// card's own draw. Headless (no camera) it exists and does nothing.
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { HeatHaze } from './heatHaze';

let offs: Array<() => void> = [];

const plugin: GamePlugin = {
  id: 'heat-haze',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    const quality = ctx.services.get('quality');
    const haze = new HeatHaze(quality?.step ?? 'medium');
    offs.push(() => haze.dispose());
    offs.push(ctx.services.provide('heatHaze', haze));
    if (quality) offs.push(quality.subscribe((step) => haze.setStep(step)));
    let t = 0;
    offs.push(
      ctx.systems.add({
        id: 'rendering.heatHaze',
        renderPhase: 'afterCamera',
        order: 900,
        render(_alpha, frameTime) {
          t += Number.isFinite(frameTime) ? Math.min(0.25, Math.max(0, frameTime)) : 0;
          haze.update(ctx.camera, t);
        },
      }),
    );
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) off();
    offs = [];
  },
};

export default plugin;
