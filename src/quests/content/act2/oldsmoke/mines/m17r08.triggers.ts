import type { Q13Trigger } from '../triggers';

/** Trigger volumes of M17 on A4's anchors (prefix `trg.q13.`): the lift's bottom landing and its top. */
export const M17R08_TRIGGERS: Q13Trigger[] = [
  // the ride down is counted on arrival at the shaft floor; the wide ring catches the landing wherever the lift sets the player
  { id: 'trg.q13.m17.floor', anchorId: 'oldsmoke.shaft.floor', radius: 14 },
  // a miner is delivered when carried to the lift itself (inside the arrival ring, so a close landing cannot deliver by accident)
  { id: 'trg.q13.m17.lift', anchorId: 'oldsmoke.shaft.floor', radius: 4 },
  { id: 'trg.q13.m17.head', anchorId: 'oldsmoke.shaft.lift.top', radius: 10 },
];
