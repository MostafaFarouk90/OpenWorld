// The world after the ending (Act 5 N13, plans/act5-N13.md section 4): the vendors, trainers and talk posts that moved out
// of Harrowmark (the Ashgate refuge from M41, the Rim Camp from M49) go home. Data only, read live through flag
// conditions, so a load re-derives it and nothing changes while `world.afterEnding` is unset.
//
// - Shops and desks: the moved rows stop holding after the ending (read in `vendorAnchor` and `trainerPlacement`; the
//   tables are unchanged), so each falls back to the row before it or to its shipped anchor. The keepers of the Caldera (Alric, Maud's rim kitchen)
//   and the posts that were never in the city (Hild at Ashgate, Wulfhild at the Walker Camp) stay.
// - The Knight desk: Gaut is retired, so Captain Rook keeps it, at Gaut's own Bastion desk.
// - Talk posts: a first row sends each mover home (the first matching row wins in the post director).
import type { FlagCondition } from '../core/flagCondition';
import type { Condition } from '../quests/types';
import { AFTER_ENDING_FLAG, afterEnding, type FlagReader } from './flags';

/** Anchor prefixes of the posts outside the walls that the ending empties (the refuge's and the Rim Camp's). */
export const MOVED_POST_PREFIXES: readonly string[] = ['ashgate.refuge.', 'caldera.camp.'];
/** Rows at those posts that stay: the Caldera's own keepers. */
export const STAYS_AFTER_ENDING: readonly string[] = ['alric', 'maud-rim'];

/** True for a row the ending lifts (a moved vendor or trainer post that is not a Caldera keeper's). */
export function liftsAfterEnding(row: { anchor: string; who: string }): boolean {
  return MOVED_POST_PREFIXES.some((p) => row.anchor.startsWith(p)) && !STAYS_AFTER_ENDING.includes(row.who);
}

/**
 * A VENDOR_POSTS or TRAINER_POSTS row still holds for these flags (read by `vendorAnchor` and `trainerPlacement`, so the
 * tables themselves are unchanged): false only after the ending, for a lifted row.
 */
export function rowHoldsAfterEnding(anchor: string, who: string, flags: FlagReader): boolean {
  return !(afterEnding(flags) && liftsAfterEnding({ anchor, who }));
}

/** Gaut's Bastion desk, which Rook keeps after the ending. */
export const KNIGHT_DESK_AFTER = 'harrowmark.bastion.trainer.gaut';
/** Rook's talk post after the ending: Gaut's Bastion post, 2.5 m behind the desk (within TRAINER_POST_RADIUS). */
export const ROOK_POST_AFTER = 'npc-post.gaut.bastion';
/** The Knight desk's row after the ending (`trainerPlacement` falls back to it when no other row holds). */
export const AFTER_KNIGHT_DESK = {
  classId: 'knight' as const,
  npcId: 'rook',
  post: KNIGHT_DESK_AFTER,
  when: { all: [AFTER_ENDING_FLAG] } as FlagCondition,
  nameKey: 'classes.trainer.rook',
};

/**
 * The talk posts sent home after the ending: everyone with a Rim Camp talk post (N1's `RIM_CAMP.talk`) whose home is in
 * the city. Wulfhild (the Walker Camp), Maud (Cinderford), Alric and Ansgar are not city folk. `null`: the rule's home.
 */
export const HOME_AFTER_ENDING: Readonly<Record<string, string | null>> = {
  wystan: null,
  merrin: null,
  wenna: null,
  edric: null,
  rook: ROOK_POST_AFTER,
};

const AFTER: Condition = { flag: AFTER_ENDING_FLAG };

/** The post rules with a first "after the ending, go home" row for each NPC in HOME_AFTER_ENDING. Never drops a row. */
export function withAfterEndingPosts<R extends { npcId: string; home: string; posts: { when: Condition; anchorId: string }[] }>(rules: R[]): R[] {
  return rules.map((r) => {
    if (!(r.npcId in HOME_AFTER_ENDING)) return r;
    const anchorId = HOME_AFTER_ENDING[r.npcId] ?? r.home;
    return { ...r, posts: [{ when: AFTER, anchorId }, ...r.posts] };
  });
}

/** For table tests in other owners' files: a rule with N13's after-ending row taken off (the inverse of `withAfterEndingPosts`). */
export function withoutAfterEndingRows<R extends { posts: { when: Condition; anchorId: string }[] }>(r: R): R {
  return { ...r, posts: r.posts.filter((p) => p.when !== AFTER) };
}
