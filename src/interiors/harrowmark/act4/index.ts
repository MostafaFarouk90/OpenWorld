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
  // A transfer checks the target door's lock too. The stairs open with the betrayal itself (the chamber's front door is
  // shut from then, so the stairs are never a dead end's only way out), the deep run once the stairs are held (M39 done).
  [STAIRS_DOOR_ID]: 'story.m38.complete',
  // L10 PR 2: with M40 itself (Rook's offer), so the first den cannot be cleared before its step can count it
  [DEEP_RUN_DOOR_ID]: 'story.m40.started',
  // The grate outside the north wall opens from outside with M40: a player who left the run (a death respawn at the camp)
  // can go back in and finish it.
  [DEEP_RUN_EXIT_DOOR_ID]: 'story.m40.started',
};

/**
 * Exits that refuse while a flag holds (L2, additive to the interiors plugin): from the betrayal the chamber's front door
 * would put the player in the held city, cut off from the stairs, so it stays shut; the way out is down the stairs.
 */
export const ACT4_HARROWMARK_EXIT_LOCKS: Readonly<Record<string, { flag: string; toastKey: string; unlessFlag?: string }>> = {
  // N13 (v0.9 item 10): the city is open again in the world after the ending, so the front door lets the player out.
  [CHAMBER_DOOR_ID]: { flag: 'story.m38.complete', toastKey: 'interior.refused.chamberHeld', unlessFlag: 'world.afterEnding' },
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
