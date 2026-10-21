// The Cinder Road's blighted waystone (M11), beside A1's station at arc 5000 m: the stone, the blightbloom ring, the road
// search spots, the ambush origins and the wraith ring. The stone and the blooms sit on committed flat spots (sitesFit.ts).
import { roadPoint } from '../terrain/shape/roadPoint';
import { M11_STATION_ARC } from '../region/act2/act2World';
import type { LayoutData } from '../region/layoutTypes';
import { a, numbered, open, ring, solid, sphere } from './helpers';
import { SITES_FIT } from './sitesFit';

export function roadStoneLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const s = SITES_FIT.stone;
  const at = (arc: number, side = 0) => {
    const p = roadPoint('cinder-road', arc, side);
    return [p.x, p.z] as const;
  };
  const station = roadPoint('cinder-road', M11_STATION_ARC, -6);
  return {
    anchors: [
      a('waystone.cinder-road', s.x, s.z - 1.8, 0, ['waystone']),
      ...SITES_FIT.blooms.map((b, i) => a(`cinderreach.m11.bloom.${i + 1}`, b.x, b.z, 0, ['objective'])),
      // Way-post, wreck, dead courier and scout's body along the road either side of the stone.
      ...numbered('cinderreach.m11.search', [at(4300, -5), at(4700, 5), at(5450, -5), at(5850, 5)], ['objective']),
      // A12: the two Footman groups stand close enough to the stone to meet the dismounted column (they were 400 m out).
      ...numbered('cinderreach.m11.ambush', [at(4920), at(5090)], ['spawn'], 90),
      // Ambient footmen on the open road, in pairs (A6b's Footman groups).
      ...numbered('cinderreach.spawn.road', [at(2800, -4), at(2800, 4), at(3700, -4), at(3700, 4)], ['spawn'], 90),
      ...numbered('cinderreach.m11.wraith', ring(s.x, s.z, 13, 5, 20), ['spawn'], 0),
      a('npc-post.gaut.cinder-road', station.x, station.z, 90, ['npc-post']),
    ],
    // The three banter stages of the ride out (A12), spaced along the road before the station.
    triggers: [sphere('trg.cinderreach.m11.ring', s.x, s.z, 18), ...[1200, 2600, 3900].map((arc, i) => sphere(`trg.cinderreach.m11.stage.${i + 1}`, ...at(arc), 30))],
    structures: [
      solid('cinderreach-waystone-cinder-road', 'waystone', s.x, s.z, 1.6, 1.6, 2.4),
      ...SITES_FIT.blooms.map((b, i) => open(`cinderreach-m11-bloom-${i + 1}`, 'cinder-blightbloom', b.x, b.z, 3, 3)),
    ],
  };
}
