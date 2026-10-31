import { registerBehaviour } from '../behaviours';
import { makeFlightOverlay } from './flightOverlay';
import { makeSkittishOverlay, type SkittishHub } from './skittish';
import { makeYsmerythOverlay, type YsmerythHub } from './ysmeryth/overlay';

/**
 * The wyrm behaviour overlays, registered on import (spawners.ts imports this module, and the enemies plugin imports
 * the spawners, so every game and harness that has enemies has the overlays). The wyrm plugin fills `WYRM_HUB` with
 * its decal, sound, chain and event callbacks while it is set up and empties it on teardown; without it the overlays
 * run silent and unchained.
 */
export const WYRM_HUB: SkittishHub = {};

registerBehaviour('wyrm-flight', (ctx) => makeFlightOverlay(ctx, WYRM_HUB));
registerBehaviour('skittish', (ctx) => makeSkittishOverlay(ctx, WYRM_HUB));

/** K6a PR 2: Ysmeryth's trial overlay; the `ysmeryth` plugin fills this hub with the trial controller's side. */
export const YSMERYTH_HUB: YsmerythHub = {};
registerBehaviour('ysmeryth-trial', (ctx) => makeYsmerythOverlay(ctx, YSMERYTH_HUB));
