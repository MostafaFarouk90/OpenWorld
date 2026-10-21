/** Trigger volumes A13 defines on A4's anchors (prefix `trg.q13.`, so there is no clash with A4's `trg.oldsmoke.`): a sphere at an anchor. */
export interface Q13Trigger { id: string; anchorId: string; radius: number }

export const OLDSMOKE_TRIGGERS: Q13Trigger[] = [
  // M16: the first of the pass road's search points, where the ride is counted done
  { id: 'trg.q13.m16.pass', anchorId: 'oldsmoke.pass.search.3', radius: 30 },
  // R09: the paymaster's office door, where the chests are handed over
  { id: 'trg.q13.r09.office', anchorId: 'oldsmoke.market.office.2', radius: 10 },
];
