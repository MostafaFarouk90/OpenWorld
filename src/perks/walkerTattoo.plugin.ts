// Plugin `walker-tattoo` (L7): registers the Walker Tattoo on the perks service.
import type { GamePlugin } from '../core/plugins';
import { walkerTattoo } from './walkerTattoo';

let off: (() => void) | null = null;

const walkerTattooPlugin: GamePlugin = {
  id: 'walker-tattoo',
  dependsOn: ['core', 'perks'],
  setup(ctx) {
    off = ctx.services.require('perks').register(walkerTattoo(ctx.state));
  },
  dispose() {
    off?.();
    off = null;
  },
};

export default walkerTattooPlugin;
