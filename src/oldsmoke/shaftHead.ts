// The Deepgate Shaft head: the collar (closed by a hatch plate until PR 2 builds the lift and the mine below), the headframe over
// it, the winch house (M17's winch), the lift-top landing and the future mine door, the Bellows waystone, two rope catwalks and the
// spoil heaps along the north wall. Slagg and Pike stand here until their quests move them.
import type { LayoutData } from '../region/layoutTypes';
import { a, box, numbered, open, solid, sphere } from './helpers';
import { BOX, EDGE, SHAFT as S } from './sites';

const WINCH = { x: S.x + 34, z: S.z };

export function shaftHeadLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const heaps = [60, 115, 170, 225, 280].map((dx) => ({ x: BOX.minX + dx, z: EDGE.n - 18 }));
  return {
    anchors: [
      // The lift lands on `lift.top`; `head` is where the party gathers; `door` is the mine interior's outside anchor (PR 2 wires it).
      a('oldsmoke.shaft.head', S.x, S.z + 16, 0, ['poi']),
      a('oldsmoke.shaft.lift.top', S.x, S.z + 7, 0, ['poi']),
      a('oldsmoke.shaft.door', S.x, S.z + 9, 180, ['poi']),
      // M17: the winch in its house and the three parts the winch-wright asks for.
      a('oldsmoke.shaft.winch', WINCH.x, WINCH.z - 6, 180, ['objective']),
      ...numbered('oldsmoke.shaft.winch.part', [[S.x - 12, S.z - 10], [S.x + 16, S.z - 14], [S.x + 30, S.z + 12]], ['objective'], 0),
      // The Bellows waystone: its shrine's puzzle is A9's, the stone stays locked until `world.bellows.solved`.
      a('waystone.weeping-bellows', S.x + 18, S.z + 22, 0, ['waystone']),
      a('npc-post.slagg.shaft', S.x - 8, S.z + 20, 0, ['npc-post']),
      a('npc-post.pike.shaft', S.x + 8, S.z + 20, 0, ['npc-post']),
      ...numbered('npc-post.miner.shaft', [[S.x - 16, S.z + 10], [S.x + 14, S.z + 4]], ['npc-post'], 0),
    ],
    triggers: [sphere('trg.oldsmoke.shaft', S.x, S.z + 8, 20), box('trg.oldsmoke.shaft.lift', S.x, S.z + 7, 4, 3, 4)],
    structures: [
      solid('oldsmoke-shaft-collar', 'deepgate-collar', S.x, S.z, 10, 10, 0.8),
      open('oldsmoke-shaft-headframe', 'deepgate-headframe', S.x, S.z, 10, 8, 14),
      solid('oldsmoke-winch-house', 'house', WINCH.x, WINCH.z, 8, 6),
      // Rope catwalks (decoration): winch house to headframe, and headframe south toward the shaft-head lane.
      open('oldsmoke-catwalk-1', 'deepgate-rope-bridge', S.x + 17, S.z - 2, 22, 2.4, 3),
      open('oldsmoke-catwalk-2', 'deepgate-rope-bridge', S.x, S.z - 24, 2.4, 30, 3),
      solid('oldsmoke-waystone-bellows', 'waystone', S.x + 18, S.z + 22 + 1.8, 1.6, 1.6, 2.4),
      ...heaps.map((h, i) => open(`oldsmoke-spoil-${i + 1}`, 'deepgate-spoil', h.x, h.z, 18, 14, 5)),
    ],
  };
}
