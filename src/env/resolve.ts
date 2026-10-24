// Which model draws an environment placement id. Order (Mostafa, 2026-10-22: use what exists in the object grids, placeholders only
// where nothing matches): a runtime copy under public/assets/env, then a variant of one (tinted or rescaled), then a KayKit model
// from the imported packs, then a scripted placeholder. A later glb dropped under the same id replaces the placeholder or the
// variant without touching a single placement.
import manifest from '../../public/assets/env/manifest.json';
import { SWAP_FIT } from '../assets/swap/swapModels';

/** Colour change applied to a model's base colour in the shader (a hue rotation, a saturation scale and a multiply). */
export interface Tint {
  /** Degrees of hue rotation (yellow flowers to purple is about +235). */
  hue?: number;
  /** Saturation multiplier, 1 = unchanged. */
  sat?: number;
  /** Per-channel multiply as 0xRRGGBB, white = unchanged. */
  mul?: number;
}

export type ModelRef =
  | { source: 'env' | 'kaykit'; model: string; scale: number; tint?: Tint; fitHeight?: number; stretchY?: number; /** Width factor on x and z only (a slim poplar from a birch). */ girth?: number }
  | { source: 'placeholder'; shape: PlaceholderShape };

export type PlaceholderShape = 'tree' | 'bush' | 'grass' | 'flower' | 'rock' | 'box' | 'haystack' | 'post' | 'patch';

/** Ids that are another id with a different size or colour. `stretchY` scales the height only (reeds from a grass clump); `girth` x and z only. */
const VARIANTS: Readonly<Record<string, { base: string; scale: number; tint?: Tint; stretchY?: number; girth?: number }>> = {
  // B2: slim windbreak tree from the birch (target 14 m tall, 2.5 m wide) until the poplar glb arrives; cairn from the rock cluster.
  'poplar-a': { base: 'birch-a', scale: 1.75, girth: 0.62, tint: { mul: 0xd2e89a } },
  'cairn-a': { base: 'rock-cluster-a', scale: 0.5 },
  'oak-b': { base: 'oak-a', scale: 0.85, tint: { mul: 0xe0eac8 } },
  'oak-c': { base: 'oak-a', scale: 1.12, tint: { mul: 0xf2e8c4, sat: 0.9 } },
  'birch-b': { base: 'birch-a', scale: 0.88, tint: { mul: 0xeef2dc } },
  'bush-round-b': { base: 'bush-round-a', scale: 0.88, tint: { hue: -12, mul: 0xe8f0d0 } },
  'bush-flowering-b': { base: 'bush-flowering-a', scale: 0.92, tint: { hue: 25 } },
  'boulder-large-b': { base: 'boulder-large-a', scale: 0.78 },
  'stump-b': { base: 'stump-a', scale: 0.85 },
  'grass-clump-b': { base: 'grass-clump-a', scale: 0.82, tint: { hue: -8 } },
  'grass-clump-c': { base: 'grass-clump-a', scale: 1.18, tint: { hue: 10, mul: 0xf0f0d8 } },
  'flower-patch-white': { base: 'flower-patch-yellow', scale: 1, tint: { sat: 0.12, mul: 0xffffff } },
  'flower-patch-purple': { base: 'flower-patch-yellow', scale: 1, tint: { hue: 235 } },
  'flower-patch-red': { base: 'flower-patch-yellow', scale: 1, tint: { hue: -48 } },
  // B3 (Hollin Ford): holly on the brook banks and weeping willows, until Mostafa's files exist (plans/env-pass/b3/missing-objects.md).
  'bush-holly-a': { base: 'bush-round-a', scale: 1.05, tint: { hue: 14, sat: 0.95, mul: 0x6f9a6a } },
  // A squat, pale elm: 6.9 m wide and 8 m tall like the willow target. The drooping silhouette is a visual gap until a file arrives.
  'willow-a': { base: 'elm-or-ash-a', scale: 1.15, stretchY: 0.7, tint: { hue: 24, sat: 0.9, mul: 0xc8dcaa } },
  // Reed clumps: the grass clump stretched to 1.75 m and drained toward olive (was the green cone placeholder).
  'reeds-a': { base: 'grass-clump-a', scale: 1.4, stretchY: 2.5, tint: { hue: -25, sat: 0.85, mul: 0xe6dcb0 } },
  'reeds-b': { base: 'grass-clump-a', scale: 1.2, stretchY: 3.0, tint: { hue: -35, sat: 0.7, mul: 0xd8d0a8 } },
  // B4 (the ash reach): the same silhouettes in a drained palette (plans/env-pass/b4/missing-objects.md).
  'oak-ash-a': { base: 'oak-a', scale: 0.95, tint: { sat: 0.3, mul: 0xc9c2b2 } },
  'bush-round-ash': { base: 'bush-round-a', scale: 1, tint: { sat: 0.25, mul: 0xb8b0a0 } },
  'grass-clump-ash': { base: 'grass-clump-a', scale: 0.95, tint: { sat: 0.2, mul: 0xc8c0a8 } },
};

/** Ids the imported KayKit packs already cover, from the object grids. `fitHeight` sizes the model to a height in metres. */
const KAYKIT: Readonly<Record<string, { model: string; scale?: number; fitHeight?: number }>> = {
  barrel: { model: 'hex/barrel' },
  crate_A_small: { model: 'hex/crate_A_small' },
  sack: { model: 'hex/sack' },
  bucket_empty: { model: 'hex/bucket_empty' },
  wheelbarrow: { model: 'hex/wheelbarrow' },
  resource_lumber: { model: 'hex/resource_lumber' },
  post_lantern: { model: 'hal/post_lantern' },
  'woodpile-chop': { model: 'hex/resource_lumber' },
  'garden-bed-a': { model: 'hex/crate_open', scale: 1.5 },
  'garden-bed-b': { model: 'hex/crate_open', scale: 1.5 },
  'picket-fence': { model: 'hex/fence_wood_straight', fitHeight: 1.1 },
  'wattle-fence': { model: 'hex/fence_wood_straight', fitHeight: 1.2 },
  'stonewall-low': { model: 'hex/fence_stone_straight', fitHeight: 1.0 },
  // The enclosure's low lane-gate wings: KayKit only, so a manifest model with the id 'stonewall-low' never changes their module length.
  'stonewall-wing': { model: 'hex/fence_stone_straight', fitHeight: 1.0 },
  // Village boundary wall: the same piece fitted to 1.5 m so it reads as a wall at the Knight's scale (1.8 m).
  'stonewall-high': { model: 'hex/fence_stone_straight', fitHeight: 1.5 },
  'scorched-fence': { model: 'hex/fence_wood_straight', fitHeight: 1.6 },
  'rock-single-a': { model: 'hex/rock_single_A' },
  tent: { model: 'hex/tent' },
  // The ash reach's dead trees: KayKit's are 3 to 4 m in the grid, fitted to the 8 m and 7 m of the targets.
  'ash-tree-dead-a': { model: 'hal/tree_dead_large', fitHeight: 8 },
  'ash-tree-dead-b': { model: 'hal/tree_dead_medium', fitHeight: 7 },
  // B3 road dressing: a candle shrine for the wayside shrine, a rounded headstone shape for the milestones (interim, by id).
  'roadside-shrine-a': { model: 'hal/shrine_candles', fitHeight: 1.6 },
  'milestone-a': { model: 'hal/fence_pillar', fitHeight: 1.1 },
};

const SHAPES: ReadonlyArray<[RegExp, PlaceholderShape]> = [
  [/^(oak|birch|elm|autumn|ash-tree|willow)/, 'tree'],
  [/^bush|^hedge|^fern|^reeds/, 'bush'],
  [/^grass/, 'grass'],
  [/^flower|^mushroom/, 'flower'],
  [/^(boulder|rock|basalt|ember-rock|slag)/, 'rock'],
  [/^(haystack|haybale)/, 'haystack'],
  [/^(signpost|milestone|gibbet|crow-perch|smelter)/, 'post'],
  [/^(stump|log|charred)/, 'patch'],
];

const ENV_IDS: ReadonlySet<string> = new Set(Object.keys(manifest.objects));

/** Colour of a tree, bush or clump on the grey east edge: drained toward ash, a little darker. Applies to ids with the suffix `-ashen`. */
export const ASHEN: Tint = { sat: 0.15, mul: 0x8f8b85 };

export function resolveModel(id: string): ModelRef {
  if (id.endsWith('-ashen')) {
    const base = resolveModel(id.slice(0, -'-ashen'.length));
    if (base.source === 'placeholder') return base;
    const t = base.tint;
    // Combine with the base's own tint: multiply the colours, keep the base's hue shift, take the lower saturation.
    const mul = t?.mul !== undefined ? mulColour(t.mul, ASHEN.mul!) : ASHEN.mul;
    return { ...base, tint: { hue: t?.hue, sat: Math.min(t?.sat ?? 1, ASHEN.sat!), mul } };
  }
  if (ENV_IDS.has(id)) return { source: 'env', model: `env/${id}`, scale: 1 };
  const v = VARIANTS[id];
  if (v && ENV_IDS.has(v.base)) return { source: 'env', model: `env/${v.base}`, scale: v.scale, tint: v.tint, ...(v.stretchY ? { stretchY: v.stretchY } : {}), girth: v.girth };
  const k = KAYKIT[id] ?? (SWAP_FIT[`hex/${id}`] ? { model: `hex/${id}` } : SWAP_FIT[`hal/${id}`] ? { model: `hal/${id}` } : undefined);
  if (k) {
    const f = SWAP_FIT[k.model];
    const scale = (f?.scale ?? 1) * (k.scale ?? 1);
    return { source: 'kaykit', model: k.model, scale, fitHeight: k.fitHeight };
  }
  for (const [re, shape] of SHAPES) if (re.test(id)) return { source: 'placeholder', shape };
  return { source: 'placeholder', shape: 'box' };
}

/** Row-major 3x3 that rotates the colour hue by `degrees` (the W3C hue-rotate matrix) and scales saturation by `sat`. */
export function hueMatrix(degrees: number, sat = 1): number[] {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const h = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  const luma = [0.213, 0.715, 0.072];
  const out: number[] = [];
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) out.push(luma[col] * (1 - sat) + h[r * 3 + col] * sat);
  return out;
}

function mulColour(a: number, b: number): number {
  const ch = (sh: number): number => Math.round((((a >> sh) & 255) * ((b >> sh) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
