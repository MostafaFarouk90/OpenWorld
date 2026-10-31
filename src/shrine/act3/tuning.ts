// Layout and ids for the K9 Act 3 shrine pieces. Offsets are metres from the site anchor; no site position is hard-coded.
export const MERE = {
  id: 'hathrens-mere',
  /** K3's shore shrine site. Nothing is built until it exists. */
  siteAnchor: 'greyfen.mere.shrine',
  waystoneAnchor: 'waystone.hathrens-mere',
  /** 14 m west of the site (the stone stands apart from the shore stones). */
  waystoneOffset: { x: -14, z: 0 },
  /** Derived gate for WAYSTONE_LOCKS: M26's nets cut, or M26 completed. */
  openFlag: 'shrine.hathrens-mere.open',
  netsCutFlag: 'story.m26.netsCut',
  completeFlag: 'story.m26.complete',
  quest: 'm26',
  scaleItem: 'hathrens-scale',
  scaleUsedFlag: 'shrine.hathrens-mere.scaleUsed',
  scaleScars: 3,
  glow: { unlit: 0, lit: 2.4, distance: 16, color: 0x8fd4e0 },
} as const;

export const LAST_ANVIL = {
  id: 'last-anvil',
  quest: 'm30',
  siteAnchor: 'dragonspine.anvil.shrine',
  waystoneAnchor: 'waystone.last-anvil',
  waystoneOffset: { x: -10, z: 0 },
  /** The three M30 steps in order, as interactable offsets from the anvil at the site. */
  steps: [
    { id: 'sweep', flag: 'world.last-anvil.swept', offset: { x: -3, z: 2.5 } },
    { id: 'relight', flag: 'world.last-anvil.relit', offset: { x: 0, z: 3.5 } },
    { id: 'sound', flag: 'world.last-anvil.sounded', offset: { x: 3, z: 2.5 } },
  ],
  rimBeaconFlag: 'world.last-anvil.rimBeacon',
  /** Derived gate for WAYSTONE_LOCKS: the anvil has sounded, or the shrine is already lit (a script or the jump lit it). */
  openFlag: 'shrine.last-anvil.open',
  radius: 2,
  rubbingIds: ['anvil-1', 'anvil-2', 'anvil-3', 'anvil-4', 'anvil-5', 'anvil-6'],
  carvingAnchor: (n: number): string => `dragonspine.anvil.carving.${n}`,
  rubbingHoldSeconds: 3,
  lamp: { unlit: 0, lit: 2, distance: 14, color: 0xffb561 },
} as const;

export const WAYSIDE = {
  quest: 'r17',
  count: 6,
  anchor: (n: number): string => `dragonspine.wayside.${n}`,
  flag: (n: number): string => `world.wayside.${n}.lit`,
  radius: 2,
} as const;

export const rubbingFlag = (id: string): string => `world.rubbing.${id}.taken`;
export const rubbingCodexId = (id: string): string => `lore.rubbing.${id}`;
export const RUBBINGS_COLLECTION_ID = 'lore.anvil-rubbings';

export const WYRMS_HEARTH = {
  id: 'wyrms-hearth',
  quest: 'm34',
  /** K4's nest site on the Hearth plateau. Nothing is built until it exists. */
  siteAnchor: 'dragonspine.hearth.shrine',
  waystoneAnchor: 'waystone.wyrms-hearth',
  /** Only used if K4's waystone anchor is missing. */
  waystoneOffset: { x: 10, z: 0 },
  /** Derived gate for WAYSTONE_LOCKS: M34 active or completed, `story.m34.complete`, or the shrine already lit. */
  openFlag: 'shrine.wyrms-hearth.open',
  completeFlag: 'story.m34.complete',
  glow: { unlit: 0, lit: 3, distance: 22, color: 0xff7a2a },
} as const;
