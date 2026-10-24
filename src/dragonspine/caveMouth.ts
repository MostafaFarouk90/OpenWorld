// The collapsed cave's mouth (R16) on K1's mouth shelf: the rock arch over the door (the door is the `collapsed-cave` pad's outside
// door), a collapsed ledge in front of it (one Leap spot), the lodge hunter's post and the clearing for the ogre and four hawks.
// The interior is `collapsedCave.ts`.
import type { StructureSpec } from '../region/layoutTypes';
import { a, dist, emptyPart, headingTo, ledge, LEDGE_HEIGHT, numbered, solid, sphere, type Part } from './helpers';
import { fitLedge, type LedgeSize } from './fit';
import type { XZ } from './inputs';
import { pathLength, pathPoint, windingPath } from './paths';
import type { Sites } from './sites';

/** The on-foot approach from the trailhead over the launch point, the Leap and the ledge to the mouth is about this long (R16). */
export const CAVE_APPROACH_LENGTH = 200;
/** The straight run from the trailhead to the launch point is this share of the approach (the rest is the path's winding). */
const APPROACH_STRAIGHT = 0.8;

export interface CaveMouthInfo {
  door: XZ;
  ledge: StructureSpec;
  launch: XZ;
  specs: StructureSpec[];
  /** The trailhead: on the Rime Pass verge nearest the cave when the road comes close, else on the line from the mouth toward it. */
  trailhead: XZ;
  /** Road arc position of the road point nearest the cave. */
  trailheadS: number;
  /** True when the trailhead stands on the road verge (the road comes within the approach length of the launch point). */
  onRoad: boolean;
  /** Trailhead, winding walk, launch point, ledge, door. */
  approach: XZ[];
  approachLength: number;
}

export function caveMouthLayout(s: Sites): { part: Part; info: CaveMouthInfo } {
  const C = s.cave;
  const door = s.cavePad.door;
  const mouth = solid('dragonspine-cave-mouth', 'dragonspine-cave-mouth', door.x, door.z + 5, 12, 4, 6);
  // The ledge is fitted at the size it is built (the whole width of the mouth shelf), so its real top is what the launch point sees.
  const size: LedgeSize = [Math.max(6, C.w - 6), 3.2];
  const fitted = fitLedge(s.h, { x: door.x, z: door.z - 8 }, [6, 2], size);
  if (!fitted) throw new Error('dragonspine: no climbable ground for the collapsed ledge before the cave mouth');
  const rubble = ledge('dragonspine-cave-ledge', fitted.x, fitted.z, 0, size[0], size[1]);
  const tail = dist(fitted.launch, rubble) + dist(rubble, door);
  const budget = Math.max(CAVE_APPROACH_LENGTH - tail, 20);
  const near = s.road.nearest(door.x, door.z);
  const verge = s.road.point(near.s, s.roadHalf + 4);
  const vergeAt = { x: verge.x, z: verge.z };
  const onRoad = dist(vergeAt, fitted.launch) <= budget;
  let trailhead = vergeAt;
  if (!onRoad) {
    // The road is further than the walk allows: the horse leaves it and the trailhead stands the walk's straight run short of the launch point, on the line toward the road.
    const run = budget * APPROACH_STRAIGHT;
    const d = dist(vergeAt, fitted.launch);
    trailhead = { x: fitted.launch.x + ((vergeAt.x - fitted.launch.x) * run) / d, z: fitted.launch.z + ((vergeAt.z - fitted.launch.z) * run) / d };
  }
  const walk = windingPath(trailhead, fitted.launch, budget, 4);
  const approach: XZ[] = [...walk, { x: rubble.x, z: rubble.z }, { x: door.x, z: door.z }];
  const approachLength = pathLength(approach);
  const walkLength = pathLength(walk);
  const steps = Math.max(2, Math.ceil(walkLength / 20));
  const pathPts = Array.from({ length: steps }, (_, i) => pathPoint(walk, (walkLength * (i + 1)) / (steps + 1)));

  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.cave.trailhead', trailhead.x, trailhead.z, headingTo(trailhead.x, trailhead.z, walk[1]!.x, walk[1]!.z), ['objective']),
      // The walk's anchors: `elevated` leaves the stand-on-a-slope check to the approach's own walkability test.
      ...numbered('dragonspine.cave.path', pathPts.map((p) => [p.x, p.z] as const), ['objective', 'elevated'], 0),
      a('dragonspine.cave.mouth', door.x, door.z, 180, ['poi']),
      a('dragonspine.cave.leap', rubble.x, rubble.z, 0, ['poi', 'leap-gated'], { onStructure: rubble.id, dy: LEDGE_HEIGHT }),
      a('dragonspine.cave.leap.launch', fitted.launch.x, fitted.launch.z, headingTo(fitted.launch.x, fitted.launch.z, rubble.x, rubble.z), ['poi']),
      a('npc-post.lodge-hunter-cave', door.x + 5, door.z + 1, headingTo(door.x + 5, door.z + 1, door.x, door.z - 6), ['npc-post']),
      a('dragonspine.spawn.cave.ogre', C.cx + 12, C.cz - 4, 0, ['spawn']),
      a('dragonspine.spawn.cave.hawk-1', C.cx - 13, C.cz - 5, 0, ['spawn']),
      a('dragonspine.spawn.cave.hawk-2', C.cx - 13, C.cz + 4, 0, ['spawn']),
      a('dragonspine.spawn.cave.hawk-3', C.cx + 13, C.cz + 4, 0, ['spawn']),
      a('dragonspine.spawn.cave.hawk-4', C.cx + 12, C.cz + 8, 0, ['spawn']),
    ],
    triggers: [sphere('trg.dragonspine.cave.mouth', door.x, door.z, 14), sphere('trg.dragonspine.cave.trailhead', trailhead.x, trailhead.z, 12)],
    structures: [mouth, rubble],
  };
  return { part, info: { door, ledge: rubble, launch: fitted.launch, specs: part.structures, trailhead, trailheadS: near.s, onRoad, approach, approachLength } };
}
