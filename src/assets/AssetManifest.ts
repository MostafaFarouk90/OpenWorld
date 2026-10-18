// Central registry of the CC0 asset packs and the individual files the game loads.

/** Identifier of a third-party asset pack (also its folder name under public/assets/). */
export type AssetPackId =
  | 'kaykit-adventurers'
  | 'kaykit-medieval-builder'
  | 'quaternius-medieval-village'
  | 'quaternius-fantasy-props';

/** Broad category of an asset, used by gameplay code to decide how to spawn it. */
export type AssetKind = 'character' | 'weapon' | 'prop' | 'structure';

/** One loadable glTF/GLB file. */
export interface AssetEntry {
  id: string;
  url: string;
  pack: AssetPackId;
  kind: AssetKind;
  /** true if the file uses KHR_draco_mesh_compression */
  draco?: boolean;
}

/** Metadata and provenance for each pack. All packs are CC0 1.0. */
export const ASSET_PACKS: Record<
  AssetPackId,
  { name: string; author: string; license: 'CC0-1.0'; source: string; folder: string }
> = {
  'kaykit-adventurers': {
    name: 'KayKit Adventurers',
    author: 'Kay Lousberg',
    license: 'CC0-1.0',
    // Mirror: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
    source: 'https://kaylousberg.itch.io/kaykit-adventurers',
    folder: 'assets/kaykit-adventurers/',
  },
  'kaykit-medieval-builder': {
    name: 'KayKit Medieval Builder Pack',
    author: 'Kay Lousberg',
    license: 'CC0-1.0',
    source: 'https://kaylousberg.itch.io/kaykit-medieval-builder-pack',
    folder: 'assets/kaykit-medieval-builder/',
  },
  'quaternius-medieval-village': {
    name: 'Medieval Village MegaKit',
    author: 'Quaternius',
    license: 'CC0-1.0',
    source: 'https://quaternius.com/packs/medievalvillagemegakit.html',
    folder: 'assets/quaternius-medieval-village/',
  },
  'quaternius-fantasy-props': {
    name: 'Fantasy Props MegaKit',
    author: 'Quaternius',
    license: 'CC0-1.0',
    source: 'https://quaternius.com/packs/fantasypropsmegakit.html',
    folder: 'assets/quaternius-fantasy-props/',
  },
};

const BASE = import.meta.env.BASE_URL;

/** Every asset the game can load. Add new entries here after dropping files under public/assets/. */
export const ASSETS = {
  knight: {
    id: 'knight',
    url: `${BASE}assets/kaykit-adventurers/characters/Knight.glb`,
    pack: 'kaykit-adventurers',
    kind: 'character',
  },
  barbarian: {
    id: 'barbarian',
    url: `${BASE}assets/kaykit-adventurers/characters/Barbarian.glb`,
    pack: 'kaykit-adventurers',
    kind: 'character',
  },
  mage: {
    id: 'mage',
    url: `${BASE}assets/kaykit-adventurers/characters/Mage.glb`,
    pack: 'kaykit-adventurers',
    kind: 'character',
  },
  rogue: {
    id: 'rogue',
    url: `${BASE}assets/kaykit-adventurers/characters/Rogue.glb`,
    pack: 'kaykit-adventurers',
    kind: 'character',
  },
  rogueHooded: {
    id: 'rogueHooded',
    url: `${BASE}assets/kaykit-adventurers/characters/Rogue_Hooded.glb`,
    pack: 'kaykit-adventurers',
    kind: 'character',
  },
  sword: {
    id: 'sword',
    url: `${BASE}assets/kaykit-adventurers/weapons/sword_1handed.gltf`,
    pack: 'kaykit-adventurers',
    kind: 'weapon',
  },
  shieldRound: {
    id: 'shieldRound',
    url: `${BASE}assets/kaykit-adventurers/weapons/shield_round.gltf`,
    pack: 'kaykit-adventurers',
    kind: 'weapon',
  },
} satisfies Record<string, AssetEntry>;

/** Key of an entry in {@link ASSETS}. */
export type AssetId = keyof typeof ASSETS;

const SUPPORTED_EXTENSIONS = ['.glb', '.gltf'];

/** True if `url` points at a glTF/GLB file (query strings and hashes ignored). */
export function isSupportedModelUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0].toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Checks manifest entries for mistakes that would only surface at load time. Returns one
 * message per problem; an empty array means the manifest is valid.
 */
export function validateManifest(
  assets: Record<string, Partial<AssetEntry> | null | undefined>,
  packs: Record<string, unknown> = ASSET_PACKS,
): string[] {
  const errors: string[] = [];
  const seenUrls = new Map<string, string>();
  for (const [key, entry] of Object.entries(assets)) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`${key}: entry is missing`);
      continue;
    }
    if (entry.id !== key) errors.push(`${key}: id "${String(entry.id)}" does not match its key`);
    if (!entry.pack || !(entry.pack in packs)) errors.push(`${key}: unknown pack "${String(entry.pack)}"`);
    if (!entry.kind) errors.push(`${key}: kind is missing`);
    if (typeof entry.url !== 'string' || entry.url.trim() === '') {
      errors.push(`${key}: url is empty`);
      continue;
    }
    if (!isSupportedModelUrl(entry.url)) errors.push(`${key}: unsupported format "${entry.url}" (expected .glb or .gltf)`);
    const other = seenUrls.get(entry.url);
    if (other) errors.push(`${key}: duplicate url, also used by "${other}"`);
    else seenUrls.set(entry.url, key);
  }
  return errors;
}
