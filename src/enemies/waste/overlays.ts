// Registers the Waste creatures' behaviour overlays (Act 4 L5). Imported for its side effect by the waste plugin and the
// tests; `defs.ts` names the ids.
import { registerBehaviour } from '../behaviours';
import { makeGnatsOverlay } from './gnats/overlay';
import { makeHuskKnightOverlay } from './huskKnight/overlay';
import { makeStriderOverlay } from './strider/overlay';

registerBehaviour('strider', makeStriderOverlay);
registerBehaviour('husk-knight', makeHuskKnightOverlay);
registerBehaviour('gnats', makeGnatsOverlay);
