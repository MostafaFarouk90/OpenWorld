// Cinderford, on A1's CINDERFORD_PLATEAU (exactly flat): houses round a square with the blighted well, the mill and two
// bridges where the river forks off the plateau's south edge, Maud's refuge, the tavern, the barricade line on the road side
// (A7 builds the barricade and the militia at the anchors published here), the waystone and the R06 well sites.
import type { LayoutData, StructureSpec } from '../region/layoutTypes';
import { a, numbered, open, ring, solid, sphere } from './helpers';
import { CINDERFORD as C, ROAD_END, roadFromEnd } from './sites';

/** Courses of the two river arms (x, z), from the spring head at the plateau's south end down the falling edge. */
export const RIVER_ARMS = {
  west: [[C.x - 10, C.z - 250], [C.x - 30, C.z - 300], [C.x - 45, C.z - 360], [C.x - 50, C.z - 410], [C.x - 55, C.z - 470]],
  east: [[C.x + 10, C.z - 250], [C.x + 35, C.z - 300], [C.x + 55, C.z - 360], [C.x + 60, C.z - 410], [C.x + 65, C.z - 470]],
} as const;
export const RIVER_WIDTH = 8;

/** Where the boarded well, the blight stain and the other toggled pieces stand. */
export const WELL = { x: C.x, z: C.z + 10 };

const HOUSE_ROWS = [60, 20, -20, -60];
const west = (i: number) => ({ x: C.x - 60, z: C.z + HOUSE_ROWS[i] });
const east = (i: number) => ({ x: C.x + 60, z: C.z + HOUSE_ROWS[i] });

export function cinderfordLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const bx = ROAD_END.x;
  const bz = ROAD_END.z - 25;
  const houses: StructureSpec[] = [0, 1, 2, 3].flatMap((i) => [
    solid(`cinderreach-cinderford-house-${i + 1}`, 'house', west(i).x, west(i).z, 8, 8),
    solid(`cinderreach-cinderford-house-${i + 5}`, 'house', east(i).x, east(i).z, 8, 8),
  ]);
  const maud = { x: C.x - 120, z: C.z + 150 };
  const shed = { x: C.x + 28, z: C.z - 4 };
  const stone = { x: C.x - 20, z: C.z + 40 };
  const lanes = [roadFromEnd(140, -8), roadFromEnd(200, 0), roadFromEnd(260, 8)];
  const wyrm = roadFromEnd(420, 40);

  return {
    anchors: [
      a('waystone.cinderford', stone.x, stone.z - 1.8, 0, ['waystone']),
      // A7's wave director: three lanes up the road, the barricade line across it, the wyrm's approach, the militia posts.
      ...numbered('cinderreach.cinderford.lane', lanes.map((p) => [p.x, p.z] as const), ['spawn'], 180),
      ...numbered('cinderreach.cinderford.barricade', [-27, -9, 9, 27].map((dx) => [bx + dx, bz] as const), ['objective'], 0),
      // Where A7's raids come from (the east edge) and the line they push at.
      a('cinderreach.cinderford.raid.origin', C.x + 320, C.z, 270, ['spawn']),
      a('cinderreach.cinderford.raid.barricade', bx, bz, 0, ['objective']),
      a('cinderreach.cinderford.wyrm.approach', wyrm.x, wyrm.z, 180, ['spawn', 'elevated'], { dy: 30 }),
      ...numbered('cinderreach.m12.militia', [-30, -18, -6, 6, 18, 30].map((dx) => [bx + dx, bz - 6] as const), ['spawn'], 0),
      // M12: prep spots along the line, wounded in the town, the refuge drop-off.
      ...numbered('cinderreach.m12.prep', [-20, 0, 20].map((dx) => [bx + dx, bz - 22] as const), ['objective'], 0),
      ...numbered('cinderreach.m12.wounded', [[C.x - 30, C.z + 230], [C.x + 30, C.z + 230], [C.x - 45, C.z + 200], [C.x + 45, C.z + 200]], ['objective'], 0),
      a('cinderreach.m12.refuge.dropoff', maud.x + 9, maud.z - 6, 0, ['objective']),
      // Posts.
      a('npc-post.osgar.barricade', bx - 14, bz - 30, 0, ['npc-post']),
      a('npc-post.gaut.cinderford', bx + 14, bz - 30, 0, ['npc-post']),
      a('npc-post.maud.refuge', maud.x, maud.z - 7, 0, ['npc-post']),
      a('npc-post.pennard.cinderford', maud.x + 4, maud.z - 8, 0, ['npc-post']),
      a('npc-post.beornwyn.tavern', C.x, C.z - 110 + 9, 180, ['npc-post']),
      ...[0, 1, 2, 3].map((i) => a(`npc-post.household-${i + 1}`, west(i).x + 8, west(i).z, 90, ['npc-post'])),
      ...numbered('cinderreach.post.cinderford', [[C.x - 14, C.z + 45], [C.x + 14, C.z + 45]], ['npc-post'], 0),
      // R06: blight samples round the well, the well-house search points, each household's bundle, the cart, the rite.
      ...numbered('cinderreach.r06.sample', ring(WELL.x, WELL.z, 14, 3, 60), ['objective']),
      ...numbered('cinderreach.r06.wellhouse', [[shed.x + 6, shed.z], [shed.x - 6, shed.z], [shed.x, shed.z + 6], [shed.x, shed.z - 6]], ['objective']),
      ...[0, 1, 2, 3].map((i) => a(`cinderreach.r06.household.${i + 1}`, west(i).x + 8, west(i).z + 3, 90, ['objective'])),
      a('cinderreach.r06.cart', C.x - 30, C.z + 10, 90, ['objective']),
      a('cinderreach.r06.well', WELL.x + 3, WELL.z, 270, ['objective']),
      a('cinderreach.r06.pennard.rite', WELL.x, WELL.z + 7, 180, ['objective']),
      ...numbered('cinderreach.r06.wraith', ring(WELL.x, WELL.z, 22, 4, 45), ['spawn']),
      // Hounds that harry the east edge between raids (A6b's ambient group).
      ...numbered('cinderreach.spawn.cinderford', [[C.x + 300, C.z + 100], [C.x + 300, C.z], [C.x + 300, C.z - 100]], ['spawn'], 270),
    ],
    triggers: [sphere('trg.cinderreach.cinderford.well', WELL.x, WELL.z, 8)],
    structures: [
      ...houses,
      solid('cinderreach-cinderford-well', 'well', WELL.x, WELL.z, 2, 2),
      solid('cinderreach-cinderford-wellhouse', 'house', shed.x, shed.z, 6, 6),
      solid('cinderreach-cinderford-refuge', 'house', maud.x, maud.z, 10, 8),
      solid('cinderreach-cinderford-tavern', 'tavern', C.x, C.z - 110, 12, 10),
      solid('cinderreach-cinderford-mill', 'mill', C.x - 28.5, C.z - 270, 10, 10),
      open('cinderreach-cinderford-bridge-1', 'bridge', C.x - 40, C.z - 340, 10, 4),
      open('cinderreach-cinderford-bridge-2', 'bridge', C.x + 48, C.z - 340, 10, 4),
      solid('cinderreach-waystone-cinderford', 'waystone', stone.x, stone.z, 1.6, 1.6, 2.4),
    ],
  };
}
