// Patch rows (Dead Road corridor D1 to D3): one placement row stands for a clump of 6 to 14 ground tufts. The corridor needs about
// 200k tufts; as one JSON row each they would be 15 MB, so the file keeps one row per clump and PlacementField expands it at load.
// Deterministic: the tufts depend only on the row's x, z and size (never on its index or on load order), so the same clump comes out the
// same every time and a tile's file can be reordered or thinned without changing any other clump.
import type { PlacementRow } from './PlacementField';

/** [model id, weight, scale] per palette entry; weights sum to 1. */
type Palette = ReadonlyArray<readonly [string, number, number]>;

/**
 * Palettes by patch id. A patch row's id is one of these keys; the tufts take the ids below (ferns are bush class, the rest ground
 * class, so each tuft follows its own class range and quality step). A glb uploaded under a patch id later replaces the expansion.
 */
export const PATCHES: Readonly<Record<string, Palette>> = {
  // The grey reach (D1): ash clumps, straw and brown bracken.
  'grass-patch-ash': [['grass-clump-ash', 0.58, 1.25], ['grass-clump-dry', 0.2, 1.15], ['fern-ash', 0.22, 0.66]],
  // The thaw (D1/D2): straw grass with ash and bracken.
  'grass-patch-dry': [['grass-clump-dry', 0.6, 1.25], ['grass-clump-ash', 0.2, 1.2], ['fern-ash', 0.2, 0.62]],
  // The heath (D2): straw, a little green, purple and yellow flowers, bracken.
  'grass-patch-heath': [
    ['grass-clump-dry', 0.45, 1.25], ['grass-clump-a', 0.06, 1.25], ['grass-clump-b', 0.06, 1.25], ['grass-clump-c', 0.05, 1.25],
    ['flower-patch-purple', 0.13, 0.7], ['flower-patch-yellow', 0.05, 0.7], ['fern-a', 0.2, 0.62],
  ],
  // The farm-ring and the green verges (D2/D3): meadow clumps, ferns, four colours of flowers.
  'grass-patch-meadow': [
    ['grass-clump-a', 0.19, 1.25], ['grass-clump-b', 0.18, 1.25], ['grass-clump-c', 0.18, 1.25], ['fern-a', 0.17, 0.62],
    ['flower-patch-yellow', 0.07, 0.7], ['flower-patch-white', 0.07, 0.7], ['flower-patch-purple', 0.07, 0.7], ['flower-patch-red', 0.07, 0.7],
  ],
};

/** Fewest and most tufts a patch row expands to. */
export const PATCH_MIN = 6;
export const PATCH_MAX = 14;
/** Spread radius (m) of a patch of size 1: the tufts lie inside a disc of this radius times the row's scale. */
export const PATCH_RADIUS = 0.8;

export const isPatch = (id: string): boolean => Object.prototype.hasOwnProperty.call(PATCHES, id);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tufts in a patch of this size: 5 + 4 x size, clamped to 6..14 (a row may override it with `n`, 1 or more). */
export function patchCount(row: PlacementRow): number {
  if (row.n !== undefined) return Math.max(1, Math.floor(row.n));
  return Math.min(PATCH_MAX, Math.max(PATCH_MIN, Math.round(5 + 4 * (row.scale ?? 1))));
}

/** Spread radius of a patch row in metres (a row may set `spread`). */
export function patchRadius(row: PlacementRow): number {
  return row.spread ?? PATCH_RADIUS * (row.scale ?? 1);
}

/**
 * The tufts of one patch row. A single-tuft patch (`n` 1) sits on the row's own point. Per tuft the generator draws, in this order:
 * angle, distance (square root, so the disc fills evenly), palette pick, yaw, size (0.85 to 1.15 of the palette scale).
 */
export function expandPatch(row: PlacementRow): PlacementRow[] {
  const pal = PATCHES[row.id];
  if (!pal) return [row];
  const rnd = mulberry32(((Math.round(row.x * 100) * 73856093) ^ (Math.round(row.z * 100) * 19349663)) >>> 0);
  const n = patchCount(row);
  const radius = patchRadius(row);
  const out: PlacementRow[] = [];
  for (let i = 0; i < n; i++) {
    const angle = 2 * Math.PI * rnd();
    const dist = Math.sqrt(rnd()) * radius;
    const u = rnd();
    let acc = 0;
    let pick = pal[pal.length - 1]!;
    for (const p of pal) {
      acc += p[1];
      if (u < acc) {
        pick = p;
        break;
      }
    }
    const yaw = 360 * rnd();
    const size = pick[2] * (0.85 + 0.3 * rnd());
    // One tuft is the patch itself: no offset, so a lone tuft stands where the row says.
    out.push({ id: pick[0], x: n === 1 ? row.x : row.x + Math.cos(angle) * dist, z: n === 1 ? row.z : row.z + Math.sin(angle) * dist, yaw, scale: size });
  }
  return out;
}

/** Replaces every patch row by its tufts; other rows pass through. */
export function expandPatches(rows: readonly PlacementRow[]): PlacementRow[] {
  if (!rows.some((r) => isPatch(r.id))) return rows as PlacementRow[];
  const out: PlacementRow[] = [];
  for (const r of rows) {
    if (isPatch(r.id)) for (const t of expandPatch(r)) out.push(t);
    else out.push(r);
  }
  return out;
}
