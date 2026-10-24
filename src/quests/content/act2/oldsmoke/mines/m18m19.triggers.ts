import type { Q13Trigger } from '../triggers';

/**
 * Trigger volumes of M19 on A4's anchors (prefix `trg.q13.`). The lead ends where the stealth section begins; the nursery
 * ring starts the reveal scene when the player walks in.
 */
export const M18M19_TRIGGERS: Q13Trigger[] = [
  { id: 'trg.q13.m19.route.1', anchorId: 'oldsmoke.stealth.m19.start', radius: 10 },
  { id: 'trg.q13.m19.nursery', anchorId: 'oldsmoke.m19.nursery', radius: 14 },
];
