/**
 * Things the player carries (src/quests/carry.ts). M01's villagers, and the well buckets of the density pass: two for
 * the Grey Goose door (M01), two for the bakery door (M02), two for R01's stubble fire, which only burns when the
 * field was scorched. A bucket is delivered by walking into its destination trigger.
 */
export interface CarryItemSpec {
  id: string;
  interactableId: string;
  homeAnchor: string;
  deliveredFlag: string;
  questId: string;
  objectiveId: string;
  destination: string;
  promptKey: string;
  look: 'villager' | 'bucket';
  /** pickable only while this flag is true too */
  requiresFlag?: string;
}

const villager = (n: number): CarryItemSpec => ({
  id: `villager-${n}`, interactableId: `pickup:villager-${n}`, homeAnchor: `m01.villager-${n}`,
  deliveredFlag: `quest.m01.villager${n}.delivered`, questId: 'm01', objectiveId: 'o2', destination: 'm01.chapel-door',
  promptKey: 'quest.prompt.carry', look: 'villager',
});

const bucket = (q: string, o: string, n: number, destination: string, requiresFlag?: string): CarryItemSpec => ({
  id: `bucket-${q}-${n}`, interactableId: `pickup:bucket-${q}-${n}`, homeAnchor: `${q}.bucket-${n}`,
  deliveredFlag: `story.${q}.bucket${n}.delivered`, questId: q, objectiveId: o, destination,
  promptKey: 'quest.prompt.bucket', look: 'bucket', ...(requiresFlag ? { requiresFlag } : {}),
});

export const CARRY_ITEMS: CarryItemSpec[] = [
  villager(1), villager(2), villager(3),
  bucket('m01', 'tavern', 1, 'm01.tavern-door'), bucket('m01', 'tavern', 2, 'm01.tavern-door'),
  bucket('m02', 'door', 1, 'm02.bakery-door'), bucket('m02', 'door', 2, 'm02.bakery-door'),
  bucket('r01', 'aftermath', 1, 'r01.stubble', 'story.r01.scorched'), bucket('r01', 'aftermath', 2, 'r01.stubble', 'story.r01.scorched'),
];
