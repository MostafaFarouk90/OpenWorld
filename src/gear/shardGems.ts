// v0.7 item 11: socketable shard-gems. Every user-facing string says "shard-gem", never just "shard", so it never reads
// as Cael's Ember Shard. Rows, strings and the socketing UI belong to K10; this file is the id family and the record.

/** One gem set into a gear socket: `slot` is 0 or 1 (a gear row's `sockets` count is at most 2). */
export interface SocketedShard { slot: number; shardId: string }

export const SHARD_GEM_PREFIX = 'shard-gem.';

/** True for `shard-gem.<name>` with a non-empty name. */
export function isShardGemId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(SHARD_GEM_PREFIX) && id.length > SHARD_GEM_PREFIX.length;
}

/** The item id of the shard-gem called `name` (`shardGemId('ember')` is `'shard-gem.ember'`). Throws on an empty name. */
export function shardGemId(name: string): string {
  if (typeof name !== 'string' || name === '' || name.startsWith(SHARD_GEM_PREFIX)) throw new Error(`shard-gem name "${String(name)}" is not a bare name`);
  return SHARD_GEM_PREFIX + name;
}
