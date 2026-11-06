// Act 4 L4 (plans/act4-L4.md section 1.6, coordinator ruling 5): where a benched companion (one not in a seat) waits.
// The Tilted Anvil until the betrayal (`story.m38.complete`), then the M41 camp outside the walls until the Ash Road
// opens (`story.m41.complete`), then the Ashgate refuge. The wait rule reads the post every time it is derived, so the
// moves and a load need nothing else (the shipped wait rules re-derive on `save.loaded`).
//
// Each companion gets its own spot: L1 PR 1 places `ashgate.refuge.companion.<id>`; until it does (or if it never
// does), the spot is 2 m round L1's `ashgate.refuge.rest`, and round L2's `harrowmark.a4.m41.camp` for the camp.
// These are the anchors `partyPost` names; this file defines them from whichever base anchors exist.
import type { Anchor } from '../../layout/AnchorRegistry';
import { ASH_ROAD_OPEN_FLAG, M41_CAMP_ANCHOR, REFUGE_REST_ANCHOR } from '../../harrowmark/noStrand';

/** The betrayal: the benched companions leave the occupied city (contracts v0.8 item 10). */
export const BENCH_MOVES_FLAG = 'story.m38.complete';
export { ASH_ROAD_OPEN_FLAG };

/** The companions that can be benched, in the order their fallback spots go round a base anchor. */
export const BENCHED_IDS: readonly string[] = ['tobb', 'hrolf', 'aelfreda'];
/** Metres from the base anchor of a fallback spot. */
export const BENCH_FALLBACK_RADIUS = 2;

export const anvilPost = (id: string): string => `npc-post.${id}.tilted-anvil`;
/** L0's id for the refuge post (what `partyPost` names after M41). */
export const refugePost = (id: string): string => `ashgate.refuge.companions.${id}`;
/** The camp post between M38 and M41. */
export const campPost = (id: string): string => `${M41_CAMP_ANCHOR}.companions.${id}`;
/** L1's per-companion refuge spot (preferred over the fallback ring). */
export const l1RefugeSpot = (id: string): string => `ashgate.refuge.companion.${id}`;

export interface FlagLike {
  getFlag(k: string): unknown;
}

/** The post a benched companion waits at now. Without flags (tests, the shipped callers), the Anvil. */
export function benchPostFor(id: string, flags?: FlagLike | null): string {
  if (!flags?.getFlag(BENCH_MOVES_FLAG)) return anvilPost(id);
  return flags.getFlag(ASH_ROAD_OPEN_FLAG) ? refugePost(id) : campPost(id);
}

export interface BenchAnchors {
  find(id: string): Pick<Anchor, 'position' | 'yaw'> | undefined;
  define(a: Anchor): unknown;
}

/** Spot `i` of the ring round `base`, facing the base's yaw. */
function ringSpot(base: Pick<Anchor, 'position' | 'yaw'>, i: number): { position: Anchor['position']; yaw: number } {
  const a = base.yaw + (i * 2 * Math.PI) / BENCHED_IDS.length;
  // engine yaw 0 faces -Z: the spot sits along the yaw's forward direction, turned by i thirds of a circle
  return {
    position: {
      x: base.position.x - Math.sin(a) * BENCH_FALLBACK_RADIUS,
      y: base.position.y,
      z: base.position.z - Math.cos(a) * BENCH_FALLBACK_RADIUS,
    },
    yaw: base.yaw,
  };
}

/**
 * Defines whichever bench post anchors are still missing and can be made now (their base anchor exists). Idempotent;
 * answers how many posts exist afterwards (six once every base is placed).
 */
export function defineBenchPosts(anchors: BenchAnchors): number {
  let have = 0;
  BENCHED_IDS.forEach((id, i) => {
    const camp = campPost(id);
    if (!anchors.find(camp)) {
      const base = anchors.find(M41_CAMP_ANCHOR);
      if (base) anchors.define({ id: camp, ...ringSpot(base, i), tags: ['bench-post'] });
    }
    if (anchors.find(camp)) have++;

    const refuge = refugePost(id);
    if (!anchors.find(refuge)) {
      const spot = anchors.find(l1RefugeSpot(id));
      const base = anchors.find(REFUGE_REST_ANCHOR);
      if (spot) anchors.define({ id: refuge, position: { ...spot.position }, yaw: spot.yaw, tags: ['bench-post'] });
      else if (base) anchors.define({ id: refuge, ...ringSpot(base, i), tags: ['bench-post'] });
    }
    if (anchors.find(refuge)) have++;
  });
  return have;
}
