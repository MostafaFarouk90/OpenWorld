// Act 5 N7 (plans/act5-N7.md section 5): the vendors and trainers who move from the Ashgate refuge to the Rim Camp from
// `story.m49.complete`, and Alric and Maud's own posts. N1 defines the anchors (`RIM_CAMP_ANCHORS`); until it does, a shop
// or desk stays closed with one warning (the shipped missing-anchor rule). Every `when` is read live, so a load re-derives.
import type { FlagCondition } from '../core/flagCondition';
import type { TrainerPostRow } from '../classes/kits';
import type { VendorId, VendorPostRow } from './stock';

export const RIM_CAMP_FROM: FlagCondition = { all: ['story.m49.complete'] };
/** Written by A3 from `story.r06.choice = 'cleansed'` (F4 Cleanse). */
export const F4_CLEANSED_FLAG = 'world.cinderreach.cinderford.cleansed';

export const rimShop = (id: string): string => `caldera.camp.shop.${id}`;
export const rimTrainer = (npcId: string): string => `caldera.camp.trainer.${npcId}`;
export const RIM_FORGE_DUNSTAN = 'caldera.camp.forge.dunstan';
export const RIM_ANVIL_ALRIC = 'caldera.camp.anvil.alric';

/** Vendors that move to the Rim Camp (the refuge six and Wulfhild). Hild stays at Ashgate. */
export const RIM_MOVING_VENDORS = ['wystan', 'merrin', 'wenna', 'dunstan', 'gerta', 'ashdown', 'wulfhild'] as const satisfies readonly VendorId[];
export const RIM_TRAINERS = ['stane', 'pennard', 'gerta', 'ashdown'] as const;

/** The names N1 imports and defines. */
export const RIM_CAMP_ANCHORS: readonly string[] = [
  ...[...RIM_MOVING_VENDORS, 'alric'].map(rimShop),
  rimShop('maud'),
  ...[...RIM_TRAINERS, 'rook'].map(rimTrainer),
  RIM_FORGE_DUNSTAN,
  RIM_ANVIL_ALRIC,
];

export const ACT5_VENDOR_POSTS: readonly VendorPostRow[] = [
  ...RIM_MOVING_VENDORS.map((vendorId) => ({ vendorId, anchorId: rimShop(vendorId), when: RIM_CAMP_FROM })),
  { vendorId: 'alric', anchorId: rimShop('alric'), when: { all: ['story.m47.complete'] } },
  { vendorId: 'maud-rim', anchorId: rimShop('maud'), when: RIM_CAMP_FROM },
];

/** Alric opens when M47 is done; Maud only with F4 Cleanse and once the allies are at the camp. With Seal she is simply absent. */
export const ACT5_VENDOR_OPEN_WHEN: Readonly<Partial<Record<VendorId, FlagCondition>>> = {
  alric: { all: ['story.m47.complete'] },
  'maud-rim': { all: ['story.m49.complete', F4_CLEANSED_FLAG] },
};

export const ACT5_TRAINER_POSTS: readonly TrainerPostRow[] = [
  ...RIM_TRAINERS.map((npcId) => ({ npcId, post: rimTrainer(npcId), when: RIM_CAMP_FROM })),
  { classId: 'knight' as const, npcId: 'rook', post: rimTrainer('rook'), when: RIM_CAMP_FROM, nameKey: 'classes.trainer.rook' },
];
