// Messages between WorkerPool (main thread) and terrain.worker.ts, with runtime validation on
// both sides: workers reject malformed requests, and the pool ignores malformed replies.

import { chunkVertexCount, type ChunkData, type ChunkRequest } from './chunkGeometry';

/** Upper bound on segments per chunk edge, to keep a bad request from allocating gigabytes. */
export const MAX_SEGMENTS = 512;

export interface ChunkJobMessage {
  id: number;
  request: ChunkRequest;
}

export type ChunkReplyMessage =
  | { id: number; ok: true; data: ChunkData }
  | { id: number; ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Returns why a request is invalid, or null when it is valid. */
export function validateChunkRequest(request: unknown): string | null {
  if (!isObject(request)) return 'request is not an object';
  const { centerX, centerZ, size, segments, skirtDepth } = request;
  if (!isFiniteNumber(centerX) || !isFiniteNumber(centerZ)) return 'centre is not finite';
  if (!isFiniteNumber(size) || size <= 0) return 'size must be a positive number';
  if (!Number.isInteger(segments) || (segments as number) < 1 || (segments as number) > MAX_SEGMENTS) {
    return `segments must be an integer in 1..${MAX_SEGMENTS}`;
  }
  if (!isFiniteNumber(skirtDepth) || skirtDepth < 0) return 'skirtDepth must be a non-negative number';
  return null;
}

/**
 * Checks a reply's shape. For success replies, `segments` is the request's segment count and the
 * buffer lengths must match it, so a reply for another chunk shape cannot be attached to this one.
 */
export function isValidReply(message: unknown, segments?: number): message is ChunkReplyMessage {
  if (!isObject(message) || !Number.isInteger(message.id)) return false;
  if (message.ok === false) return typeof message.error === 'string';
  if (message.ok !== true || !isObject(message.data)) return false;
  const { positions, normals, colors, minY, maxY } = message.data;
  if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array)) return false;
  if (!(colors instanceof Float32Array)) return false;
  if (!isFiniteNumber(minY) || !isFiniteNumber(maxY) || minY > maxY) return false;
  const expected = segments === undefined ? positions.length : chunkVertexCount(segments) * 3;
  return positions.length === expected && normals.length === expected && colors.length === expected;
}
