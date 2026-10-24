// Fits Dungeon models to the mine prop boxes without distorting them: a prop is tiled with repeated instances until every axis
// scale is within MAX_ASPECT of the others, and a prop no model fits keeps its greybox. Where the visible models would leave
// much of the collider footprint empty, the caller lays a thin dirt base. Pure maths over template bounds and geometry.
import * as THREE from 'three';
import type { ModelTemplate } from '../assets/swap/ModelLibrary';
import type { SolidBox } from './layout';

/** Largest allowed ratio between a dressed prop's biggest and smallest axis scale. */
export const MAX_ASPECT = 1.65;
/** Smallest share of a prop's collider footprint its visible model must cover (above COVER_HEIGHT of the box height). */
export const MIN_COVERAGE = 0.8;
export const COVER_HEIGHT = 0.4;
/** Rubble and collapse piles are drawn this much wider than the box in x and z: low, ragged edges that hide the bare footprint. */
export const RUBBLE_GROW = 1.15;
const GRID = 16;
const MAX_ALONG = 8;
const MAX_INSTANCES = 8;
/** Aspect ratio under which a fit is accepted as is, preferring fewer instances over a marginally rounder one. */
const GOOD_ASPECT = 1.4;

export interface PropPlacement {
  template: ModelTemplate;
  /** Box-space centre of the instance footprint. */
  x: number;
  z: number;
  /** Scale along the model's own axes, and whether the model is turned a quarter. */
  sx: number;
  sy: number;
  sz: number;
  turn: boolean;
}

export interface PropPlan {
  placements: PropPlacement[];
  /** Share of the box footprint covered by model geometry above COVER_HEIGHT; under MIN_COVERAGE the caller adds a dirt base. */
  coverage: number;
  aspect: number;
}

const heightGrids = new WeakMap<ModelTemplate, Float32Array>();

/** Top surface height above the model's base for a GRID x GRID raster of its footprint (0 where nothing stands). */
export function heightGrid(t: ModelTemplate): Float32Array {
  const cached = heightGrids.get(t);
  if (cached) return cached;
  const grid = new Float32Array(GRID * GRID);
  const { min, max } = t.bounds;
  const w = max.x - min.x;
  const d = max.z - min.z;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mark = (p: THREE.Vector3) => {
    const i = Math.min(GRID - 1, Math.max(0, Math.floor(((p.x - min.x) / w) * GRID)));
    const j = Math.min(GRID - 1, Math.max(0, Math.floor(((p.z - min.z) / d) * GRID)));
    const y = p.y - min.y;
    if (y > grid[i * GRID + j]) grid[i * GRID + j] = y;
  };
  const p = new THREE.Vector3();
  for (const part of t.parts) {
    const pos = part.geometry.getAttribute('position');
    const index = part.geometry.getIndex();
    const count = index ? index.count : pos.count;
    for (let k = 0; k + 2 < count; k += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(k) : k);
      b.fromBufferAttribute(pos, index ? index.getX(k + 1) : k + 1);
      c.fromBufferAttribute(pos, index ? index.getX(k + 2) : k + 2);
      const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const steps = Math.min(48, Math.max(1, Math.ceil(edge / (Math.min(w, d) / GRID / 2))));
      for (let u = 0; u <= steps; u++) {
        for (let v = 0; v <= steps - u; v++) {
          const s = u / steps;
          const r = v / steps;
          p.set(a.x * (1 - s - r) + b.x * s + c.x * r, a.y * (1 - s - r) + b.y * s + c.y * r, a.z * (1 - s - r) + b.z * s + c.z * r);
          mark(p);
        }
      }
    }
  }
  heightGrids.set(t, grid);
  return grid;
}

const size = (t: ModelTemplate) => ({ x: t.bounds.max.x - t.bounds.min.x, y: t.bounds.max.y - t.bounds.min.y, z: t.bounds.max.z - t.bounds.min.z });

/**
 * Tiles the best of `models` over `box`: the instance count along each box axis and the quarter turn that keep the three axis
 * scales closest to uniform (fewest instances on a tie). Null when no model gets within MAX_ASPECT, so the box stays.
 */
export function planProp(box: SolidBox, models: readonly ModelTemplate[], grow = 1): PropPlan | null {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  let best: { t: ModelTemplate; n: number; m: number; turn: boolean; aspect: number } | null = null;
  for (const t of models) {
    const r = size(t);
    for (const turn of [false, true]) {
      for (let n = 1; n <= MAX_ALONG; n++) {
        for (let m = 1; m <= MAX_ALONG && n * m <= MAX_INSTANCES; m++) {
          const cw = sx / n;
          const cd = sz / m;
          const scales = [((turn ? cd : cw) / r.x) * grow, sy / r.y, ((turn ? cw : cd) / r.z) * grow];
          const aspect = Math.max(...scales) / Math.min(...scales);
          // Within GOOD_ASPECT the fewest instances win; beyond it the closest to uniform does.
          const rank = (a: number, k: number) => (a <= GOOD_ASPECT ? k : 100 + a);
          const better = !best || rank(aspect, n * m) < rank(best.aspect, best.n * best.m) - 1e-6 || (rank(aspect, n * m) === rank(best.aspect, best.n * best.m) && aspect < best.aspect - 1e-6);
          if (better) best = { t, n, m, turn, aspect };
        }
      }
    }
  }
  if (!best || best.aspect > MAX_ASPECT) return null;
  const { t, n, m, turn } = best;
  const r = size(t);
  const cw = sx / n;
  const cd = sz / m;
  const scale = { sx: ((turn ? cd : cw) / r.x) * grow, sy: sy / r.y, sz: ((turn ? cw : cd) / r.z) * grow };
  const placements: PropPlacement[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) placements.push({ template: t, x: box.min.x + cw * (i + 0.5), z: box.min.z + cd * (j + 0.5), turn, ...scale });
  }
  // Coverage: model raster cells standing above COVER_HEIGHT of the box height, as a share of the footprint.
  const grid = heightGrid(t);
  let covered = 0;
  for (const h of grid) if (h * scale.sy >= COVER_HEIGHT * sy) covered++;
  // The tiles partition the footprint exactly; growing them past the box covers that much more of it (up to all of it).
  const coverage = Math.min(1, (covered / grid.length) * grow * grow);
  return { placements, coverage, aspect: best.aspect };
}
