// Plain data for the Act 3 point-of-interest library (thread K2). Pieces are built in site-local coordinates (yaw 0 faces -Z,
// +Z is north) and placed by place.ts, as Act 2's are. No THREE and no terrain imports here.
import type { AnchorSpec, StructureSpec } from '../../../region/layoutTypes';
import type { PoiPart } from '../types';

export const A3_TEMPLATES = [
  'drowned-church',
  'stilt-camp',
  'peat-cutting',
  'reed-island',
  'song-stone',
  'hawk-nest',
  'hunter-cairn',
  'frozen-camp',
  'glass-vein',
  'vista',
  'leap-cache',
] as const;
export type A3Template = (typeof A3_TEMPLATES)[number];

/** The ten template points of interest (the road caches are Leap spots, not POIs: design 4.5 counts 22 = 9 + 3 + 10). */
export const A3_POI_TEMPLATES: readonly A3Template[] = A3_TEMPLATES.filter((t) => t !== 'leap-cache');

/** Where an Act 3 piece's ids live: anchors `<region>.poi.<id>.*`. */
export type A3Region = 'greyfen' | 'dragonspine' | 'fenroad' | 'spineroad';

export interface A3Params {
  /** A Leap-gated ledge with a cache on top. */
  ledge?: boolean;
  /** One of K2's six rubbings (`spine-1` .. `spine-6`) stands at the piece's `rubbing` anchor. */
  rubbing?: string;
}

export interface A3Interactable {
  /** `kind:name`, no dots. */
  id: string;
  kind: 'chest' | 'use' | 'rubbing';
  /** Local anchor suffix the interactable stands on. */
  anchor: string;
  prop?: 'cache' | 'lore-stone';
}

export interface A3Piece {
  id: string;
  template: A3Template;
  radius: number;
  /** Parts: `env/<id>` (generated objects, natural metres), `hex/`, `dun/`, `hal/` or `proc:<kind>`. */
  parts: PoiPart[];
  /** Ids are suffixes; place.ts prefixes them. */
  anchors: AnchorSpec[];
  structures: StructureSpec[];
  interactables: A3Interactable[];
  leap: boolean;
}

export interface A3Site {
  id: string;
  template: A3Template;
  params?: A3Params;
}
