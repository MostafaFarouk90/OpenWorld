// The hunters' camp (M15), on the flat spots of the committed fit: tents, cages (the wyrmling's and the bound carter's), ledger
// desks and crates, the search spots, the stealth bounds and the packs' spawns.
import type { LayoutData } from '../region/layoutTypes';
import { a, box, numbered, ring, solid } from './helpers';
import { SITES_FIT } from './sitesFit';

const C = SITES_FIT.camp;
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
