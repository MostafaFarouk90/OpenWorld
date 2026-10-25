// The four Greywatch posts (a platform 4 m up, reached by a stair of 0.4 m steps: no new climb verb), the Greywatch waystone
// with R14's stocks, its jetty, and the Sunken Chapel's ruined front with the bell tower stump (R13's exit-only far door).
import type { LayoutData, StructureSpec } from '../region/layoutTypes';
import { a, numbered, polar, solid } from './helpers';
import { GREYWATCH_POSTS, JETTIES, POST_HEIGHT, POST_PLATFORM, POST_STEPS, postPlatform, R14_LEECHES } from './places';
import { FERRY_JETTY_ID, headingTo, jettySpec, onJettyAnchor } from './reedgate';
import { GREYFEN_WAYSTONES, SITES } from './sites';

const STEP = POST_HEIGHT / (POST_STEPS + 1);
/** The chapel's bell tower stump, where the tower stair comes out: 12 m from the chapel door. */
export const TOWER_EXIT_OFFSET = { x: 12, z: -0.5 } as const;

export const platformId = (n: number) => `greyfen-greywatch-post-${n}`;

function post(n: number): StructureSpec[] {
  const f = GREYWATCH_POSTS[n - 1]!;
  const p = postPlatform(f);
  const steps = Array.from({ length: POST_STEPS }, (_, i) =>
    solid(`greyfen-greywatch-post-${n}-step-${i + 1}`, 'stair-step', p.x + POST_PLATFORM / 2 + i + 0.5, p.z, 1, 1.6, Math.round((POST_HEIGHT - STEP * (i + 1)) * 100) / 100),
  );
  return [solid(platformId(n), 'greyfen-ranger-platform', p.x, p.z, POST_PLATFORM, POST_PLATFORM, POST_HEIGHT), ...steps];
}

export function greywatchLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const ws = GREYFEN_WAYSTONES.greywatch;
  const j = JETTIES.greywatch;
  const jid = FERRY_JETTY_ID('greywatch');
  const door = SITES.chapelDoor;
  const tower = { x: door.x + TOWER_EXIT_OFFSET.x, z: door.z + TOWER_EXIT_OFFSET.z };
  const posts = [1, 2, 3, 4].flatMap((n) => {
    const p = postPlatform(GREYWATCH_POSTS[n - 1]!);
    const foot = { x: p.x + POST_PLATFORM / 2 + POST_STEPS + 1, z: p.z };
    return [
      a(`greyfen.greywatch.post.${n}`, p.x, p.z, 0, ['objective'], { onStructure: platformId(n), dy: POST_HEIGHT }),
      a(`greyfen.greywatch.post.${n}.fire`, p.x - 1.5, p.z + 1.5, 0, ['objective'], { onStructure: platformId(n), dy: POST_HEIGHT }),
      a(`greyfen.greywatch.post.${n}.ladder`, foot.x, foot.z, 270, ['objective']),
      ...numbered(`greyfen.r14.sign.${n}`, [[foot.x + 2, foot.z + 3], [foot.x + 2, foot.z - 3]], ['objective']),
    ];
  });
  const plat = (n: number) => postPlatform(GREYWATCH_POSTS[n - 1]!);
  const camp = plat(4);
  return {
    anchors: [
      a('waystone.greywatch', ws.x, ws.z - 1.8, 0, ['waystone']),
      a('npc-post.leofa.greywatch', ws.x - 6, ws.z + 3, 90, ['npc-post']),
      a('npc-post.deserter.stocks', ws.x + 6, ws.z + 3.6, 0, ['npc-post']),
      onJettyAnchor('greyfen.ferry.greywatch', jid, j, j.length - 1, headingTo(j.water, j.land)),
      ...posts,
      // R14: a ranger at each of posts 1 to 3, the one tied up at post 3, the deserter's camp and the hunter pack at post 4.
      ...[1, 2, 3].map((n) => a(`greyfen.r14.ranger.${n}`, plat(n).x, plat(n).z + 6, 180, ['npc-post'])),
      a('greyfen.r14.tied', plat(3).x, plat(3).z - 6, 0, ['objective']),
      a('npc-post.deserter.camp', camp.x - 7, camp.z, 90, ['npc-post']),
      ...numbered('greyfen.spawn.r14.post4', [45, 135, 225, 315].map((h) => polar(camp.x, camp.z, h, 10)), ['spawn']),
      ...numbered('greyfen.spawn.r14.leech', R14_LEECHES.map((p) => [p.x, p.z] as const), ['spawn']),
      // R13: the chapel door and the bell tower's exit (an exit-only door: no outside prompt).
      a('greyfen.chapel.door', door.x, door.z, 0, ['poi']),
      a('greyfen.chapel.tower-exit', tower.x, tower.z, 0, ['poi']),
      a('npc-post.bell-keeper.door', door.x - 4, door.z + 3, 0, ['npc-post']),
    ],
    triggers: [],
    structures: [
      solid('greyfen-waystone-greywatch', 'waystone', ws.x, ws.z, 1.6, 1.6, 2.4),
      solid('greyfen-greywatch-stocks', 'greyfen-stocks', ws.x + 6, ws.z + 5, 2, 0.8),
      jettySpec(jid, j),
      ...[1, 2, 3, 4].flatMap(post),
      solid('greyfen-chapel-front', 'greyfen-chapel-ruin', door.x, door.z - 6, 16, 10),
      solid('greyfen-chapel-tower', 'greyfen-bell-tower', tower.x, door.z - 4, 4, 4),
    ],
  };
}
