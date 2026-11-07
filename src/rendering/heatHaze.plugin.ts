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
    // The quality plugin may set up after this one (ties break by id), so the tier is looked up until it exists. Until then
    // the pass is off: Low never sees a copy.
    const haze = new HeatHaze('low');
    offs.push(() => haze.dispose());
    offs.push(ctx.services.provide('heatHaze', haze));
    let followed = false;
    const follow = (): void => {
      if (followed) return;
      const quality = ctx.services.get('quality');
      if (!quality) return;
      followed = true;
      haze.setStep(quality.step);
      offs.push(quality.subscribe((step) => haze.setStep(step)));
    };
    follow();
    let t = 0;
    offs.push(
      ctx.systems.add({
        id: 'rendering.heatHaze',
        renderPhase: 'afterCamera',
        order: 900,
        render(_alpha, frameTime) {
          follow();
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
