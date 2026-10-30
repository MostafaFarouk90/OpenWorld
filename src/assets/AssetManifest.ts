// Central registry of the CC0 asset packs and the individual files the game loads.
import { TOWN_BODY_IDS, type TownBodyId } from '../npcs/types';

/** Identifier of a third-party asset pack (also its folder name under public/assets/). */
export type AssetPackId =
  | 'kaykit-adventurers'
  | 'kaykit-medieval-builder'
  | 'quaternius-medieval-village'
  | 'quaternius-fantasy-props'
  | 'kaykit-medieval-hexagon'
  | 'kaykit-dungeon-remastered'
  | 'kaykit-halloween'
  | 'kaykit-furniture'
  | 'quaternius-farm-animals'
  | 'embers-townsfolk';

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

/** Metadata and provenance for each pack: CC0 1.0 third-party packs, plus the project's own generated art ('project'). */
export const ASSET_PACKS: Record<
  AssetPackId,
  { name: string; author: string; license: 'CC0-1.0' | 'project'; source: string; folder: string }
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
  'kaykit-medieval-hexagon': {
    name: 'KayKit Medieval Hexagon Pack',
    author: 'Kay Lousberg',
    license: 'CC0-1.0',
    source: 'https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0',
    folder: 'assets/kaykit-medieval-hexagon/',
  },
  'kaykit-dungeon-remastered': {
    name: 'KayKit Dungeon Remastered',
    author: 'Kay Lousberg',
    license: 'CC0-1.0',
    source: 'https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0',
    folder: 'assets/kaykit-dungeon-remastered/',
  },
  'kaykit-halloween': {
    name: 'KayKit Halloween Bits',
    author: 'Kay Lousberg',
    license: 'CC0-1.0',
    source: 'https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0',
    folder: 'assets/kaykit-halloween/',
  },
  'kaykit-furniture': {
    name: 'KayKit Furniture Bits',
    author: 'Kay Lousberg',
    license: 'CC0-1.0',
    source: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0',
    folder: 'assets/kaykit-furniture/',
  },
  'quaternius-farm-animals': {
    name: 'Quaternius Farm Animals',
    author: 'Quaternius',
    license: 'CC0-1.0',
    source: 'https://quaternius.com',
    folder: 'assets/quaternius-farm-animals/',
  },
  'embers-townsfolk': {
    name: 'Embers generated townsfolk',
    author: 'Mostafa (GLB-Viewer character generator, townsfolk game set)',
    license: 'project',
    // Archetype and seed per file: tools/townsfolk/bodies.mjs; re-export with tools/townsfolk/export.mjs.
    source: 'https://github.com/MostafaFarouk90/GLB-Viewer',
    folder: 'assets/embers-townsfolk/',
  },
};

const BASE = import.meta.env.BASE_URL;

/** One character entry per generated townsfolk body, at assets/embers-townsfolk/<id>.glb. */
function townBodyAssets(): Record<TownBodyId, AssetEntry> {
  return Object.fromEntries(
    TOWN_BODY_IDS.map((id) => [id, { id, url: `${BASE}assets/embers-townsfolk/${id}.glb`, pack: 'embers-townsfolk', kind: 'character' }]),
  ) as Record<TownBodyId, AssetEntry>;
}

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
  ...townBodyAssets(),
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
