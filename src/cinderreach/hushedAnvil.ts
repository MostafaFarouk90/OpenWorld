// The Hushed Anvil: the site anchor on A1's HUSHED_ANVIL_PLATEAU (A9 builds the shrine, its waystone, the work-stone and the
// murals within 10 m of it, which this file keeps clear), the three Leap ledges beside A1's ridge footpath, Aelfreda's and the
// lantern-keeper's posts and the two golems' spawns.
import type { LayoutData } from '../region/layoutTypes';
import { a, numbered } from './helpers';
import { HUSHED_ANVIL as A, LEDGE_SPOTS } from './sites';
import { ledgeSite } from './stonefold';

export function hushedAnvilLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const ledges = ([1, 2, 3] as const).map((n) => ledgeSite(`cinderreach-anvil-ledge-${n}`, `cinderreach.hushed-anvil.ledge.${n}`, LEDGE_SPOTS[`anvil-${n}`]));
  return {
    anchors: [
      a('cinderreach.hushed-anvil.site', A.x, A.z, 180, ['poi', 'shrine-site']),
      a('npc-post.aelfreda.anvil', A.x + 14, A.z + 12, 225, ['npc-post']),
      a('npc-post.lantern-keeper.anvil', A.x - 14, A.z + 12, 135, ['npc-post']),
      ...numbered('cinderreach.spawn.anvil', [[A.x - 35, A.z - 30], [A.x + 35, A.z - 30]], ['spawn'], 0),
      // M14's two golems wake at the same spots (A12 reads this name; A6b's ambient spawns use `spawn.anvil`).
      ...numbered('cinderreach.m14.golem', [[A.x - 35, A.z - 30], [A.x + 35, A.z - 30]], ['spawn'], 0),
      ...ledges.flatMap((l) => l.anchors),
    ],
    triggers: [],
    structures: ledges.flatMap((l) => l.structures),
  };
}
