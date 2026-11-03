// Act 1 side jobs j05 to j10 (the quests thread; additive to thread 17's city layout and the density pass): the anchors,
// triggers and NPCs of Rook's board (the sergeant, the three notices), the Guild Quarter hound, the smith's crate, the
// chapel candles, the Watch patrol lane loop and the cutpurse pair, and Tobb's second fire ring. Engine metres, +Z north;
// compass headings as in harrowmark.layout.ts. Every point was picked clear of the environment pass's props (1.5 m for an
// anchor, the whole circle for a trigger) and of every structure footprint; src/quests/content/side/side.test.ts proves it.
import type { AnchorSpec, LayoutData, NpcSpec, TriggerSpec } from '../region/layoutTypes';
import { a } from './layout.helpers';

const anchors: AnchorSpec[] = [
  // Rook's board: three notices on the wall, four metres apart, west of the Watch Barracks door, and Rook's sergeant who runs the patrol.
  a('j05.notice', 8342, 1299, 180, ['quest', 'interact']),
  a('j06.notice', 8346, 1299, 180, ['quest', 'interact']),
  a('j07.notice', 8350, 1299, 180, ['quest', 'interact']),
  a('npc-post.sergeant', 8346, 1304.5, 180, ['npc-post']),

  // j05 The Guild Hound: Godric's dog slipped off in the Guild Quarter. Three places to look; he waits at the last, and
  // goes home to Godric's stall once found.
  a('j05.search-1', 8725, 1520, 0, ['quest', 'poi']),
  a('j05.search-2', 8700, 1600, 0, ['quest', 'poi']),
  a('j05.search-3', 8850, 1554, 0, ['quest', 'poi']),
  a('npc-post.crumb.wait', 8856, 1560, 270, ['npc-post']),
  a('npc-post.crumb.home', 8761, 1526, 90, ['npc-post']),

  // j06 The Smith's Crate: the crate on a hand-cart by the old smelter yard, and the spot before Dunstan's forge.
  a('j06.crate', 7973, 1522, 90, ['quest', 'carry']),

  // j07 Candles for the Chapel: the chandler's stall where Main Street meets the chapel approach, and three niches in the
  // chapel's east wall.
  a('npc-post.chandler', 8474, 2138, 270, ['npc-post']),
  a('j07.candles', 8468, 2136, 270, ['quest', 'interact']),
  a('j07.niche-1', 8350, 2133, 90, ['quest', 'interact']),
  a('j07.niche-2', 8350, 2145, 90, ['quest', 'interact']),
  a('j07.niche-3', 8350, 2167, 90, ['quest', 'interact']),

  // j08 Watch Patrol: four points of the lane loop and the pair of cutpurses at the end of the Forge Row alley.
  a('j08.lane-1', 8440, 1440, 0, ['quest', 'poi']),
  a('j08.lane-2', 8231, 1521, 0, ['quest', 'poi']),
  a('j08.lane-3', 8241, 1626, 0, ['quest', 'poi']),
  a('j08.lane-4', 8151, 1601, 0, ['quest', 'poi']),
  a('spawn.j08.cutpurse-1', 8108, 1606, 90, ['spawn']),
  a('spawn.j08.cutpurse-2', 8112, 1612, 90, ['spawn']),

  // j10 Tobb's Second Verse: a fire ring in the Tilted Anvil yard.
  a('j10.fire-ring', 8240, 1668, 90, ['quest', 'interact']),
];

const sphere = (id: string, x: number, z: number, radius: number): TriggerSpec => ({ id, shape: 'sphere', x, z, radius });

const triggers: TriggerSpec[] = [
  sphere('j05.search-1', 8725, 1520, 4),
  sphere('j05.search-2', 8700, 1600, 4),
  sphere('j05.search-3', 8850, 1554, 4),
  sphere('j06.forge', 8174, 1510, 3),
  sphere('j08.lane-1', 8440, 1440, 4),
  sphere('j08.lane-2', 8231, 1521, 4),
  sphere('j08.lane-3', 8241, 1626, 4),
  sphere('j08.lane-4', 8151, 1601, 4),
];

const npcs: NpcSpec[] = [
  // the sergeant takes the board once M06 is done (objective flag in src/quests/content/side/index.ts)
  { id: 'sergeant', post: 'npc-post.sergeant', presentWhen: 'story.side.boardOpen' },
  { id: 'crumb', post: 'npc-post.crumb.home' },
  { id: 'chandler', post: 'npc-post.chandler' },
];

export const SIDE_LAYOUT_HM: LayoutData = { anchors, triggers, structures: [], patrols: [], npcs, fields: [] };
