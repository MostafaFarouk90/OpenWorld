import { describe, it, expect } from 'vitest';
import { isShardGemId, shardGemId, SHARD_GEM_PREFIX } from './shardGems';
import { GEAR_ROWS } from './catalog';

describe('shard-gem ids', () => {
  it('builds and recognises ids', () => {
    expect(shardGemId('ember')).toBe('shard-gem.ember');
    expect(isShardGemId('shard-gem.ember')).toBe(true);
  });
  it('rejects look-alikes', () => {
    for (const bad of ['ember-shard', 'shard-gem.', 'shard.ember', '', 'Shard-gem.x', 3, null, undefined]) expect(isShardGemId(bad)).toBe(false);
  });
  it('refuses empty or already-prefixed names', () => {
    expect(() => shardGemId('')).toThrow();
    expect(() => shardGemId(`${SHARD_GEM_PREFIX}x`)).toThrow();
  });
  it('no shipped gear row has sockets yet', () => {
    expect(GEAR_ROWS.every((r) => r.sockets === undefined)).toBe(true);
  });
});
