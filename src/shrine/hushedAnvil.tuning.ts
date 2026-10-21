/** Layout and numbers for the Hushed Anvil (design 7.3). Offsets are metres from A3's site anchor. */
export const HUSHED_ANVIL = {
  id: 'hushed-anvil',
  /** Published by A3; A1 owns the plateau under it. Nothing is built until this anchor exists. */
  siteAnchor: 'cinderreach.hushed-anvil.site',
  waystoneAnchor: 'waystone.hushed-anvil',
  stationOffset: { x: -3, z: 2 },
  waystoneOffset: { x: 4, z: 0 },
  muralOffsets: [
    { x: -6, z: -4 },
    { x: 0, z: -7 },
    { x: 6, z: -4 },
  ],
  stationFlagPrefix: 'world.hushed-anvil',
  radius: 2,
  lantern: { unlit: 0.5, lit: 2.2, distance: 14, color: 0xffb561 },
} as const;

export const muralFlag = (n: number): string => `world.hushed-anvil.mural.${n}`;
export const muralCodexId = (n: number): string => `lore.hushed-anvil.mural-${n}`;
