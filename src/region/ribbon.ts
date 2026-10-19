// Draped ribbons for the Dead Road's surface and the water: a strip along a polyline that follows the terrain.
// Pure maths (stations, levels) is separate from the THREE geometry so tests need no WebGL.
import * as THREE from 'three';

export type Pt = readonly [number, number];
export type HeightFn = (x: number, z: number) => number;

export interface Station {
  x: number;
  z: number;
  /** Unit normal in the XZ plane (to the left of travel). */
  nx: number;
  nz: number;
}

/** Stations every `step` metres along the polyline (the last point is always a station). Throws on bad input. */
export function sampleStations(points: readonly Pt[], step: number): Station[] {
  if (points.length < 2) throw new Error('ribbon: needs at least two points');
  if (!(step > 0) || !Number.isFinite(step)) throw new Error('ribbon: step must be positive');
  for (const [x, z] of points) if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('ribbon: non-finite point');
  const out: Station[] = [];
  const push = (x: number, z: number, dx: number, dz: number): void => {
    const len = Math.hypot(dx, dz) || 1;
    out.push({ x, z, nx: -dz / len, nz: dx / len });
  };
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len === 0) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) push(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, x1 - x0, z1 - z0);
  }
  const [lx, lz] = points[points.length - 1];
  const [px, pz] = points[points.length - 2];
  if (out.length === 0) throw new Error('ribbon: the polyline has no length');
  push(lx, lz, lx - px, lz - pz);
  return out;
}

export interface RibbonOptions {
  lift: number;
  /** Water: one level per station (the lowest of left, centre and right) instead of a level per vertex. */
  flat?: boolean;
  /** Water: a station is never higher than the one before it, so a draped river cannot run uphill. */
  monotone?: boolean;
}

/** The y of the left, centre and right vertices of every station. */
export function ribbonHeights(stations: readonly Station[], width: number, heightAt: HeightFn, opts: RibbonOptions): Array<[number, number, number]> {
  if (!(width > 0) || !Number.isFinite(width)) throw new Error('ribbon: width must be positive');
  const half = width / 2;
  let prev = Infinity;
  return stations.map((s) => {
    const l = heightAt(s.x + s.nx * half, s.z + s.nz * half);
    const c = heightAt(s.x, s.z);
    const r = heightAt(s.x - s.nx * half, s.z - s.nz * half);
    if (!opts.flat) return [l + opts.lift, c + opts.lift, r + opts.lift];
    let level = Math.min(l, c, r) + opts.lift;
    if (opts.monotone) {
      level = Math.min(level, prev);
      prev = level;
    }
    return [level, level, level];
  });
}

export function ribbonGeometry(stations: readonly Station[], width: number, heightAt: HeightFn, opts: RibbonOptions): THREE.BufferGeometry {
  const hs = ribbonHeights(stations, width, heightAt, opts);
  const half = width / 2;
  const pos = new Float32Array(stations.length * 9);
  const idx: number[] = [];
  stations.forEach((s, i) => {
    const [yl, yc, yr] = hs[i];
    pos.set([s.x + s.nx * half, yl, s.z + s.nz * half, s.x, yc, s.z, s.x - s.nx * half, yr, s.z - s.nz * half], i * 9);
    if (i === 0) return;
    const a = (i - 1) * 3;
    const b = i * 3;
    // Two quads per step (left and right of the centre line), wound to face up.
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Water draped across its whole width: `lanes` strips side by side, every vertex `lift` above the ground under it.
 * A flat sheet at one level per station sank under the higher bank wherever the course runs across a slope, so the
 * terrain broke through it in patches; a draped sheet cannot be buried by the ground it was sampled from. With no
 * carved channel it tilts with the ground (a little across a side slope), which reads as water; being buried did not.
 * The `flat` and `monotone` options of ribbonGeometry stay for a carved channel later.
 */
export function drapedWaterGeometry(stations: readonly Station[], width: number, heightAt: HeightFn, lift: number, lanes = 6): THREE.BufferGeometry {
  if (!(width > 0) || !Number.isFinite(width)) throw new Error('ribbon: width must be positive');
  if (!Number.isInteger(lanes) || lanes < 1) throw new Error('ribbon: lanes must be a positive integer');
  const cols = lanes + 1;
  const half = width / 2;
  const pos = new Float32Array(stations.length * cols * 3);
  const idx: number[] = [];
  stations.forEach((s, i) => {
    for (let k = 0; k < cols; k++) {
      const off = half - (width * k) / lanes;
      const x = s.x + s.nx * off;
      const z = s.z + s.nz * off;
      pos.set([x, heightAt(x, z) + lift, z], (i * cols + k) * 3);
      if (i === 0 || k === 0) continue;
      const a = (i - 1) * cols + k - 1;
      const b = i * cols + k - 1;
      // Same winding as ribbonGeometry: faces up.
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
