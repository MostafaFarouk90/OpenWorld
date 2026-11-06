// Act 4 master positions (thread L1, plans/act4-L1.md section 1): the Ash Road, Ashgate and its refuge, and the Waste's
// sites, with ground heights. Siblings (L2 to L13) import these and never hard-code a site. The raw points live in
// src/terrain/shape/waste.ts (the shaper needs them); this module adds heights and the refuge's post layout. Plain data,
// worker-safe.
import { heightAt } from '../../terrain/heightfield';
import {
  ASH_ROAD_JUNCTION,
  ASHGATE,
  ASHGATE_PLATEAU,
  CINDER_CHAPEL,
  CROSSING,
  GLASSLANDS,
  HUSK_CATHEDRAL,
  M41_CAMP,
  NE_GATE,
  R24_SPRING,
  RIMFOOT,
  SUNFORGE_COLUMN,
  UNDERWAYS_EXIT,
  WALKER_CAMP,
  type XZ,
} from '../../terrain/shape/waste';

export interface Act4Point {
  x: number;
  z: number;
  /** Ground height at the point (engine metres). */
  y: number;
}

export type Act4PlaceId =
  | 'ne-gate'
  | 'underways-exit'
  | 'm41-camp'
  | 'ash-road-junction'
  | 'ashgate'
  | 'crossing'
  | 'walker-camp'
  | 'r24-spring'
  | 'cinder-chapel'
  | 'glasslands'
  | 'husk-cathedral'
  | 'rimfoot'
  | 'sunforge-column';

const pt = ([x, z]: XZ): Act4Point => ({ x, z, y: Math.round(heightAt(x, z) * 100) / 100 });

export const ACT4_PLACES: Readonly<Record<Act4PlaceId, Act4Point>> = {
  'ne-gate': pt(NE_GATE),
  'underways-exit': pt(UNDERWAYS_EXIT),
  'm41-camp': pt(M41_CAMP),
  'ash-road-junction': pt(ASH_ROAD_JUNCTION),
  ashgate: pt(ASHGATE),
  crossing: pt(CROSSING),
  'walker-camp': pt(WALKER_CAMP),
  'r24-spring': pt(R24_SPRING),
  'cinder-chapel': pt(CINDER_CHAPEL),
  glasslands: pt(GLASSLANDS),
  'husk-cathedral': pt(HUSK_CATHEDRAL),
  rimfoot: pt(RIMFOOT),
  'sunforge-column': { x: SUNFORGE_COLUMN[0], z: SUNFORGE_COLUMN[1], y: 0 },
};

// ---- Ashgate and the refuge (plan sections 1.1 and 6; ids agreed with L7, L4 and L3)

/** The refuge's ground: Ashgate's plateau. */
export const REFUGE_Y = ASHGATE_PLATEAU.height;
/** The camp fire and rest point, the refuge's centre. */
export const REFUGE_REST: XZ = [9790, 4400];

/** The moved vendors (talk post, shop 1.6 m east), along the camp's north row facing the fire. */
export const REFUGE_VENDORS = ['wystan', 'merrin', 'wenna', 'dunstan', 'gerta', 'ashdown'] as const;
/** The moved trainers (L0's TRAINER_POSTS): Gerta and Ashdown also sell, so their trainer spot sits by their stall. */
export const REFUGE_TRAINERS = ['stane', 'pennard', 'gerta', 'ashdown', 'rook'] as const;
/** Every NPC with a refuge talk post. */
export const REFUGE_NPCS = ['wystan', 'merrin', 'wenna', 'dunstan', 'gerta', 'ashdown', 'stane', 'pennard', 'rook', 'edric'] as const;
export type RefugeNpc = (typeof REFUGE_NPCS)[number];

/** Talk posts (`npc-post.<id>.refuge`). */
export const REFUGE_POSTS: Readonly<Record<RefugeNpc, XZ>> = {
  wystan: [9620, 4425],
  merrin: [9650, 4425],
  wenna: [9680, 4425],
  dunstan: [9710, 4425],
  gerta: [9740, 4425],
  ashdown: [9770, 4425],
  stane: [9830, 4385],
  pennard: [9860, 4385],
  rook: [9890, 4385],
  edric: [9790, 4413],
};
/** A shop point stands this far east of its talk post, so talk and shop never tie (the Kettlewick rule). */
export const SHOP_OFFSET = 1.6;
/** A trainer spot stands this far from its talk post, toward the fire (the Bastion's rule). */
export const TRAINER_OFFSET = 2.5;

export const refugeShop = (v: (typeof REFUGE_VENDORS)[number]): XZ => [REFUGE_POSTS[v][0] + SHOP_OFFSET, REFUGE_POSTS[v][1]];
export const refugeTrainer = (t: (typeof REFUGE_TRAINERS)[number]): XZ => {
  const [x, z] = REFUGE_POSTS[t];
  return [x, z + (z > REFUGE_REST[1] ? -TRAINER_OFFSET : TRAINER_OFFSET)];
};

/** Dunstan's anvil, 3 m west of his post. */
export const REFUGE_ANVIL: XZ = [9707, 4428];
/** Benched companions: the group spot and one per companion (L4). */
export const REFUGE_COMPANIONS: XZ = [9696, 4386];
export const REFUGE_COMPANION_SPOTS = { tobb: [9690, 4380], hrolf: [9696, 4380], aelfreda: [9702, 4380] } as const satisfies Record<string, XZ>;
/** PR 2's dressing sites, placed now so PR 2 adds no anchor to the camp. */
export const REFUGE_BANNERS = { halvard: [9640, 4442], oswin: [9700, 4442], grisel: [9760, 4442] } as const satisfies Record<string, XZ>;
export const REFUGE_MINERS: readonly XZ[] = Array.from({ length: 12 }, (_, i) => [9905 + (i % 4) * 3.2, 4410 + Math.floor(i / 4) * 3.2] as const);
export const REFUGE_CASKS: XZ = [9935, 4432];

/** Hild's rope-warden post at the gate arch, her shop point, the arch itself and where the Ashmare waits (L3). */
export const HILD_POST: XZ = [9992, 4462];
export const HILD_SHOP: XZ = [9992 + SHOP_OFFSET, 4462];
export const ASHGATE_ARCH: XZ = [10000, 4478];
export const ASHGATE_WAYSTONE: XZ = [9960, 4430];
export const ASHGATE_HORSE_POST: XZ = [9930, 4458];

/** L4's banter volumes round the Waste's sites (radius in metres). */
export const WASTE_SITE_TRIGGERS = {
  'trg.waste.walker-camp': { at: WALKER_CAMP, radius: 90 },
  'trg.waste.cinder-chapel': { at: CINDER_CHAPEL, radius: 80 },
  'trg.waste.husk-cathedral': { at: HUSK_CATHEDRAL, radius: 80 },
  'trg.waste.rimfoot': { at: RIMFOOT, radius: 60 },
} as const satisfies Record<string, { at: XZ; radius: number }>;
