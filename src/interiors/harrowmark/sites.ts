/**
 * The x, z of each Harrowmark interior's front door outside anchor, copied from thread 17's layout (`DOORS` in
 * src/harrowmark/harrowmark.layout.ts). Constants because `layoutInterior` runs at setup and thread 17's anchors may be defined
 * later; `sites.test.ts` fails when thread 17 moves a door, so the copies cannot drift unnoticed.
 */
export const HARROWMARK_DOORS = {
  'tilted-anvil': { x: 8200, z: 1652 },
  'keep-hall': { x: 8500, z: 2596 },
  'counting-house': { x: 8786, z: 1990 },
  archive: { x: 8806, z: 2080 },
  underways: { x: 7958, z: 1545 },
} as const;

/**
 * Where each interior floats: over its door, except the Archive, which is moved 150 m north. All floors sit at the same height
 * over the flat plateau, and the Archive's door is 92 m from the Counting-House's, inside the enemies' 120 m wake range, so the
 * M09 watch would wake while the player reads in the Archive. Doors find their interior by anchor, so the offset is invisible.
 */
export const HARROWMARK_SITES: Record<keyof typeof HARROWMARK_DOORS, { x: number; z: number }> = {
  ...HARROWMARK_DOORS,
  archive: { x: HARROWMARK_DOORS.archive.x, z: HARROWMARK_DOORS.archive.z + 150 },
};

/** The outside anchor each door position was copied from (thread 17's ids). */
export const HARROWMARK_SITE_ANCHORS: Record<keyof typeof HARROWMARK_DOORS, string> = {
  'tilted-anvil': 'harrowmark.tilted-anvil.door',
  'keep-hall': 'harrowmark.keep-hall.door',
  'counting-house': 'harrowmark.counting-house.door',
  archive: 'harrowmark.archive.door',
  underways: 'harrowmark.underways.door',
};
