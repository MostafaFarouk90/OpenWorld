// The Dragonspine summit stand-in (thread K1, plan 8: skyline landmark 'landmark.dragonspine-summit'), the Oldsmoke
// stacks' method (act2/oldsmokeStacks.ts) for the Act 3 peaks. The camera sees about 5 km; the summit is 12 km from the
// Fen Road and the Cinder Road, so past 0.9 x the far plane a low silhouette of the real peaks is drawn instead: on the
// true line of sight, scaled by the same factor (same bearing, same angular size), fog-tinted by real distance. Hidden
// indoors, and hidden once the camera is within 0.9 x far of the summit (the real peaks are in view distance then).
//
// Built once from the shaped heightfield: a coarse grid over the summit area (24 x 12 cells), each vertex the highest of
// 2 x 2 samples inside its cell, so the skyline from any side is the real crest. The mesh is built about its own centre
// (vertices under about 3 km), like a terrain chunk, so float32 stays exact however far from the world origin it sits.
import * as THREE from 'three';
import { hazeFor, PROXY_FAR_FRACTION } from '../act2/oldsmokeStacks';

export const SUMMIT_LANDMARK_ID = 'landmark.dragonspine-summit';
/** The summit area sampled for the silhouette (engine metres). */
export const SUMMIT_AREA = { minX: 11500, maxX: 16500, minZ: 14800, maxZ: 16900 } as const;
/** The mesh's own centre, near the Wyrm's Hearth (engine metres). */
export const SUMMIT_CENTRE = { x: 14000, z: 15800 } as const;
/** Grid cells across x and z; the crest is the highest of CELL_SAMPLES x CELL_SAMPLES samples in each cell. */
export const SUMMIT_COLUMNS = 24;
export const SUMMIT_ROWS = 12;
export const CELL_SAMPLES = 2;
/** The stand-in is hidden within this fraction of the far plane of the summit centre. */
export const HIDE_FAR_FRACTION = 0.9;
/** Mesh and skirt bottom (metres): the silhouette stands on this level. */
const SKIRT_Y = 0;

export interface SummitPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Real distance from the camera to the summit centre (at y 0), metres. */
  distance: number;
}

/**
 * Where to draw the group (origin = the summit centre at y 0) for a camera at `cam` with far plane `far`, for a mesh of
 * bounding `radius`: along the line of sight at 0.9 x far, pulled in further when the mesh's far side would pass the
 * far plane, and scaled by distance ratio so the angular size is the real one. Pure.
 */
export function summitPlacement(cam: { x: number; y: number; z: number }, far: number, radius: number): SummitPlacement {
  const dx = SUMMIT_CENTRE.x - cam.x;
  const dy = 0 - cam.y;
  const dz = SUMMIT_CENTRE.z - cam.z;
  const distance = Math.hypot(dx, dy, dz);
  const limit = PROXY_FAR_FRACTION * far;
  if (!(distance > limit) || !(limit > 0)) return { x: SUMMIT_CENTRE.x, y: 0, z: SUMMIT_CENTRE.z, scale: 1, distance };
  // d * (1 + radius / distance) stays within 98% of the far plane.
  const placed = Math.min(limit, (0.98 * far) / (1 + radius / distance));
  const k = placed / distance;
  return { x: cam.x + dx * k, y: cam.y + dy * k, z: cam.z + dz * k, scale: k, distance };
}

export interface SummitLandmark {
  readonly object: THREE.Group;
  /** Places and tints the stand-in; hidden `indoors` and while the real peaks are inside the view distance. */
  update(cameraPos: { x: number; y: number; z: number }, cameraFar: number, fogColor: THREE.Color | null, indoors: boolean): void;
  dispose(): void;
}

export interface SummitLandmarkOptions {
  columns?: number;
  rows?: number;
}

const ROCK = new THREE.Color(0x2b2d34);
const SNOW = new THREE.Color(0xd5dde8);

export function buildSummitLandmark(heightAt: (x: number, z: number) => number, opts: SummitLandmarkOptions = {}): SummitLandmark {
  const cols = opts.columns ?? SUMMIT_COLUMNS;
  const rows = opts.rows ?? SUMMIT_ROWS;
  const { minX, maxX, minZ, maxZ } = SUMMIT_AREA;
  const sx = (maxX - minX) / cols;
  const sz = (maxZ - minZ) / rows;
  const nx = cols + 1;
  const nz = rows + 1;
  // Grid vertices, then a skirt ring down to SKIRT_Y so no side of the mesh shows its edge.
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let top = -Infinity;
      for (let b = 0; b < CELL_SAMPLES; b++) {
        for (let a = 0; a < CELL_SAMPLES; a++) {
          const x = minX + (i + (a + 0.5) / CELL_SAMPLES - 0.5) * sx;
          const z = minZ + (j + (b + 0.5) / CELL_SAMPLES - 0.5) * sz;
          top = Math.max(top, heightAt(Math.min(Math.max(x, minX), maxX), Math.min(Math.max(z, minZ), maxZ)));
        }
      }
      heights[j * nx + i] = Math.max(top, SKIRT_Y);
    }
  }
  const skirt: number[] = [];
  for (let i = 0; i < nx; i++) skirt.push(i, (nz - 1) * nx + i);
  for (let j = 1; j < nz - 1; j++) skirt.push(j * nx, j * nx + nx - 1);
  const gridCount = nx * nz;
  const pos = new Float32Array((gridCount + skirt.length) * 3);
  const base = new Float32Array(pos.length);
  const ink = new THREE.Color();
  const put = (v: number, x: number, h: number, z: number, snowy: boolean): void => {
    pos[v * 3] = x - SUMMIT_CENTRE.x;
    pos[v * 3 + 1] = h;
    pos[v * 3 + 2] = z - SUMMIT_CENTRE.z;
    ink.copy(ROCK).lerp(SNOW, snowy ? Math.min(Math.max((h - 400) / 80, 0), 1) : 0);
    base.set([ink.r, ink.g, ink.b], v * 3);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) put(j * nx + i, minX + i * sx, heights[j * nx + i], minZ + j * sz, true);
  skirt.forEach((g, k) => put(gridCount + k, minX + (g % nx) * sx, SKIRT_Y, minZ + Math.floor(g / nx) * sz, false));
  const idx: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  // Skirt quads: each border vertex to its skirt copy, both ways round the ring (double-sided material).
  const ring = [...Array(nx).keys()].map((i) => i);
  const border: number[] = [
    ...ring,
    ...Array.from({ length: nz - 1 }, (_, j) => (j + 1) * nx + cols),
    ...ring.map((i) => (nz - 1) * nx + (cols - i)).slice(1),
    ...Array.from({ length: nz - 2 }, (_, j) => (nz - 2 - j) * nx),
  ];
  const copyOf = new Map<number, number>();
  skirt.forEach((g, k) => copyOf.set(g, gridCount + k));
  for (let k = 0; k < border.length; k++) {
    const a = border[k];
    const b = border[(k + 1) % border.length];
    const ca = copyOf.get(a)!;
    const cb = copyOf.get(b)!;
    idx.push(a, b, ca, b, cb, ca);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(base), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const radius = geo.boundingSphere?.radius ?? 3000;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'summit-silhouette';
  // The group moves with the camera and scales: never cull on stale bounds.
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = SUMMIT_LANDMARK_ID;
  group.add(mesh);
  group.visible = false;

  const colors = geo.getAttribute('color') as THREE.BufferAttribute;
  let lastKey = '';
  const tmp = new THREE.Color();
  return {
    object: group,
    update(cam, far, fog, indoors) {
      const dx = SUMMIT_CENTRE.x - cam.x;
      const dz = SUMMIT_CENTRE.z - cam.z;
      const near = Math.hypot(dx, dz) < HIDE_FAR_FRACTION * far;
      group.visible = !indoors && !near && far > 0;
      if (!group.visible) return;
      const p = summitPlacement(cam, far, radius);
      group.position.set(p.x, p.y, p.z);
      group.scale.setScalar(p.scale);
      const haze = fog ? hazeFor(p.distance) : 0;
      // Recolour only when the haze (to 0.5%) or the fog colour changes.
      const key = fog ? `${Math.round(haze * 200)}:${fog.getHex()}` : '';
      if (fog && key !== lastKey) {
        lastKey = key;
        for (let v = 0; v < colors.count; v++) {
          tmp.setRGB(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]).lerp(fog, haze);
          colors.setXYZ(v, tmp.r, tmp.g, tmp.b);
        }
        colors.needsUpdate = true;
      }
    },
    dispose() {
      group.removeFromParent();
      geo.dispose();
      material.dispose();
    },
  };
}
