// The hunters' camp (M15), on the flat spots of the committed fit: tents, cages (the wyrmling's and the bound carter's), ledger
// desks and crates, the search spots, the stealth bounds and the packs' spawns.
import type { LayoutData } from '../region/layoutTypes';
import { a, box, numbered, ring, solid } from './helpers';
import { SITES_FIT } from './sitesFit';

const C = SITES_FIT.camp;
/**
 * Placed props. The fit put the south tent (3) squarely between the camp and the cage keys (20365, 4722) and the carter's cage
 * (4737) between the camp and the bound carter (20368, 4734), so walking straight from the north hit a collider and F focus was
 * null. The tent stands 10 m west and the carter's cage 5 m east of the fit; the anchors (keys, carter) keep their spots.
 * huntersCamp.test.ts checks the corridor and the ground under the moved props.
 */
export const CAMP_TENT_SHIFT = { index: 2, dx: -10 } as const;
export const CAMP_CAGE_SHIFT = { index: 1, dx: 5 } as const;
export const campTents = () => C.tents.map((t, i) => (i === CAMP_TENT_SHIFT.index ? { ...t, x: t.x + CAMP_TENT_SHIFT.dx } : t));
export const campCages = () => C.cages.map((c, i) => (i === CAMP_CAGE_SHIFT.index ? { ...c, x: c.x + CAMP_CAGE_SHIFT.dx } : c));

const front = (p: { x: number; z: number }, half: number) => [p.x, p.z - half - 1.5] as const;

export function huntersCampLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  return {
    anchors: [
      // Two desks, a tally board by a tent and the map tent (cage keys hang by the cage).
      ...numbered('cinderreach.m15.search', [front(C.desks[0], 1), front(C.desks[1], 1), front(C.tents[0], 2.5), front(C.tents[2], 2.5)], ['objective']),
      a('cinderreach.m15.cage', ...front(C.cages[0], 1.5), 0, ['objective']),
      a('cinderreach.m15.carter', ...front(C.cages[1], 1.5), 0, ['objective']),
      a('npc-post.carter-bound', ...front(C.cages[1], 1.5), 0, ['npc-post']),
      // Ambient pack (1 to 4, slot 4 a harpooner) and M15's two packs of four (5 to 8).
      ...numbered('cinderreach.spawn.huntercamp', ring(C.centre.x, C.centre.z, 34, 8, 20), ['spawn']),
      // M15's stealth section (A12; src/stealth/sections.ts `m15.camp`): start on the road side, a checkpoint inside, the exit by
      // the wyrmling's cage; three watch guards walk a loop round the camp and four hide spots sit between the tents.
      a('cinderreach.stealth.m15.start', C.centre.x, C.centre.z - 40, 0, ['stealth']),
      a('cinderreach.stealth.m15.cp.inside', C.centre.x, C.centre.z - 12, 0, ['stealth']),
      a('cinderreach.stealth.m15.end', ...front(C.cages[0], 1.5), 0, ['stealth']),
      a('cinderreach.stealth.m15.centre', C.centre.x, C.centre.z, 0, ['stealth']),
      ...[0, 1, 2, 3].map((i) => a(`cinderreach.hide.m15.${i + 1}`, C.centre.x + 20 * Math.cos((i * Math.PI) / 2 + 0.6), C.centre.z + 20 * Math.sin((i * Math.PI) / 2 + 0.6), 0, ['hide'])),
      ...ring(C.centre.x, C.centre.z, 26, 3, 40).map(([x, z], i) => a(`cinderreach.spawn.m15.watch.${i + 1}`, x, z, 0, ['spawn'])),
      ...numbered('cinderreach.patrol.m15.camp', ring(C.centre.x, C.centre.z, 36, 4, 20), ['patrol']),
      a('npc-post.osgar.camp', C.centre.x, C.centre.z - 46, 0, ['npc-post']),
      ...numbered('cinderreach.post.camp', [[C.centre.x - 6, C.centre.z - 46], [C.centre.x + 6, C.centre.z - 46]], ['npc-post'], 0),
    ],
    triggers: [box('trg.cinderreach.m15.camp', C.centre.x, C.centre.z, 45, 10, 45)],
    structures: [
      ...campTents().map((t, i) => solid(`cinderreach-camp-tent-${i + 1}`, 'cinder-tent', t.x, t.z, 5, 5)),
      ...campCages().map((c, i) => solid(`cinderreach-camp-cage-${i + 1}`, 'cinder-cage', c.x, c.z, 3, 3)),
      ...C.desks.map((d, i) => solid(`cinderreach-camp-desk-${i + 1}`, 'cinder-ledger-desk', d.x, d.z, 2.2, 1.2)),
      ...C.crates.map((c, i) => solid(`cinderreach-camp-crate-${i + 1}`, 'crate', c.x, c.z, 1.4, 1.4)),
    ],
  };
}
