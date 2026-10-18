// The Hollin Ford toll-post actor itself is spawned by the enemies module (anchor `ford.toll-post`, which the layout
// defines). Region only records that it fell: `actor.died { kind: 'toll-post', spawnTag: 'ford.toll-post' }` sets the flag.

import type { CoreContext } from './coreTypes';

export const TOLL_POST_BROKEN_FLAG = 'world.brightwater.tollPost';
export const TOLL_POST_KIND = 'toll-post';
export const TOLL_POST_SPAWN_TAG = 'ford.toll-post';

export function watchTollPost(ctx: Pick<CoreContext, 'events' | 'state'>): () => void {
  return ctx.events.on('actor.died', (p: { kind?: string; spawnTag?: string } | undefined) => {
    if (p?.kind === TOLL_POST_KIND && p.spawnTag === TOLL_POST_SPAWN_TAG) ctx.state.setFlag(TOLL_POST_BROKEN_FLAG, true);
  });
}
