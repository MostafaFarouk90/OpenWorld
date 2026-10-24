import { registerBehaviour } from '../behaviours';
import { makeLurkOverlay } from './leech/lurk';
import { makePeatOverlay } from './shambler/peat';

// K6b: the Greyfen creatures' behaviour overlays, registered on import (as wyrm/overlays.ts), so the enemies stack runs them
// without the fen plugin. act3Spawners.ts imports this module.
registerBehaviour('lurk', makeLurkOverlay);
registerBehaviour('peat', makePeatOverlay);
