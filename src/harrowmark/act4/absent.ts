// The occupied city's absent table (L2; plan act4-L2.md section 6, Q2): every Harrowmark NPC whose posts all stand inside
// the ring wall leaves when the city is Vey's (story.m38.complete). Vendors, trainers and companions are exempt: their
// owners move them (L7's vendor rows, L0's trainer rows and party posts) to the Ashgate refuge. act4City.test.ts recomputes
// the list from the layout and the post rules, so a new NPC inside the walls cannot slip through.
import type { NpcSpec } from '../../region/layoutTypes';
import { OCCUPIED_FLAG } from './sites';

export const OCCUPIED_ABSENT: readonly string[] = [
  'aldith', 'whitlock', 'wace', 'stallholder-1', 'stallholder-2', 'guild-doorman', 'pellam', 'sexton', 'fence', 'crabbe',
  'armourer', 'keep-guard', 'clerk', 'sergeant', 'crumb', 'chandler',
];

/** Adds the occupied flag to the absent flags of each NPC in OCCUPIED_ABSENT (others are returned as they are). */
export function withOccupiedAbsent(specs: readonly NpcSpec[], ids: readonly string[] = OCCUPIED_ABSENT): NpcSpec[] {
  const set = new Set(ids);
  return specs.map((s) => {
    if (!set.has(s.id)) return s;
    const own = s.absentWhen === undefined ? [] : typeof s.absentWhen === 'string' ? [s.absentWhen] : [...s.absentWhen];
    return { ...s, absentWhen: own.includes(OCCUPIED_FLAG) ? own : [...own, OCCUPIED_FLAG] };
  });
}
