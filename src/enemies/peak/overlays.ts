import { registerBehaviour } from '../behaviours';
import { makeHawkOverlay } from './hawk/overlay';
import { makeOgreOverlay } from './ogre/overlay';

// K6b PR 2: the Dragonspine creatures' behaviour overlays, registered on import (as fen/overlays.ts), so the enemies stack runs
// them without the peak plugin. act3Spawners.ts imports this module.
registerBehaviour('hawk', makeHawkOverlay);
registerBehaviour('ogre', makeOgreOverlay);
