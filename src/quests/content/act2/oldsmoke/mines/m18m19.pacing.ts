// Pacing rows for M18 and M19 (plans/act2-A13.md section 5), in the shape of ../pacing.ts. A4's mine anchors are not on this
// branch, so the routes are measured on a local position table (`M18M19_POS`): each mine is sketched inside x [-70,70],
// z [-130,10] of its own frame (A4's plan, section 11), in one shared frame so a lift ride costs its `lift` beat and no walk.
// Re-measure against A4's real anchors when the mines land. Wenna leads M19's walk at ROUTE_FOLLOW_MPS, not the walking
// pace: the `follow` count says how many legs from the route start are walked at her pace (`paceMinutesFollow`).
import { ROUTE_FOLLOW_MPS, TALK_NODE_S, WALK_MPS, ACT2_BEAT_S, cappedTravelS } from '../../../../../integration/timing';
import type { Act2Beat, AnchorPos, PaceResult, PaceRow } from '../../pacing';

export interface M18M19PaceRow extends PaceRow {
  /** legs, counted from the route start, walked behind Wenna at the route-follow pace */
  follow?: number;
}

export const M18M19_POS: AnchorPos = {
  // mine-weeping-bellows
  'oldsmoke.bellows.lift': { x: 0, z: -8 },
  'npc-post.pike.bellows': { x: 8, z: -26 },
  'npc-post.pike-apprentice.bellows': { x: -8, z: -26 },
  'mines.weeping-bellows.center': { x: 0, z: -60 },
  'oldsmoke.bellows.plaque': { x: 0, z: -73 },
  'oldsmoke.bellows.pipes': { x: -20, z: -50 },
  'oldsmoke.bellows.crawler.1': { x: 18, z: -60 },
  'oldsmoke.bellows.crawler.2': { x: 9, z: -76 },
  'oldsmoke.bellows.crawler.3': { x: -9, z: -76 },
  'oldsmoke.bellows.crawler.4': { x: -18, z: -60 },
  'oldsmoke.bellows.crawler.5': { x: -9, z: -44 },
  'oldsmoke.bellows.crawler.6': { x: 9, z: -44 },
  // mine-lower-galleries
  'oldsmoke.lower.lift': { x: 0, z: -8 },
  'oldsmoke.m19.route.3': { x: -40, z: -55 },
  'oldsmoke.stealth.m19.start': { x: -50, z: -70 },
  'oldsmoke.stealth.m19.cp.inside': { x: -30, z: -95 },
  'oldsmoke.stealth.m19.end': { x: 10, z: -105 },
  'oldsmoke.lower.sealed.1': { x: 20, z: -108 },
  'oldsmoke.lower.sealed.2': { x: 24, z: -104 },
  'oldsmoke.lower.sealed.3': { x: 28, z: -108 },
  'oldsmoke.m19.nursery': { x: 50, z: -115 },
};

export const M18M19_PACE: readonly M18M19PaceRow[] = [
  {
    // Pike's brief at the shaft head is the ride down (a lift beat); the plaque and the lit shrine are interacts, the pipes a search,
    // the valves two attempts (A9: a failed attempt resets the room), the six crawlers a kill each
    quest: 'm18', design: 50, floor: 20, nodes: 34,
    route: [
      'oldsmoke.bellows.lift', 'npc-post.pike.bellows', 'oldsmoke.bellows.plaque', 'oldsmoke.bellows.pipes', 'npc-post.pike-apprentice.bellows', 'npc-post.pike.bellows',
      'oldsmoke.bellows.crawler.6', 'oldsmoke.bellows.crawler.1', 'oldsmoke.bellows.crawler.2', 'oldsmoke.bellows.crawler.3', 'oldsmoke.bellows.crawler.4', 'oldsmoke.bellows.crawler.5',
      'mines.weeping-bellows.center', 'oldsmoke.bellows.plaque', 'mines.weeping-bellows.center', 'npc-post.pike.bellows',
    ],
    beats: { killUnit: 6, search: 2, interact: 2, puzzle: 2, set: 1, lift: 2 },
  },
  {
    // the confession is in the hall (the ride down is one lift beat); she leads to the stealth start, then the section, the three locks, the nursery
    quest: 'm19', design: 50, floor: 20, nodes: 46, follow: 2,
    route: [
      'oldsmoke.lower.lift', 'oldsmoke.m19.route.3', 'oldsmoke.stealth.m19.start', 'oldsmoke.stealth.m19.cp.inside', 'oldsmoke.stealth.m19.end',
      'oldsmoke.lower.sealed.1', 'oldsmoke.lower.sealed.2', 'oldsmoke.lower.sealed.3', 'oldsmoke.m19.nursery',
    ],
    beats: { stealthSection: 1, interact: 3, set: 1, lift: 1 },
  },
];

/** Like `paceMinutes` (../pacing.ts), with the first `follow` legs walked at Wenna's pace. An unknown anchor throws. */
export function paceMinutesFollow(row: M18M19PaceRow, anchors: AnchorPos): PaceResult {
  let travelM = 0;
  let seconds = 0;
  for (let i = 1; i < row.route.length; i++) {
    const a = anchors[row.route[i - 1]];
    const b = anchors[row.route[i]];
    if (!a) throw new Error(`pacing ${row.quest}: unknown anchor ${row.route[i - 1]}`);
    if (!b) throw new Error(`pacing ${row.quest}: unknown anchor ${row.route[i]}`);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    travelM += d;
    seconds += d / (i <= (row.follow ?? 0) ? ROUTE_FOLLOW_MPS : WALK_MPS);
  }
  let talkAndBeatsS = row.nodes * TALK_NODE_S;
  for (const [beat, n] of Object.entries(row.beats) as [Act2Beat, number][]) talkAndBeatsS += ACT2_BEAT_S[beat] * n;
  return { quest: row.quest, minutes: (cappedTravelS(seconds, talkAndBeatsS) + talkAndBeatsS) / 60, travelM, uncappedMinutes: (seconds + talkAndBeatsS) / 60 };
}
