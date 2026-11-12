// The Caldera's interiors (Act 5 N2), one index: `interiors.plugin.ts` spreads `CALDERA_INTERIORS`, the door locks, the flag blockers
// and the links once. New interiors only; no shipped interior is touched.
import type { InteriorDef, InteriorLinkDef } from '../../interiors/types';
import { COOLING_HALL_DEF } from './coolingHall';
import { FOUNDRY_DESCENT_DEF, FOUNDRY_LINK_ANCHOR } from './foundryDescent';
import { HAMMER_HALL_DEF, HAMMER_LINK_ANCHOR } from './hammerHall';
import { BLOCKERS, CALDERA_INTERIOR_FLAGS as F, COOLING_HALL_DOOR_ID, FOUNDRY_DESCENT_ID, FOUNDRY_DOOR_ID, FOUNDRY_FOOT_DOOR_ID, HAMMER_HALL_DOOR_ID, HAMMER_HALL_ID, STOKERS_TUNNEL_DOOR_ID } from './sites';
import { STOKERS_TUNNEL_DEF } from './stokersTunnel';

export * from './coolingHall';
export * from './foundryDescent';
export * from './hammerHall';
export * from './sites';
export * from './stokersTunnel';

export const CALDERA_INTERIORS: readonly InteriorDef[] = [COOLING_HALL_DEF, STOKERS_TUNNEL_DEF, FOUNDRY_DESCENT_DEF, HAMMER_HALL_DEF];

/** Entering only (exits never lock); the quest threads write the flags. A transfer checks the target door's lock too. */
export const CALDERA_DOOR_LOCKS: Readonly<Record<string, string>> = {
  [COOLING_HALL_DOOR_ID]: F.coolingHallOpen,
  [STOKERS_TUNNEL_DOOR_ID]: F.tunnelStarted,
  [FOUNDRY_DOOR_ID]: F.foundryStarted,
  [HAMMER_HALL_DOOR_ID]: F.foundryComplete,
};

/** Flag-driven blockers (closed while the flag is unset; re-derived on a load). The tunnel seal and the Hammer floor are the plugin's. */
export const CALDERA_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  [BLOCKERS.coolingGate2]: F.channel1,
  [BLOCKERS.coolingGate3]: F.channel2,
  [BLOCKERS.coolingForge]: F.m50Complete,
  [BLOCKERS.foundryLift]: F.slagRouted,
  [BLOCKERS.foundryArenaExit]: F.veyOutcome,
  [BLOCKERS.hammerHallGate]: F.m54Complete,
};

/** The Foundry to Hammer Hall chain, both ways (the Act 4 chamber pattern). */
export const CALDERA_LINKS: readonly InteriorLinkDef[] = [
  { id: 'foundry-to-hammer', from: { interior: FOUNDRY_DESCENT_ID, anchor: FOUNDRY_LINK_ANCHOR }, to: { interior: HAMMER_HALL_ID, doorId: HAMMER_HALL_DOOR_ID } },
  { id: 'hammer-to-foundry', from: { interior: HAMMER_HALL_ID, anchor: HAMMER_LINK_ANCHOR }, to: { interior: FOUNDRY_DESCENT_ID, doorId: FOUNDRY_FOOT_DOOR_ID } },
];
