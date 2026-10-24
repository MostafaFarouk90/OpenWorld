// The collapsed cave's mouth (R16) on K1's mouth shelf: the rock arch over the door (the door is the `collapsed-cave` pad's outside
// door), a collapsed ledge in front of it (one Leap spot), the lodge hunter's post and the clearing for the ogre and four hawks.
// The interior is `collapsedCave.ts`.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, ledge, LEDGE_HEIGHT, solid, sphere, type Part } from './helpers';
import { fitLedge } from './fit';
import type { XZ } from './inputs';
import type { Sites } from './sites';

export interface CaveMouthInfo {
  door: XZ;
  ledge: StructureSpec;
  launch: XZ;
  specs: StructureSpec[];
}

export function caveMouthLayout(s: Sites): { part: Part; info: CaveMouthInfo } {
  const C = s.cave;
  const door = s.cavePad.door;
  const mouth = solid('dragonspine-cave-mouth', 'dragonspine-cave-mouth', door.x, door.z + 5, 12, 4, 6);
  const fitted = fitLedge(s.h, { x: door.x, z: door.z - 8 }, [6, 2]);
  if (!fitted) throw new Error('dragonspine: no climbable ground for the collapsed ledge before the cave mouth');
  const rubble = ledge('dragonspine-cave-ledge', fitted.x, fitted.z, 0, Math.max(6, C.w - 6), 3.2);
  const part: Part = {
    ...emptyPart(),
    anchors: [
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
    triggers: [sphere('trg.dragonspine.cave.mouth', door.x, door.z, 14)],
    structures: [mouth, rubble],
  };
  return { part, info: { door, ledge: rubble, launch: fitted.launch, specs: part.structures } };
}
