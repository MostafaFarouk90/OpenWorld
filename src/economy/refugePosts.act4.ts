// Act 4 L7 (Q2, plans/act4-L7.md section 4): the vendors and trainers who leave Harrowmark for the Ashgate refuge from
// `story.m41.complete`. Anchor ids are agreed with L1 (plans/act4-L1.md section 6), which places them in L1 PR 1; until
// then a shop or desk stays closed with one warning (the shipped missing-anchor rule). Read by L0's VENDOR_POSTS and
// TRAINER_POSTS (v0.8 item 10).
import type { FlagCondition } from '../core/flagCondition';
import type { TrainerPostRow } from '../classes/kits';
import type { VendorId, VendorPostRow } from './stock';

export const REFUGE_FROM: FlagCondition = { all: ['story.m41.complete'] };

export const refugeShop = (vendorId: string): string => `ashgate.refuge.shop.${vendorId}`;
export const refugeTrainer = (npcId: string): string => `ashgate.refuge.trainer.${npcId}`;
export const refugeTalkPost = (npcId: string): string => `npc-post.${npcId}.refuge`;
export const REFUGE_ANVIL = 'ashgate.refuge.anvil';
export const REFUGE_REST = 'ashgate.refuge.rest';
/** Hild's shop point at Ashgate (L1 PR 1) and Wulfhild's at the Walker Camp (L1 PR 2). */
export const HILD_SHOP = 'ashgate.shop.hild';
export const WULFHILD_SHOP = 'waste.walker-camp.shop.wulfhild';

/** The vendors whose shops move to the refuge (every vendor trading inside the walls before M38). */
export const REFUGE_VENDORS = ['wystan', 'merrin', 'wenna', 'dunstan', 'gerta', 'ashdown'] as const satisfies readonly VendorId[];

export const ACT4_VENDOR_POSTS: readonly VendorPostRow[] = [
  ...REFUGE_VENDORS.map((vendorId) => ({ vendorId, anchorId: refugeShop(vendorId), when: REFUGE_FROM })),
  { vendorId: 'hild', anchorId: HILD_SHOP, when: { all: ['story.m41.complete'] } },
  { vendorId: 'wulfhild', anchorId: WULFHILD_SHOP, when: { all: ['story.m43.complete'] } },
];

/** When each Act 4 vendor opens (L0's VENDOR_OPEN_WHEN, ANDed with the shipped switch). Aldous leaves at M38. */
export const ACT4_VENDOR_OPEN_WHEN: Readonly<Partial<Record<VendorId, FlagCondition>>> = {
  wenna: { all: ['story.m38.complete'] },
  aldous: { none: ['story.m38.complete'] },
  wulfhild: { all: ['story.m43.complete'] },
  hild: { all: ['story.m41.complete'] },
};

/**
 * The trainers' refuge desks. The four shipped trainers move; the Knight desk passes to Captain Rook (Gaut retires at
 * M39), who teaches tiers 1 to 5 and gives Gaut's master book.
 */
export const ACT4_TRAINER_POSTS: readonly TrainerPostRow[] = [
  ...(['stane', 'pennard', 'gerta', 'ashdown'] as const).map((npcId) => ({ npcId, post: refugeTrainer(npcId), when: REFUGE_FROM })),
  { classId: 'knight', npcId: 'rook', post: refugeTrainer('rook'), when: REFUGE_FROM, nameKey: 'npc.rook.name' },
];

/**
 * Services inside the walls that deliberately do not move (coordinator ruling, 2026-11-06): shut until Act 5. The
 * coverage test checks that every in-walls trade and respec is either moved or listed here, and that this list holds no
 * stale entry.
 */
export const DELIBERATELY_SHUT_UNTIL_ACT5: Readonly<Record<string, string>> = {
  aldith: "the Tilted Anvil's inn; the refuge rest point (ashgate.refuge.rest) replaces its rest, with no food buff",
  wace: "Wace Carter's stables and mount gear; the Ashmare waits outside the walls",
  whitlock: "the Oswin Archive's codex and translations",
};
