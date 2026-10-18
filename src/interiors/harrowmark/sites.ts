/**
 * Where each Harrowmark interior floats: the x, z of its front door's outside anchor, copied from thread 17's layout
 * (`DOORS` in src/harrowmark/harrowmark.layout.ts, thread 17's PR #51). Constants because `layoutInterior` runs at setup and thread 17's anchors may
 * be defined later; `sites.test.ts` fails when thread 17 moves a door, so the copies cannot drift unnoticed.
 */
export const HARROWMARK_SITES = {
  'tilted-anvil': { x: 8200, z: 1652 },
  'keep-hall': { x: 8500, z: 2596 },
  'counting-house': { x: 8786, z: 1990 },
  archive: { x: 8806, z: 2080 },
  underways: { x: 7958, z: 1545 },
} as const;

/** The outside anchor each site was copied from (thread 17's ids). */
export const HARROWMARK_SITE_ANCHORS: Record<keyof typeof HARROWMARK_SITES, string> = {
  'tilted-anvil': 'harrowmark.tilted-anvil.door',
  'keep-hall': 'harrowmark.keep-hall.door',
  'counting-house': 'harrowmark.counting-house.door',
  archive: 'harrowmark.archive.door',
  underways: 'harrowmark.underways.door',
};
