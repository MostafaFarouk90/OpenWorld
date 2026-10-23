import { WATCH_GUARD_BAND } from '../../../../../enemies/level';
import type { SpawnerDef } from '../../../../../enemies/types';
import { M18_CRAWLERS_FLAG } from './m18.quest';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const common = { band: 'oldsmoke', respawn: 'never' as const };

/**
 * Quest-scoped groups of M18 and M19. The crawler anchors are A4's (`oldsmoke.bellows.crawler.1..6`); the watch anchors
 * (`oldsmoke.m19.watch.1..4` for the posts, `oldsmoke.m19.patrol.1..5` for the loop) are not in A4's list and are asked for.
 */
export const M18M19_SPAWNERS: readonly SpawnerDef[] = [
  // M18: six crawlers nested in the cavern, woken by the apprentice's lore
  {
    id: 'q13.m18.crawlers', tag: 'm18.crawler', enemy: 'slag-crawler', count: 6, anchor: 'oldsmoke.bellows.crawler.1',
    memberAnchors: range('oldsmoke.bellows.crawler.', 1, 6), activation: { quest: 'm18', flag: M18_CRAWLERS_FLAG }, leash: true, ...common,
  },
  // M19: the stewards' watch for the stealth section: observer-only guards on a loop, live while the quest is
  {
    id: 'stealth.m19.watch', enemy: 'watch-guard', count: 4, anchor: 'oldsmoke.m19.watch.1', memberAnchors: range('oldsmoke.m19.watch.', 1, 4),
    patrol: range('oldsmoke.m19.patrol.', 1, 5), band: WATCH_GUARD_BAND, activation: { quest: 'm19' }, respawn: 'never', leash: false,
  },
];
