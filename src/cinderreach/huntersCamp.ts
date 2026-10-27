// The hunters' camp (M15), on the flat spots of the committed fit: tents, cages (the wyrmling's and the bound carter's), ledger
// desks and crates, the search spots, the stealth bounds and the packs' spawns.
import type { LayoutData } from '../region/layoutTypes';
import { a, box, numbered, polar, ring, solid } from './helpers';
import { SITES_FIT } from './sitesFit';

const C = SITES_FIT.camp;
/** M15's watch loop in walking order: `cinderreach.patrol.m15.camp.<n>`, compass 20, 65, 110, ... 335 degrees, 36 m out. */
export const M15_WATCH_LOOP = [1, 5, 2, 6, 3, 7, 4, 8] as const;
/** Node n of the loop: 1 to 4 at compass 20 + 90 (n - 1), 5 to 8 halfway after each. */
const m15LoopNode = (n: number) => polar(C.centre.x, C.centre.z, n <= 4 ? 20 + 90 * (n - 1) : 65 + 90 * (n - 5), 36);
/**
 * The props stay where the committed fit put them. The south tent (3) and the carter's cage (2) have the camp to their north, so
 * the cage keys and the bound carter are placed on that camp-facing side (`north`): reachable walking straight in from the north
 * with no collider between, and standing at their own prop. huntersCamp.test.ts checks both the corridor and the distance.
 */
const front = (p: { x: number; z: number }, half: number) => [p.x, p.z - half - 1.5] as const;
const north = (p: { x: number; z: number }, half: number) => [p.x, p.z + half + 1.5] as const;

export function huntersCampLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  return {
    anchors: [
      // Two desks, a tally board by a tent and the map tent (cage keys hang by the cage).
      ...numbered('cinderreach.m15.search', [front(C.desks[0], 1), front(C.desks[1], 1), front(C.tents[0], 2.5), north(C.tents[2], 2.5)], ['objective']),
      a('cinderreach.m15.cage', ...front(C.cages[0], 1.5), 0, ['objective']),
      a('cinderreach.m15.carter', ...north(C.cages[1], 1.5), 0, ['objective']),
      a('npc-post.carter-bound', ...north(C.cages[1], 1.5), 0, ['npc-post']),
      // Ambient pack (1 to 4, slot 4 a harpooner) and M15's two packs of four (5 to 8).
      ...numbered('cinderreach.spawn.huntercamp', ring(C.centre.x, C.centre.z, 34, 8, 20), ['spawn']),
      // M15's stealth section (A12; src/stealth/sections.ts `m15.camp`): start on the road side, a checkpoint inside, the exit by
      // the wyrmling's cage; three watch guards walk a loop round the camp and four hide spots sit between the tents.
      // The loop is an octagon at 36 m (the four nodes 1 to 4 and the four between them, 5 to 8): its legs pass 33 m out, 6.7 m
      // clear of the south, west and north tents and 3.8 m of the east one, so the crossing on the road side is in the open in
      // view of the start. It was a square through 1 to 4 alone, whose legs cut in to 25.5 m: 1.6 m off the south tent (across
      // both ways round it, the guard hidden by the tent until it rounded the corner) and touching the east one. The start stands 44 m out, 10.7 m from the loop: past a sneaking player's 9 m
      // sight, inside an upright one's 18 m. Each watch guard spawns on the node its patrol slot starts from (patrolForSlot), not
      // inside the camp. src/stealth/m15.route.test.ts sneaks both ways round the south tent at every patrol phase.
      a('cinderreach.stealth.m15.start', C.centre.x, C.centre.z - 44, 0, ['stealth']),
      a('cinderreach.stealth.m15.cp.inside', C.centre.x, C.centre.z - 12, 0, ['stealth']),
      a('cinderreach.stealth.m15.end', ...front(C.cages[0], 1.5), 0, ['stealth']),
      a('cinderreach.stealth.m15.centre', C.centre.x, C.centre.z, 0, ['stealth']),
      ...[0, 1, 2, 3].map((i) => a(`cinderreach.hide.m15.${i + 1}`, C.centre.x + 20 * Math.cos((i * Math.PI) / 2 + 0.6), C.centre.z + 20 * Math.sin((i * Math.PI) / 2 + 0.6), 0, ['hide'])),
      ...M15_WATCH_LOOP.slice(0, 3).map((n, i) => a(`cinderreach.spawn.m15.watch.${i + 1}`, ...m15LoopNode(n), 0, ['spawn'])),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => a(`cinderreach.patrol.m15.camp.${n}`, ...m15LoopNode(n), 0, ['patrol'])),
      a('npc-post.osgar.camp', C.centre.x, C.centre.z - 46, 0, ['npc-post']),
      ...numbered('cinderreach.post.camp', [[C.centre.x - 6, C.centre.z - 46], [C.centre.x + 6, C.centre.z - 46]], ['npc-post'], 0),
    ],
    triggers: [box('trg.cinderreach.m15.camp', C.centre.x, C.centre.z, 45, 10, 45)],
    structures: [
      ...C.tents.map((t, i) => solid(`cinderreach-camp-tent-${i + 1}`, 'cinder-tent', t.x, t.z, 5, 5)),
      ...C.cages.map((c, i) => solid(`cinderreach-camp-cage-${i + 1}`, 'cinder-cage', c.x, c.z, 3, 3)),
      ...C.desks.map((d, i) => solid(`cinderreach-camp-desk-${i + 1}`, 'cinder-ledger-desk', d.x, d.z, 2.2, 1.2)),
      ...C.crates.map((c, i) => solid(`cinderreach-camp-crate-${i + 1}`, 'crate', c.x, c.z, 1.4, 1.4)),
    ],
  };
}
