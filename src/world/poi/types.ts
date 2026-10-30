// Plain data for the Act 2 point-of-interest library. Pieces are built in site-local coordinates (yaw 0 faces -Z, +Z is
// north); place.ts rotates and translates them. No THREE and no terrain imports here.
import type { AnchorSpec, StructureSpec, TriggerSpec } from '../../region/layoutTypes';

export const POI_TEMPLATES = ['camp', 'cave', 'ruin', 'lore-stone', 'wyrm-nest', 'hunter-pen', 'vista'] as const;
export type PoiTemplate = (typeof POI_TEMPLATES)[number];

/** Asset ids use the ModelLibrary prefixes (`hex/`, `dun/`, `hal/`). `proc:` parts are built from primitives. */
export type ProcKind = 'bones' | 'eggs' | 'bedroll' | 'brazier' | 'cage' | 'net' | 'fire-ring' | 'cave-mouth' | 'ember-glow' | 'cache' | 'lore-stone'
  /** Act 3 (K2), temporary stand-ins until the generated `greyfen-peat-stack` and `dragonspine-glass-vein` land. */
  | 'peat-stack'
  | 'glass-vein'
  | 'egg-shells';

export interface PoiPart {
  /** `hex/…`, `dun/…`, `hal/…` or `proc:<ProcKind>`. */
  asset: string;
  x: number;
  z: number;
  yawDeg: number;
  scale: number;
  /** Metres above the ground at (x, z). */
  dy?: number;
}

export type PoiTint = 'traveller' | 'hunter' | 'ash-cultist';

export interface PoiParams {
  /** 0..1 footprint size. */
  size?: number;
  tint?: PoiTint;
  /** Camp and cave: a chest. */
  chest?: boolean;
  /** Lore stone, wyrm nest, ruin, cave: a Leap-gated variant on a ledge (the cache or stone sits on top). */
  ledge?: boolean;
  /** Ruin and decay 0..1; cave depth in metres; pen cage count; vista height; nest ring radius. */
  amount?: number;
}

export interface PoiInteractable {
  /** `kind:name`, no dots (src/interaction/ids.ts). */
  id: string;
  kind: 'chest' | 'use';
  /** Local anchor suffix (after `poi.a2.<id>.`) the interactable stands on. */
  anchor: string;
  prop?: 'cache' | 'lore-stone';
}

export interface PoiPiece {
  id: string;
  template: PoiTemplate;
  /** Radius of the whole piece, for clearance checks. */
  radius: number;
  parts: PoiPart[];
  /** Ids are suffixes; place.ts prefixes them with `poi.a2.<id>.`. */
  anchors: AnchorSpec[];
  structures: StructureSpec[];
  triggers: TriggerSpec[];
  interactables: PoiInteractable[];
  /** Leap-gated: carries a `.launch` anchor and a ledge structure. */
  leap: boolean;
}

export interface PoiSite {
  id: string;
  template: PoiTemplate;
  params?: PoiParams;
}
