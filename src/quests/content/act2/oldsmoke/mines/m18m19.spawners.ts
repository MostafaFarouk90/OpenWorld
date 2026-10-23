import { WATCH_GUARD_BAND } from '../../../../../enemies/level';
import type { SpawnerDef } from '../../../../../enemies/types';
import { M18_CRAWLERS_FLAG } from './m18.quest';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const common = { band: 'oldsmoke', respawn: 'never' as const };

/** The M19 watch: one guard pacing the cover room's east half, from its centre to the north-east corner and back. */
export const M19_WATCH_POSTS = ['oldsmoke.stealth.m19.centre', 'oldsmoke.m19.patrol.3'] as const;

/**
 * Quest-scoped groups of M18 and M19. The crawler anchors are A4's (`oldsmoke.bellows.crawler.1..6`). The M19 watch stands on
 * A4's real Lower Galleries anchors (m19.stealth.test.ts walks them headless): A4's five-point loop runs within 3 m of all four
 * hide spots and two of its posts stand beside the start checkpoint (a guard respawned there after a capture caught the player
 * again at once, in the live build), so the watch is one guard pacing the line from the room's centre to its north-east
 * corner. A second guard on the same line left no gap on the north wall in the live build. The sneak route: from the west door to
 * hide spot 2 on the north wall while he walks east, then along the wall to the exit once he has turned at the centre.
 */
export const M18M19_SPAWNERS: readonly SpawnerDef[] = [
  // M18: six crawlers nested in the cavern, woken by the apprentice's lore
  {
    id: 'q13.m18.crawlers', tag: 'm18.crawler', enemy: 'slag-crawler', count: 6, anchor: 'oldsmoke.bellows.crawler.1',
    memberAnchors: range('oldsmoke.bellows.crawler.', 1, 6), activation: { quest: 'm18', flag: M18_CRAWLERS_FLAG }, leash: true, ...common,
  },
  // M19: the stewards' watch for the stealth section: observer-only guards on a loop, live while the quest is
  {
    id: 'stealth.m19.watch', enemy: 'watch-guard', count: 1, anchor: M19_WATCH_POSTS[0], memberAnchors: [M19_WATCH_POSTS[0]],
    patrol: [...M19_WATCH_POSTS], band: WATCH_GUARD_BAND, activation: { quest: 'm19' }, respawn: 'never', leash: false,
  },
];
