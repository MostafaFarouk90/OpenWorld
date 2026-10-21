import type { CarryItemSpec } from '../carry';

const item = (q: string, o: string, n: number, anchor: string, destination: string, look: CarryItemSpec['look'], promptKey: string): CarryItemSpec => ({
  id: `${q}-${look}-${n}`, interactableId: `pickup:${q}-${look}-${n}`, homeAnchor: anchor, deliveredFlag: `story.${q}.${look}${n}.delivered`,
  questId: q, objectiveId: o, destination, promptKey, look,
});

/** M12's wounded, R06's household bundles, M13's log laps. Destinations are the `trg.q12.*` volumes. */
export const ACT2_CARRY: CarryItemSpec[] = [
  ...[1, 2].map((n) => item('m12', 'carry', n, `cinderreach.m12.wounded.${n}`, 'trg.q12.m12.refuge', 'wounded', 'quest.prompt.carryWounded')),
  ...[1, 2, 3, 4].map((n) => item('r06', 'bundles', n, `cinderreach.r06.household.${n}`, 'trg.q12.r06.cart', 'bundle', 'quest.prompt.carryBundle')),
  ...[1, 2, 3].map((n) => item('m13', 'logs', n, `cinderreach.m13.log.${n}`, 'trg.q12.m13.logdrop', 'bundle', 'quest.prompt.carryLog')),
];
