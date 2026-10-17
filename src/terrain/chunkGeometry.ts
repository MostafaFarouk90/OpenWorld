// Chunk mesh data built from heightfield.ts, with no Three.js imports so it runs in workers.
// Each chunk is a (segments + 1)^2 grid plus a ring of skirt vertices dropped below every border
// vertex. Neighbouring chunks at different LOD levels disagree slightly along shared edges; the
// skirts fill those cracks without any runtime vertex stitching.

import { heightAt } from './heightfield';

export interface ChunkRequest {
  /** World-space centre of the chunk footprint. */
  centerX: number;
  centerZ: number;
  /** Edge length of the square footprint in metres. */
  size: number;
  /** Grid cells along each edge. */
  segments: number;
  /** How far skirt vertices hang below their border vertex. */
  skirtDepth: number;
}

export interface ChunkData {
  /** xyz per vertex; x and z are relative to the chunk centre, y is world height. */
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB per vertex. */
  colors: Float32Array;
  /** Height range of the surface (skirts excluded). */
  minY: number;
  maxY: number;
}

/** Vertex count for a chunk: grid plus one skirt vertex per border vertex. */
export function chunkVertexCount(segments: number): number {
  return (segments + 1) * (segments + 1) + 4 * segments;
}

/**
 * Grid index of the i-th border vertex, walking the perimeter clockwise when viewed from above
 * (+x along the -z edge, then +z along the +x edge, and so on).
 */
function borderGridIndex(i: number, segments: number): number {
  const row = segments + 1;
  const side = Math.floor(i / segments);
  const k = i % segments;
  switch (side) {
    case 0:
      return k; // z = min edge, x increasing
    case 1:
      return k * row + segments; // x = max edge, z increasing
    case 2:
      return segments * row + (segments - k); // z = max edge, x decreasing
    default:
      return (segments - k) * row; // x = min edge, z decreasing
  }
}

/** Triangle indices shared by every chunk with the same segment count. */
export function buildChunkIndices(segments: number): Uint16Array | Uint32Array {
  const row = segments + 1;
  const gridVerts = row * row;
  const border = 4 * segments;
  const count = segments * segments * 6 + border * 6;
  const indices = chunkVertexCount(segments) > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  let n = 0;

  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      const b = a + row;
      const c = b + 1;
      const d = a + 1;
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = d;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }

  // Skirt quads face outward; the perimeter is walked clockwise from above.
  for (let i = 0; i < border; i++) {
    const next = (i + 1) % border;
    const p0 = borderGridIndex(i, segments);
    const p1 = borderGridIndex(next, segments);
    const q0 = gridVerts + i;
    const q1 = gridVerts + next;
    indices[n++] = p0;
    indices[n++] = p1;
    indices[n++] = q0;
    indices[n++] = p1;
    indices[n++] = q1;
    indices[n++] = q0;
  }
  return indices;
}

/** Placeholder ground palette by height and steepness (normal.y), until real materials land. */
function surfaceColor(height: number, up: number, out: Float32Array, o: number): void {
  let r: number;
  let g: number;
  let b: number;
  if (height < 2) {
    // Shore sand.
    r = 0.62;
    g = 0.55;
    b = 0.38;
  } else if (height < 140) {
    // Meadow grass, drying slightly with altitude.
    const t = height / 140;
    r = 0.2 + 0.1 * t;
    g = 0.36 + 0.02 * t;
    b = 0.12 + 0.04 * t;
  } else if (height < 260) {
    // Upland heath.
    r = 0.33;
    g = 0.34;
    b = 0.2;
  } else {
    // Snow caps.
    r = 0.88;
    g = 0.9;
    b = 0.93;
  }
  // Steep slopes show bare rock.
  const rock = Math.min(Math.max((0.82 - up) / 0.12, 0), 1);
  out[o] = r + (0.36 - r) * rock;
  out[o + 1] = g + (0.33 - g) * rock;
  out[o + 2] = b + (0.3 - b) * rock;
}

/** Samples the heightfield and builds positions, normals and colours for one chunk. */
export function buildChunkData(req: ChunkRequest): ChunkData {
  const { centerX, centerZ, size, segments, skirtDepth } = req;
  const row = segments + 1;
  const gridVerts = row * row;
  const step = size / segments;
  const half = size / 2;

  // Heights with a one-sample apron so border normals use central differences too.
  const padRow = segments + 3;
  const padded = new Float64Array(padRow * padRow);
  for (let j = 0; j < padRow; j++) {
    const z = centerZ - half + (j - 1) * step;
    for (let i = 0; i < padRow; i++) {
      padded[j * padRow + i] = heightAt(centerX - half + (i - 1) * step, z);
    }
  }

  const vertexCount = chunkVertexCount(segments);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let minY = Infinity;
  let maxY = -Infinity;

  for (let j = 0; j < row; j++) {
    for (let i = 0; i < row; i++) {
      const p = (j + 1) * padRow + (i + 1);
      const h = padded[p];
      const v = (j * row + i) * 3;
      positions[v] = -half + i * step;
      positions[v + 1] = h;
      positions[v + 2] = -half + j * step;

      const nx = padded[p - 1] - padded[p + 1];
      const nz = padded[p - padRow] - padded[p + padRow];
      const ny = 2 * step;
      const len = Math.hypot(nx, ny, nz);
      normals[v] = nx / len;
      normals[v + 1] = ny / len;
      normals[v + 2] = nz / len;

      surfaceColor(h, ny / len, colors, v);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }

  for (let i = 0; i < 4 * segments; i++) {
    const src = borderGridIndex(i, segments) * 3;
    const dst = (gridVerts + i) * 3;
    positions[dst] = positions[src];
    positions[dst + 1] = positions[src + 1] - skirtDepth;
    positions[dst + 2] = positions[src + 2];
    for (let k = 0; k < 3; k++) {
      normals[dst + k] = normals[src + k];
      colors[dst + k] = colors[src + k];
    }
  }

  return { positions, normals, colors, minY, maxY };
}
