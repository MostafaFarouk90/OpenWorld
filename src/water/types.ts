// Water (contracts v0.7 item 4; K7 PR 1 builds the behaviour). Outdoor water is wade-only (Q4): `deep` volumes are
// never entered (their edge pushes back with a toast, like containment); `dive` volumes exist only on fixed routes
// (M24's pool, R13's chapel, D05's deeps) and switch the player to a kinematic 3D swim. Surfaces are flat: D05's sluices
// swap volume sets by flag (`activeWhen`), so a load mid-dive puts the player at a pocket of the active set.
import type { FlagCondition } from '../core/flagCondition';
import type { Vec3Like } from '../core/events';

export type WaterKind = 'wade' | 'deep' | 'dive';

/** An engine-space area: an axis box or a polygon of (x, z) points (at least three). */
export type WaterArea =
  | { box: { x0: number; z0: number; x1: number; z1: number } }
  | { polygon: readonly (readonly [number, number])[] };

export interface WaterVolumeDef {
  /** `water.<region>.<name>`. */
  id: string;
  kind: WaterKind;
  /** World y of the flat surface. */
  surfaceY: number;
  area: WaterArea;
  /** Metres per second the water pushes the player (wading only), along (x, z). */
  current?: { x: number; z: number };
  /** The volume exists only while this holds (D05's sluice sets); default always. */
  activeWhen?: FlagCondition;
}

/** Wading: 0.4 to 1.2 m deep at the feet. Speed x 0.55, no sprint, dodge kept. */
export const WADE_TUNING = { minDepth: 0.4, maxDepth: 1.2, speedScale: 0.55 } as const;
/** Diving: a kinematic swim with gravity off, 2 m/s, 30 s of breath, refilled at air pockets. */
export const DIVE_TUNING = { swimSpeed: 2, breathSeconds: 30 } as const;
/** Air pockets are at most this far apart along a dive route (about 20 s of swimming, 10 s of breath spare). */
export const AIR_POCKET_MAX_SPACING = 40;

export interface AirPocketDef {
  id: string;
  /** Where the player surfaces and where a drowning or a load under water returns them. */
  at: Vec3Like;
}

/** A dive route: the path a dive takes from its entry to its exit, with its pockets in order along it. */
export interface DiveRouteDef {
  id: string;
  volumeId: string;
  /** The route's polyline (world points), entry first. */
  points: readonly Vec3Like[];
  /** Pockets in route order; each is projected onto the route for the spacing lint. */
  airPockets: readonly AirPocketDef[];
}

/** The player's water state (K7 sets it; `dry` outside every active volume). */
export type WaterState = 'dry' | 'wading' | 'diving';

/** The `water` service (K7 provides it). */
export interface WaterService {
  /** Registers a volume; throws on a duplicate id; returns the undo. */
  register(def: WaterVolumeDef): () => void;
  /** Registers a dive route (and lints it in dev); returns the undo. */
  registerRoute(def: DiveRouteDef): () => void;
  /** Water depth (m) at the ground under (x, z) for the active volumes; 0 when dry. */
  depthAt(x: number, z: number): number;
  /** The active volume containing `p` (below its surface), or null. */
  volumeAt(p: Vec3Like): WaterVolumeDef | null;
  readonly state: WaterState;
  /** Seconds of breath left while diving (DIVE_TUNING.breathSeconds when not). */
  readonly breath: number;
}
