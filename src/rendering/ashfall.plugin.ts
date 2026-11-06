// Act 4 L3: the Harrowmark ash-fall and dusk (src/rendering/ashfall.ts). Render only; nothing headless.
import type { GamePlugin } from '../core/plugins';
import { installAshfall } from './ashfall';

let off: (() => void) | null = null;

export default {
  id: 'ashfall',
  dependsOn: ['core'],
  setup(ctx) {
    off = installAshfall(ctx);
  },
  dispose() {
    off?.();
    off = null;
  },
} satisfies GamePlugin;
