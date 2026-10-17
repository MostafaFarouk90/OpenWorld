import { describe, expect, it } from 'vitest';
import { chunkVertexCount, type ChunkRequest } from '../chunkGeometry';
import { MAX_SEGMENTS, isValidReply, validateChunkRequest } from '../workerProtocol';
import { handleChunkMessage } from './terrain.worker';

const good: ChunkRequest = { centerX: 100, centerZ: -200, size: 100, segments: 4, skirtDepth: 2 };

function validData(segments = 4) {
  const n = chunkVertexCount(segments) * 3;
  return { positions: new Float32Array(n), normals: new Float32Array(n), colors: new Float32Array(n), minY: 0, maxY: 1 };
}

describe('validateChunkRequest', () => {
  it('accepts a valid request, including boundary values', () => {
    expect(validateChunkRequest(good)).toBeNull();
    expect(validateChunkRequest({ ...good, segments: 1, skirtDepth: 0 })).toBeNull();
    expect(validateChunkRequest({ ...good, segments: MAX_SEGMENTS })).toBeNull();
  });

  it.each([null, undefined, 5, 'x', true])('rejects non-object %s', (value) => {
    expect(validateChunkRequest(value)).toEqual(expect.any(String));
  });

  it.each([
    ['NaN centreX', { centerX: NaN }],
    ['Infinity centreZ', { centerZ: Infinity }],
    ['string centreX', { centerX: '1' }],
    ['missing centreX', { centerX: undefined }],
    ['size 0', { size: 0 }],
    ['negative size', { size: -5 }],
    ['NaN size', { size: NaN }],
    ['Infinity size', { size: Infinity }],
    ['segments 0', { segments: 0 }],
    ['segments 1.5', { segments: 1.5 }],
    ['negative segments', { segments: -4 }],
    ['segments above max', { segments: MAX_SEGMENTS + 1 }],
    ['NaN segments', { segments: NaN }],
    ['negative skirtDepth', { skirtDepth: -1 }],
    ['NaN skirtDepth', { skirtDepth: NaN }],
    ['missing skirtDepth', { skirtDepth: undefined }],
  ])('rejects %s', (_name, patch) => {
    expect(validateChunkRequest({ ...good, ...patch })).toEqual(expect.any(String));
  });
});

describe('isValidReply', () => {
  it('accepts a valid ok reply and a valid error reply', () => {
    expect(isValidReply({ id: 1, ok: true, data: validData() })).toBe(true);
    expect(isValidReply({ id: 1, ok: true, data: validData() }, 4)).toBe(true);
    expect(isValidReply({ id: 0, ok: false, error: 'boom' })).toBe(true);
  });

  it('rejects non-objects, missing or non-integer ids', () => {
    expect(isValidReply(null)).toBe(false);
    expect(isValidReply(undefined)).toBe(false);
    expect(isValidReply('x')).toBe(false);
    expect(isValidReply({ ok: false, error: 'e' })).toBe(false);
    expect(isValidReply({ id: 1.5, ok: false, error: 'e' })).toBe(false);
    expect(isValidReply({ id: '1', ok: false, error: 'e' })).toBe(false);
    expect(isValidReply({ id: NaN, ok: false, error: 'e' })).toBe(false);
  });

  it('rejects bad ok flags and error payloads', () => {
    expect(isValidReply({ id: 1 })).toBe(false);
    expect(isValidReply({ id: 1, ok: 'yes', data: validData() })).toBe(false);
    expect(isValidReply({ id: 1, ok: false })).toBe(false);
    expect(isValidReply({ id: 1, ok: false, error: 5 })).toBe(false);
    expect(isValidReply({ id: 1, ok: true })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: null })).toBe(false);
  });

  it('rejects wrong buffer types', () => {
    const d = validData();
    expect(isValidReply({ id: 1, ok: true, data: { ...d, positions: new Float64Array(d.positions.length) } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, normals: Array.from(d.normals) } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, colors: new Uint8Array(d.colors.length) } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, positions: undefined } })).toBe(false);
  });

  it('rejects bad height ranges', () => {
    const d = validData();
    expect(isValidReply({ id: 1, ok: true, data: { ...d, minY: 5, maxY: 1 } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, minY: NaN } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, maxY: Infinity } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, minY: '0' } })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...d, minY: 3, maxY: 3 } })).toBe(true);
  });

  it('rejects mismatched buffer lengths, with and without a segment count', () => {
    const d = validData(4);
    expect(isValidReply({ id: 1, ok: true, data: d }, 5)).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: d }, 3)).toBe(false);
    const short = { ...d, normals: new Float32Array(d.normals.length - 3) };
    expect(isValidReply({ id: 1, ok: true, data: short })).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: short }, 4)).toBe(false);
  });
});

describe('handleChunkMessage', () => {
  it('builds a chunk and transfers the three buffers', () => {
    const { message, transfer } = handleChunkMessage({ id: 7, request: good });
    expect(message.ok).toBe(true);
    expect(message.id).toBe(7);
    if (!message.ok) return;
    expect(message.data.positions.length).toBe(chunkVertexCount(4) * 3);
    expect(transfer).toHaveLength(3);
    expect(transfer).toContain(message.data.positions.buffer);
    expect(transfer).toContain(message.data.normals.buffer);
    expect(transfer).toContain(message.data.colors.buffer);
    expect(isValidReply(message, 4)).toBe(true);
  });

  it('accepts id 0', () => {
    expect(handleChunkMessage({ id: 0, request: good }).message.ok).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'chunk'],
    ['an empty object', {}],
    ['missing id', { request: good }],
    ['fractional id', { id: 1.5, request: good }],
    ['negative id', { id: -3, request: good }],
    ['string id', { id: '1', request: good }],
    ['missing request', { id: 1 }],
    ['null request', { id: 1, request: null }],
    ['invalid request', { id: 1, request: { ...good, segments: 0 } }],
    ['NaN centre', { id: 1, request: { ...good, centerX: NaN } }],
    ['huge segments', { id: 1, request: { ...good, segments: 1e9 } }],
  ])('answers %s with ok:false, an empty transfer list and no throw', (_name, input) => {
    let reply: ReturnType<typeof handleChunkMessage> | undefined;
    expect(() => {
      reply = handleChunkMessage(input);
    }).not.toThrow();
    expect(reply?.message.ok).toBe(false);
    expect(reply?.transfer).toEqual([]);
    if (reply && !reply.message.ok) expect(reply.message.error.length).toBeGreaterThan(0);
    expect(isValidReply(reply?.message)).toBe(true);
  });

  it('echoes the job id on request errors when the id is valid', () => {
    const { message } = handleChunkMessage({ id: 9, request: { ...good, size: -1 } });
    expect(message.id).toBe(9);
    expect(message.ok).toBe(false);
  });
});
