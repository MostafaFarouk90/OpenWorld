/** Trigger volumes A12 defines (A3 publishes none for these); a sphere at a published A3 anchor. The M11 banter stages are computed from the road in the director. */
export interface Q12Trigger { id: string; anchorId: string; radius: number }

export const ACT2_TRIGGERS: Q12Trigger[] = [
  { id: 'trg.q12.m12.refuge', anchorId: 'cinderreach.m12.refuge.dropoff', radius: 6 },
  { id: 'trg.q12.r06.cart', anchorId: 'cinderreach.r06.cart', radius: 6 },
  { id: 'trg.q12.m13.logdrop', anchorId: 'cinderreach.stonefold.ring.centre', radius: 12 },
  ...[1, 2, 3].map((n) => ({ id: `trg.q12.leap.hushed.${n}`, anchorId: `cinderreach.hushed-anvil.ledge.${n}`, radius: 3 })),
  ...[1, 2].map((n) => ({ id: `trg.q12.leap.den.${n}`, anchorId: `cinderreach.den.ledge.${n}`, radius: 3 })),
];
