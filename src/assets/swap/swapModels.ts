// Every imported model as a manifest entry, generated from public/assets/fit.json (the importer's list), so the asset swap
// never names a file that is not in provenance. Ids drop the pack folder and extension: `hex/building_home_A_red`,
// `dun/wall`, `hal/crypt`, `fur/table_small`, `wpn/axe_2handed`, `horse`.
import fit from '../../../public/assets/fit.json';
import type { AssetEntry, AssetKind, AssetPackId } from '../AssetManifest';

interface PackRoute {
  prefix: string;
  folder: string;
  pack: AssetPackId;
  tag: string;
}

const ROUTES: readonly PackRoute[] = [
  { prefix: 'kaykit-medieval-hexagon/', folder: 'kaykit-medieval-hexagon/', pack: 'kaykit-medieval-hexagon', tag: 'hex/' },
  { prefix: 'kaykit-dungeon-remastered/', folder: 'kaykit-dungeon-remastered/', pack: 'kaykit-dungeon-remastered', tag: 'dun/' },
  { prefix: 'kaykit-halloween/', folder: 'kaykit-halloween/', pack: 'kaykit-halloween', tag: 'hal/' },
  { prefix: 'kaykit-furniture/', folder: 'kaykit-furniture/', pack: 'kaykit-furniture', tag: 'fur/' },
  { prefix: 'kaykit-adventurers/weapons/', folder: 'kaykit-adventurers/', pack: 'kaykit-adventurers', tag: 'wpn/' },
  { prefix: 'quaternius-farm-animals/Horse', folder: 'quaternius-farm-animals/', pack: 'quaternius-farm-animals', tag: 'horse' },
];

const KINDS: Record<string, AssetKind> = { weapon: 'weapon', structure: 'structure', prop: 'prop', character: 'character' };

export interface SwapModelFit {
  kind: string;
  scale: number;
  yawDeg: number;
  yOffset: number;
}

/** Model id for an imported file path relative to `assets/`, or null when the path belongs to no swap pack. */
export function swapIdOf(relPath: string): string | null {
  for (const r of ROUTES) {
    if (!relPath.startsWith(r.prefix)) continue;
    if (r.tag === 'horse') return 'horse';
    return r.tag + relPath.slice(r.prefix.length).replace(/(\.gltf)?\.(gltf|glb)$/, '');
  }
  return null;
}

function build(): { assets: Record<string, AssetEntry>; fits: Record<string, SwapModelFit> } {
  const assets: Record<string, AssetEntry> = {};
  const fits: Record<string, SwapModelFit> = {};
  const base = import.meta.env.BASE_URL;
  for (const [rel, f] of Object.entries(fit.models as Record<string, SwapModelFit>)) {
    const id = swapIdOf(rel);
    const route = ROUTES.find((r) => rel.startsWith(r.prefix));
    if (!id || !route) continue;
    assets[id] = { id, url: `${base}assets/${rel}`, pack: route.pack, kind: KINDS[f.kind] ?? 'prop' };
    fits[id] = f;
  }
  return { assets, fits };
}

const built = build();

/** Manifest entries of every imported swap model (merged into the loader's default manifest). */
export const SWAP_ASSETS: Readonly<Record<string, AssetEntry>> = built.assets;
/** The importer's per-model fit (game scale factor, yaw, y offset) keyed by swap id. */
export const SWAP_FIT: Readonly<Record<string, SwapModelFit>> = built.fits;
