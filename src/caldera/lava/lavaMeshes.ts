// N3 lava meshes (plans/act5-N3.md 1.4): one draw call per volume. Vertices are local to the volume's origin (its centre
// at its surface), so every number the GPU sees is small. Haze strips (1.5) stand on the same outline.
import * as THREE from 'three';
import type { LavaShape } from '../lava';
import { HAZE_FLAG } from '../lava';

/** The volume's local origin: its centre in (x, z) at height `y`. */
export function shapeOrigin(shape: LavaShape, y: number): THREE.Vector3 {
  if (shape.kind === 'box') return new THREE.Vector3((shape.x0 + shape.x1) / 2, y, (shape.z0 + shape.z1) / 2);
  if (shape.kind === 'circle') return new THREE.Vector3(shape.x, y, shape.z);
  let x = 0;
  let z = 0;
  for (const [px, pz] of shape.points) {
    x += px;
    z += pz;
  }
  return new THREE.Vector3(x / shape.points.length, y, z / shape.points.length);
}

/** Polyline resampled every `step` metres (the ends kept). */
export function resample(points: readonly (readonly [number, number])[], step: number, max: number): [number, number][] {
  const out: [number, number][] = [[points[0]![0], points[0]![1]]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  if (out.length <= max) return out;
  const every = (out.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => out[Math.round(i * every)]!);
}

/** Unit left normal at each resampled point (averaged across corners). */
function normals(pts: readonly [number, number][]): [number, number][] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  });
}

/**
 * The surface geometry of a shape, local to `origin`; `heightAt(x, z)` is the surface in world metres (a profiled ribbon
 * slopes). Boxes are a plane, circles a disc (segments by size, at most 96), ribbons a strip every 2 m (at most 400 rows).
 */
export function surfaceGeometry(shape: LavaShape, origin: THREE.Vector3, heightAt: (x: number, z: number) => number): THREE.BufferGeometry {
  if (shape.kind === 'box') {
    const w = shape.x1 - shape.x0;
    const d = shape.z1 - shape.z0;
    const g = new THREE.PlaneGeometry(w, d, Math.min(64, Math.max(1, Math.ceil(w / 4))), Math.min(64, Math.max(1, Math.ceil(d / 4))));
    g.rotateX(-Math.PI / 2);
    return g;
  }
  if (shape.kind === 'circle') {
    const g = new THREE.CircleGeometry(shape.r, Math.min(96, Math.max(16, Math.ceil(shape.r * 1.5))));
    g.rotateX(-Math.PI / 2);
    return g;
  }
  const pts = resample(shape.points, 2, 400);
  const ns = normals(pts);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach(([x, z], i) => {
    const [nx, nz] = ns[i]!;
    const y = heightAt(x, z) - origin.y;
    pos.push(x + nx * shape.halfWidth - origin.x, y, z + nz * shape.halfWidth - origin.z);
    pos.push(x - nx * shape.halfWidth - origin.x, y, z - nz * shape.halfWidth - origin.z);
    uv.push(0, i / (pts.length - 1), 1, i / (pts.length - 1));
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Haze cards over a volume, local to `origin`, flagged with HAZE_FLAG: a strip `height` tall along a ribbon's centre line,
 * a ring round a circle's shore, a cross over a box. uv.y runs 0 at the surface to 1 at the top (the fade).
 */
export function hazeGeometries(shape: LavaShape, origin: THREE.Vector3, heightAt: (x: number, z: number) => number, height: number): THREE.BufferGeometry[] {
  if (shape.kind === 'circle') {
    const ring = new THREE.CylinderGeometry(shape.r * 0.95, shape.r * 0.95, height, Math.min(64, Math.max(12, Math.ceil(shape.r))), 1, true);
    ring.translate(0, height / 2, 0);
    return [ring];
  }
  if (shape.kind === 'box') {
    const w = shape.x1 - shape.x0;
    const d = shape.z1 - shape.z0;
    const a = new THREE.PlaneGeometry(w, height);
    a.translate(0, height / 2, 0);
    const b = new THREE.PlaneGeometry(d, height);
    b.translate(0, height / 2, 0);
    b.rotateY(Math.PI / 2);
    return [a, b];
  }
  const pts = resample(shape.points, 4, 120);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach(([x, z], i) => {
    const y = heightAt(x, z) - origin.y;
    pos.push(x - origin.x, y, z - origin.z, x - origin.x, y + height, z - origin.z);
    const u = (i * 4) / 6;
    uv.push(u, 0, u, 1);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return [g];
}

/** A mesh flagged for the heat-haze pass (its material is replaced by the pass's when tracked). */
export function hazeMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  m.userData[HAZE_FLAG] = true;
  m.name = 'caldera-haze';
  return m;
}
