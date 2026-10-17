import { describe, expect, it, vi } from 'vitest';
import type { ChunkRequest } from '../chunkGeometry';
import { handleChunkMessage } from './terrain.worker';

// Keep every real export, but make the geometry build itself fail.
vi.mock('../chunkGeometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../chunkGeometry')>()),
  buildChunkData: vi.fn(() => {
    throw new Error('kaboom');
  }),
}));

const good: ChunkRequest = { centerX: 100, centerZ: -200, size: 100, segments: 4, skirtDepth: 2 };

describe('handleChunkMessage when the build throws', () => {
  it('returns ok:false with the error text and an empty transfer list', () => {
    const { message, transfer } = handleChunkMessage({ id: 7, request: good });
    expect(message.ok).toBe(false);
    expect(message.id).toBe(7);
    if (message.ok) throw new Error('unreachable');
    expect(message.error).toContain('kaboom');
    expect(transfer).toEqual([]);
  });

  it('still rejects invalid requests before reaching the build', () => {
    const { message, transfer } = handleChunkMessage({ id: 1, request: { ...good, size: -1 } });
    expect(message.ok).toBe(false);
    if (message.ok) throw new Error('unreachable');
    expect(message.error).not.toContain('kaboom');
    expect(transfer).toEqual([]);
  });
});
