import { registerBehaviour } from '../behaviours';
import { makeFlightOverlay, type WyrmHub } from './flightOverlay';

/**
 * The wyrm behaviour overlays, registered on import (spawners.ts imports this module, and the enemies plugin imports
 * the spawners, so every game and harness that has enemies has the overlays). The wyrm plugin fills `WYRM_HUB` with
 * its decal, sound and event callbacks while it is set up and empties it on teardown; without it they are silent.
 */
export const WYRM_HUB: WyrmHub = {};

registerBehaviour('wyrm-flight', (ctx) => makeFlightOverlay(ctx, WYRM_HUB));
