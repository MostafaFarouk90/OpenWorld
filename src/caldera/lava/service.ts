// N3 `lava` service (plans/act5-N3.md 1.1 to 1.3): what N1 PR 2, N2, N6 register lava, vents and crossings through, and what
// N5 (avoid lava), N8 (sound) and N9 (cues) read.
import type { Vec3 } from '../../physics/PhysicsWorld';
import type { SurgeCrossingDef } from '../lava';
import type { LeapAim } from './crossings';
import type { CrustVentDef, LavaFieldDef, VentInfo, VolumeInfo } from './types';
import type { WheelResult } from './vents';

export interface LavaService {
  /** A lava volume (mesh, haze strip and burn). Throws on a duplicate id or a bad def; returns the undo. */
  add(def: LavaFieldDef): () => void;
  /** A vent with its crust (part of a registered volume). Throws on a duplicate id or an unknown volume. */
  addVent(def: CrustVentDef): () => void;
  /** A Surge-crossing lip pair (span 3.5 to 5.4 m). Both ends should also be safe lips of the volume they cross. */
  addCrossing(def: SurgeCrossingDef): () => void;
  /** The vent's wheel was turned (N1's prop, or `registerWheel`'s interactable). 'hot' toasts while it recharges. */
  turnWheel(ventId: string): WheelResult;
  /** Registers a `valve:<name>` interactable at `at` that turns the vent's wheel. Returns the undo. */
  registerWheel(ventId: string, at: Vec3): () => void;
  /** The volume whose lava is at this point, or null (N5: keep creatures out). */
  at(x: number, y: number, z: number): string | null;
  /** The nearest lava surface point (N8: the positional lava loop); pass the listener's `y` to skip lava far above or below. */
  nearest(x: number, z: number, y?: number): { volumeId: string; distance: number; point: Vec3 } | null;
  volumes(): VolumeInfo[];
  vents(): VentInfo[];
  crossings(): SurgeCrossingDef[];
  /** The Leap's aim near a crossing lip (the spells plugin reads it), or null. */
  aim(feet: { x: number; z: number }, yaw: number): LeapAim | null;
  /** The last safe lip Cael passed (null before any), and the safe point a save in lava stores. */
  lastSafeLip(): Vec3 | null;
  safePoint(): { position: Vec3; yaw: number } | null;
  /** The arena kit's rising lava: a volume's surface (refused for a volume with vent crusts) and its lips. */
  setSurface(volumeId: string, y: number): boolean;
  surface(volumeId: string): number | undefined;
  setLips(volumeId: string, lips: readonly Vec3[]): boolean;
}

declare module '../../core/Services' {
  interface GameServices {
    /** N3: provided by the caldera-lava plugin (caldera/lava/lava.plugin.ts). */
    lava: LavaService;
  }
}
