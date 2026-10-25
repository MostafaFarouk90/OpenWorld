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
  /** Emissive colour of ground cover (default a meadow green); the ash tufts use a grey so they do not glow green. */
  glow?: number;
}

export type ModelRef =
  | { source: 'env' | 'kaykit'; model: string; scale: number; tint?: Tint; fitHeight?: number; stretchY?: number; /** Width factor on x and z only (a slim poplar from a birch). */ girth?: number }
  | { source: 'placeholder'; shape: PlaceholderShape };

export type PlaceholderShape = 'horse' | 'tent' | 'tree' | 'bush' | 'grass' | 'flower' | 'rock' | 'box' | 'haystack' | 'post' | 'patch';

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
  // Reed clumps: the grass clump stretched to 1.3 to 1.4 m and widened (girth) to 0.85 to 0.9 m (the glb clump is 0.454 wide, 0.5 tall) so a bed reads as a bed, not stalks; reeds-a is fresh green, reeds-b the dry brown mixed in.
  'reeds-a': { base: 'grass-clump-a', scale: 1, stretchY: 2.6, girth: 1.9, tint: { hue: 10, sat: 0.9, mul: 0xd2e6a0 } },
  'reeds-b': { base: 'grass-clump-a', scale: 1, stretchY: 2.8, girth: 2.0, tint: { hue: -35, sat: 0.7, mul: 0xd8d0a8 } },
  // B4: the ash reach (design 5.1), the same silhouettes in a drained palette.
  'oak-ash-a': { base: 'oak-a', scale: 0.95, tint: { sat: 0.35, mul: 0xf4efe4 } },
  // Ash scrub: nearly no green left (at sat 0.3 it still read as a dark-green bush beside the gate, round-5 review).
  'bush-round-ash': { base: 'bush-round-a', scale: 1, tint: { sat: 0.08, mul: 0xccc4b6 } },
  'grass-clump-ash': { base: 'grass-clump-a', scale: 0.95, tint: { sat: 0, mul: 0xc4bcaa, glow: 0x3a3832 } },
  // D1 to D3 (the Dead Road corridor): the ghost-field hedge, bracken gone grey, straw grass, heath and gorse, orchard, holly.
  'hedge-dead-a': { base: 'hedge-straight', scale: 0.85, girth: 0.7, tint: { sat: 0.2, mul: 0xd0c4b0 } },
  'fern-ash': { base: 'fern-a', scale: 1, tint: { sat: 0.12, mul: 0xd8ccb2 } },
  // Straw: the step between ash grey and meadow green. Its glow is a warm brown so a dry clump does not light up green.
  'grass-clump-dry': { base: 'grass-clump-a', scale: 1.05, tint: { hue: 18, sat: 0.45, mul: 0xe6d2a0, glow: 0x4a4020 } },
  'bush-gorse': { base: 'bush-flowering-a', scale: 0.8, tint: { hue: 35, sat: 0.9, mul: 0xd8d070 } },
  'bush-heather': { base: 'bush-round-a', scale: 0.55, girth: 1.4, tint: { hue: 250, sat: 0.55, mul: 0xb090a0 } },
  'apple-tree-a': { base: 'oak-a', scale: 0.5, tint: { hue: 12, mul: 0xe8f0c8 } },
  'wagon-wreck-a': { base: 'haycart-a', scale: 1, tint: { sat: 0.5, mul: 0x8a7a68 } },
  'wagon-burnt': { base: 'haycart-a', scale: 1, tint: { sat: 0.2, mul: 0x3a342e } },
  'charred-stump': { base: 'stump-a', scale: 1, tint: { sat: 0.3, mul: 0x4a423a } },
  'basalt-columns-a': { base: 'boulder-large-a', scale: 1.3, girth: 0.35, tint: { sat: 0.4, mul: 0xb8b8c4 } },
  // H1: South Gate and outer ward. Stand-ins until the glbs arrive (plans/env-pass/h1/missing-objects.md): the fruit trees are small oaks
  // (blossom pink for -b), the cart is the hay cart at goods-wagon size, the camp fire ring is a low rock cluster.
  'fruit-tree-a': { base: 'oak-a', scale: 0.42, tint: { mul: 0xd8f0b0 } },
  // Blossom: the paler birch crown turned pink (the oak's dark leaves went maroon at hue 300).
  'fruit-tree-b': { base: 'birch-a', scale: 0.78, girth: 1.8, tint: { hue: 228, sat: 0.7, mul: 0xffffff } },
  'cart-goods-a': { base: 'haycart-a', scale: 1.2, tint: { sat: 0.8, mul: 0xe8dcc8 } },
  // H1 yard litter: straw-coloured tufts for the packed-earth yards (a yellow-brown glow so they do not read meadow green on tan ground).
  'grass-clump-straw': { base: 'grass-clump-a', scale: 0.9, tint: { hue: -32, sat: 0.6, mul: 0xe8dcae, glow: 0x4a4426 } },
  'campfire-ring': { base: 'rock-cluster-a', scale: 0.6, tint: { sat: 0.5, mul: 0x9a9690 } },
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
  // B4: roadside crow post (a plain pillar; the rail beside it is a fence_broken row).
  'crow-perch-post': { model: 'hal/fence_pillar' },
  tent: { model: 'hex/tent' },
  // The KayKit dead trees stand in for the ash-tree-dead ids (shared with B2: the mid one is a, the taller one b).
  'ash-tree-dead-a': { model: 'hal/tree_dead_medium', fitHeight: 6.5 },
  'ash-tree-dead-b': { model: 'hal/tree_dead_large', fitHeight: 7.5 },
  // B3 road dressing: a candle shrine for the wayside shrine, a rounded headstone shape for the milestones (interim, by id).
  'roadside-shrine-a': { model: 'hal/shrine_candles', fitHeight: 1.6 },
  'milestone-a': { model: 'hal/fence_pillar', fitHeight: 1.1 },
  // D1 to D3 placeholders under their agreed ids: the empty gibbet on the D1 crest (a tall post, the arm is a fence_broken row) and the wayside shrines.
  // D3 field gates (the hedge gaps): two gateposts and a closed leaf.
  'gatepost-a': { model: 'hal/fence_pillar', fitHeight: 1.6 },
  'field-gate-a': { model: 'hex/fence_wood_straight', fitHeight: 1.2 },
  'gibbet-post': { model: 'hal/fence_pillar', fitHeight: 3.6 },
  // H1: the repair yard's rubble, the dungeon pack's half pile.
  rubble_half: { model: 'dun/rubble_half' },
  // H1 stand-ins: a refugee's handcart is the wheelbarrow made bigger, the notice board a tall post, the goods basket a sack, the stable
  // horse stays a scripted placeholder (the Quaternius horse is skinned and the instancer takes static meshes only).
  'handcart-a': { model: 'hex/wheelbarrow', scale: 1.6 },
  'notice-board-a': { model: 'hal/fence_pillar', fitHeight: 2.2 },
  'basket-goods-a': { model: 'hex/sack', scale: 0.8 },
};

const SHAPES: ReadonlyArray<[RegExp, PlaceholderShape]> = [
  // The KayKit tent is a canopy on four legs (B3 review), so H1's refugee tent is a scripted A-frame under its agreed id.
  [/^refugee-tent/, 'tent'],
  [/^horse/, 'horse'],
  [/^(oak|birch|elm|autumn|ash-tree|willow|fruit-tree)/, 'tree'],
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
