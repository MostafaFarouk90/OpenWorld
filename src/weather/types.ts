// Contracts v0.8 item 5: the Ashen Waste's weather (plan Part 5.2). L0 owns these types and the pure precedence rule
// (precedence.ts); L3 provides the `weather` service, the clock, the storm's look and the rope-lines.
import type { Vec3Like } from '../core/events';

export type WeatherKind = 'clear' | 'warning' | 'storm';

export interface WeatherState {
  kind: WeatherKind;
  /** Seconds into the current kind. */
  t: number;
  /** A `forceStorm` holds the storm. */
  forced: boolean;
  /** A `holdClear` holds the clear. */
  held: boolean;
}

/** The clock's next change: what comes next and when (seconds of game time from now). */
export interface WeatherClock {
  readonly seed: number;
  next(): { kind: WeatherKind; at: number };
}

/** The `weather` service (L3 provides it). With no provider there is no weather: `isStorming` is false. */
export interface WeatherService {
  state(): WeatherState;
  /**
   * Scenes, boss arenas and quest beats force a storm; returns the release (idempotent). N4 (Act 5): with `area`, while
   * this force stands the points inside the area count as a storm region too (the siege's court inside the Caldera box).
   */
  forceStorm(reason: string, opts?: { area: StormArea }): () => void;
  /** Scenes, boss arenas and escort hand-ins hold the clear; beats every other rule. Returns the release. */
  holdClear(reason: string): () => void;
  readonly clock: WeatherClock;
  /** True while the player stands in shelter `id` (a rope-line hut, a cairn). */
  onShelter(id: string): boolean;
  /**
   * N4 (Act 5): while registered, standing within `radius` of `at` is safe from exposure, as a shelter is (the siege's
   * lee ring). Returns the release. A zone does not count as a shelter for `onShelter` or the shelter events.
   */
  addShelterZone?(zone: { id: string; at: { x: number; z: number }; radius: number }): () => void;
}

/** N4: an area a forced storm covers (engine x, z). */
export type StormArea = { box: { minX: number; maxX: number; minZ: number; maxZ: number } } | { circle: { x: number; z: number; r: number } };

export function inStormArea(a: StormArea, x: number, z: number): boolean {
  if ('box' in a) return x >= a.box.minX && x <= a.box.maxX && z >= a.box.minZ && z <= a.box.maxZ;
  return Math.hypot(x - a.circle.x, z - a.circle.z) <= a.circle.r;
}

/** A rope-line across the Waste: the path a storm cannot take the player off, with the shelters along it. */
export interface RopeLineDef {
  id: string;
  /** Anchor ids in order. */
  points: readonly string[];
  /** Shelter ids along the line. */
  shelters: readonly string[];
}

export interface ShelterDef {
  id: string;
  /** An anchor id. */
  at: string;
  radius: number;
}

declare module '../core/events' {
  interface GameEventMap {
    'weather.changed': { kind: WeatherKind; from: WeatherKind };
    /** Seconds the player has stood in an open storm (no shelter), emitted by L3 while it rises. */
    'storm.exposed': { seconds: number };
    'shelter.entered': { id: string };
    'shelter.left': { id: string };
  }
}

declare module '../core/Services' {
  interface GameServices {
    weather: WeatherService;
  }
}

/** For payloads that carry a place. */
export type WeatherPoint = Vec3Like;
