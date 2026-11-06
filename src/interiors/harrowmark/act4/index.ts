// Harrowmark's Act 4 interiors (L2), one index: `interiors.plugin.ts` spreads `ACT4_HARROWMARK_INTERIORS`, the door locks and
// the flag blockers once. New interiors only: the shipped Keep hall and D02's Underways are pinned and untouched.
import { DEEP_RUN_DEF, DEEP_RUN_DOOR_ID, DEEP_RUN_EXIT_DOOR_ID, DEEP_RUN_SLUICE, DEEP_RUN_SLUICE_FLAG, DEEP_RUN_STAIRS_LINK_ANCHOR } from '../../deeprun/generate';
import type { InteriorDef } from '../../types';
import { CHAMBER_BACK_DOOR_ID, CHAMBER_DOOR_ID, CHAMBER_LOCK_FLAG, CHAMBER_STAIRS_LINK_ANCHOR, COUNCIL_CHAMBER_DEF } from './councilChamber';
import { CRUCIBLE_ARENA_GATE, CRUCIBLE_ARENA_GATE_FLAG, CRUCIBLE_DEF, CRUCIBLE_DOOR_ID, CRUCIBLE_LOCK_FLAG } from './crucible';
import { KEEP_STAIRS_DEF, STAIRS_CHAMBER_LINK_ANCHOR, STAIRS_DEEP_RUN_LINK_ANCHOR, STAIRS_DOOR_ID, STAIRS_FOOT_DOOR_ID } from './keepStairs';

export * from './councilChamber';
export * from './crucible';
export * from './keepStairs';

export const ACT4_HARROWMARK_INTERIORS: readonly InteriorDef[] = [COUNCIL_CHAMBER_DEF, KEEP_STAIRS_DEF, CRUCIBLE_DEF, DEEP_RUN_DEF];

/** Entering only (exits never lock); L10 writes the flags. The link-only doors have no outside prompt. */
export const ACT4_HARROWMARK_DOOR_LOCKS: Readonly<Record<string, string>> = {
  [CHAMBER_DOOR_ID]: CHAMBER_LOCK_FLAG,
  [CRUCIBLE_DOOR_ID]: CRUCIBLE_LOCK_FLAG,
  // A transfer checks the target door's lock too: the stairs open with M39 and the deep run with M40.
  [STAIRS_DOOR_ID]: 'story.m39.started',
  [DEEP_RUN_DOOR_ID]: 'story.m40.started',
};

/** Flag-driven blockers (closed while the flag is false; re-derived on a load). */
export const ACT4_HARROWMARK_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  [CRUCIBLE_ARENA_GATE]: CRUCIBLE_ARENA_GATE_FLAG,
  [DEEP_RUN_SLUICE]: DEEP_RUN_SLUICE_FLAG,
};

/**
 * The interior-to-interior links (L0's v0.8 item 9b, `InteriorLinkDef`): an interactable at `from.anchor` inside `from.interior`
 * transfers to `to.doorId` of `to.interior`. Registered once L0's links land (plain data until then).
 */
export const ACT4_HARROWMARK_LINKS = [
  { id: 'chamber-to-stairs', from: { interior: COUNCIL_CHAMBER_DEF.id, anchor: CHAMBER_STAIRS_LINK_ANCHOR }, to: { interior: KEEP_STAIRS_DEF.id, doorId: STAIRS_DOOR_ID } },
  { id: 'stairs-to-chamber', from: { interior: KEEP_STAIRS_DEF.id, anchor: STAIRS_CHAMBER_LINK_ANCHOR }, to: { interior: COUNCIL_CHAMBER_DEF.id, doorId: CHAMBER_BACK_DOOR_ID } },
  { id: 'stairs-to-deeprun', from: { interior: KEEP_STAIRS_DEF.id, anchor: STAIRS_DEEP_RUN_LINK_ANCHOR }, to: { interior: DEEP_RUN_DEF.id, doorId: DEEP_RUN_DOOR_ID } },
  { id: 'deeprun-to-stairs', from: { interior: DEEP_RUN_DEF.id, anchor: DEEP_RUN_STAIRS_LINK_ANCHOR }, to: { interior: KEEP_STAIRS_DEF.id, doorId: STAIRS_FOOT_DOOR_ID } },
] as const;

export { DEEP_RUN_EXIT_DOOR_ID };
