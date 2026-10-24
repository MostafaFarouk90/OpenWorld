// The causeways (K1 shapes the raised ground; K3 adds the way-markers, M23's searches, leech knots and plank bridges) and
// R12's five reed beds beside the Reedgate line.
import type { LayoutData } from '../region/layoutTypes';
import { a, numbered, ring, solid, sphere } from './helpers';
import { BRIDGES, CAUSEWAY_LENGTH, CAUSEWAYS, REED_BED_SIZE, REED_BEDS, REED_CUTTERS, REEDGATE_CAUSEWAY, roadPoint } from './places';
import { SITES } from './sites';

const MARKER_EVERY = 150;
const headingOf = (dirX: number, dirZ: number) => ((Math.atan2(dirX, dirZ) * 180) / Math.PI + 360) % 360;

/** A point on the Reedgate causeway deck, `s` m along and `side` m left of travel. */
const cw = (s: number, side = 0) => roadPoint(REEDGATE_CAUSEWAY, s, side);

export function causewayLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const L = CAUSEWAY_LENGTH[REEDGATE_CAUSEWAY];
  const markers = CAUSEWAYS.flatMap((id) => {
    const n = Math.floor(CAUSEWAY_LENGTH[id] / MARKER_EVERY);
    return Array.from({ length: n - 1 }, (_, i) => {
      const p = roadPoint(id, (i + 1) * MARKER_EVERY, 2.6);
      return solid(`greyfen-marker-${id.replace('causeway-', '')}-${i + 1}`, 'greyfen-marker', p.x, p.z, 0.4, 0.4);
    });
  });
  const knot = (k: number, s: number) =>
    numbered(`greyfen.spawn.m23.knot.${k}`, [cw(s - 4, -1), cw(s, 1), cw(s + 4, 0)].map((p) => [p.x, p.z] as const), ['spawn']);
  const start = cw(10, 1.2);
  const sight = cw(L - 80);
  return {
    anchors: [
      a('npc-post.ranger.causeway', start.x, start.z, headingOf(start.dirX, start.dirZ), ['npc-post']),
      // M23's searches on the line: the drowned cart, the way-marker, the ranger's pack (the shore stone is at the Mere).
      ...[300, 500, 800].map((s, i) => {
        const p = cw(s, i === 1 ? -1.2 : 1.2);
        return a(`greyfen.m23.search.${i + 1}`, p.x, p.z, 0, ['objective']);
      }),
      ...knot(1, 450),
      ...knot(2, 950),
      ...knot(3, 1450),
      // The bridge levers, one each side of each gap, so a player who arrives from the far side is never cut off.
      ...BRIDGES.flatMap((b) => [
        a(`greyfen.m23.bridge.${b.n}`, b.leverNear.x, b.leverNear.z, headingOf(b.leverNear.dirX, b.leverNear.dirZ), ['objective']),
        a(`greyfen.m23.bridge.${b.n}.far`, b.leverFar.x, b.leverFar.z, headingOf(-b.leverFar.dirX, -b.leverFar.dirZ), ['objective']),
      ]),
      // R12: per bed its centre, a torch point on the causeway side, two cut sections and three leech spawns.
      ...REED_BEDS.flatMap((b, i) => {
        const n = i + 1;
        const toCauseway = b.x < SITES.reedgate.x ? 1 : -1;
        return [
          a(`greyfen.r12.bed.${n}`, b.x, b.z, 0, ['objective']),
          a(`greyfen.r12.bed.${n}.torch`, b.x + toCauseway * (REED_BED_SIZE / 2 - 1), b.z, toCauseway > 0 ? 270 : 90, ['objective']),
          ...numbered(`greyfen.r12.bed.${n}.cut`, [[b.x, b.z - 8], [b.x, b.z + 8]], ['objective']),
          ...numbered(`greyfen.spawn.r12.bed.${n}`, ring(b.x, b.z, 9, 3, 30).map((p) => [p[0], p[1]] as const), ['spawn']),
        ];
      }),
      ...numbered('greyfen.r12.search', [REED_BEDS[0]!, REED_BEDS[2]!, REED_BEDS[4]!].map((b) => [b.x + 6, b.z + 12] as const), ['objective']),
      ...numbered('greyfen.r12.cutter', REED_CUTTERS.map((p) => [p.x, p.z] as const), ['npc-post']),
    ],
    triggers: [sphere('trg.greyfen.mere.first-sight', sight.x, sight.z, 20, true)],
    structures: markers,
  };
}
