import type { FogGrid } from './MapModel';
import type { MapMarker } from './MapModel';
import type { ForgeState } from './ForgeMarks';
import type { TerrainBitmap } from './TerrainBitmap';
import type { WorldBounds } from './tuning';

/** What the DOM views read from the map plugin. Views never touch the game directly. */
export interface MapViewModel {
  bounds: WorldBounds;
  /** Full-map terrain pixels; null until the sliced render has finished. */
  fullBitmap(): TerrainBitmap | null;
  /** Local 128x128 tile centred on the player (null until first render). */
  minimapTile(): { bitmap: TerrainBitmap; centerX: number; centerZ: number } | null;
  fog(): FogGrid;
  markers(): MapMarker[];
  player(): { x: number; z: number; yaw: number };
  /** Why travel is currently impossible ('in-combat', ...) or null when allowed. */
  /** Forge-mark row state; omitted when the view has no forge data. */
  forge?(): ForgeState;
  /** Expected level band for the player's position; null hides the legend. */
  legend?(): { min: number; max: number } | null;
  travelBlockedReason(): string | null;
  /** Fast travel to a waystone id (without `waystone.` prefix). */
  travel(id: string): void;
  t(key: string, params?: Record<string, string | number>): string;
}

export interface MapViewDeps {
  model: MapViewModel;
  /** Closes the modal (the plugin owns the unsubscribe returned by hud.openModal). */
  close(): void;
  doc?: Pick<Document, 'createElement'>;
}

export interface ContinueModalDeps {
  hasSave: boolean;
  /** Saves unavailable (IndexedDB failed): show a notice. */
  storageUnavailable: boolean;
  /** A corrupt or newer-format save was found and backed up. */
  saveProblem: 'corrupt' | 'newer' | null;
  onContinue(): void;
  onNewGame(): void;
  t(key: string, params?: Record<string, string | number>): string;
  doc?: Pick<Document, 'createElement'>;
}
