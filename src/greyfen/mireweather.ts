// Mireweather Hut (M25): Gytha's stilted hut over its small interior's door, three herb beds with a cutter, the hut's
// waystone and jetty; and the Mirewater Deeps' ruined monastery front (D05) with the arena's exit-only door in its east wall.
import type { LayoutData } from '../region/layoutTypes';
import { a, numbered, open, ring, solid } from './helpers';
import { JETTIES } from './places';
import { FERRY_JETTY_ID, headingTo, jettySpec, onJettyAnchor } from './reedgate';
import { GREYFEN_WAYSTONES, SITES } from './sites';

/** Herb beds (bog myrtle, sundew, mire-lily), as offsets from the hut door. */
export const HERB_BEDS: ReadonlyArray<readonly [number, number]> = [
  [-20, 10],
  [-26, -6],
  [22, -8],
];
/** The arena's exit lands at the ruin's collapsed east wall, 15 m from the Deeps door. */
export const ARENA_EXIT_OFFSET = 15;

export function mireweatherLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const door = SITES.hutDoor;
  const ws = GREYFEN_WAYSTONES['mireweather-hut'];
  const j = JETTIES.mireweather;
  const jid = FERRY_JETTY_ID('mireweather');
  const beds = HERB_BEDS.map(([dx, dz]) => ({ x: door.x + dx, z: door.z + dz }));
  return {
    anchors: [
      a('waystone.mireweather-hut', ws.x, ws.z - 1.8, 0, ['waystone']),
      a('greyfen.hut.door', door.x, door.z, 0, ['poi']),
      a('npc-post.gytha.hut', door.x + 3, door.z + 3, 180, ['npc-post']),
      onJettyAnchor('greyfen.ferry.mireweather', jid, j, j.length - 1, headingTo(j.water, j.land)),
      ...numbered('greyfen.m25.herb', beds.map((b) => [b.x, b.z + 3] as const), ['objective']),
      a('greyfen.m25.cutter', beds[0]!.x + 4, beds[0]!.z + 4, 0, ['npc-post']),
      ...numbered('greyfen.spawn.m25.herbs', beds.flatMap((b) => ring(b.x, b.z, 7, 2, 90).map((p) => [p[0], p[1]] as const)), ['spawn']),
    ],
    triggers: [],
    structures: [
      solid('greyfen-waystone-mireweather-hut', 'waystone', ws.x, ws.z, 1.6, 1.6, 2.4),
      solid('greyfen-hut', 'greyfen-stilt-hut', door.x, door.z - 5.5, 12, 9),
      ...beds.map((b, i) => open(`greyfen-herb-bed-${i + 1}`, 'greyfen-herb-bed', b.x, b.z, 6, 4)),
      jettySpec(jid, j),
    ],
  };
}

export function deepsLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const door = SITES.deepsDoor;
  return {
    anchors: [
      a('greyfen.deeps.door', door.x, door.z, 0, ['poi']),
      a('greyfen.deeps.arena-exit', door.x + ARENA_EXIT_OFFSET, door.z, 90, ['poi']),
    ],
    triggers: [],
    structures: [solid('greyfen-deeps-front', 'greyfen-monastery-ruin', door.x, door.z - 7, 20, 12)],
  };
}
