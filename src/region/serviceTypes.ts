import type * as THREE from 'three';
import type { RegionInfo } from './regionMask';

/** Service `region`, published by the region plugin (contracts/game-events-and-flags.md section 6). */
export interface RegionService {
  at(x: number, z: number): RegionInfo | null;
  /** Mesh of the waystone at an anchor tagged `waystone`, or undefined. Thread 6 lights it. */
  waystoneObject(anchorId: string): THREE.Object3D | undefined;
}

declare module '../core/Services' {
  interface GameServices {
    region: RegionService;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    /** The player's region changed; `previous` is null on the first tick. */
    'region.entered': { regionId: string; previous: string | null };
  }
}
