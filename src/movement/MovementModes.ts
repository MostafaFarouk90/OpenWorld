// The `movementMode` service (contracts v0.7 item 25): which movement mode the player is in and its safe point. Core
// provides it; K7 calls `set` as a glide, ferry ride, dive or haul starts and ends. The save service, fast travel and
// the mount read it through their refusal hooks. A load resets it to `walk` (the loader places the player on the ground).
import type { Vec3Like } from '../core/events';
import { MOVEMENT_MODE_RULES, type MovementMode, type MovementModeRule, type MovementModeService } from './types';

export interface MovementModePorts {
  emit(mode: MovementMode, previous: MovementMode): void;
  warn(message: string): void;
}

export class MovementModes implements MovementModeService {
  private mode: MovementMode = 'walk';
  private point: { position: Vec3Like; yaw: number } | null = null;

  constructor(private readonly ports: MovementModePorts) {}

  get current(): MovementMode {
    return this.mode;
  }

  get safePoint(): { position: Vec3Like; yaw: number } | null {
    return this.point;
  }

  set(mode: MovementMode, safePoint: { position: Vec3Like; yaw: number } | null = null): void {
    if (!Object.prototype.hasOwnProperty.call(MOVEMENT_MODE_RULES, mode)) {
      this.ports.warn(`movementMode: unknown mode "${String(mode)}" ignored`);
      return;
    }
    const p = safePoint?.position;
    const valid = p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(safePoint!.yaw);
    if (safePoint && !valid) this.ports.warn(`movementMode: a non-finite safe point for "${mode}" was dropped`);
    this.point = mode === 'walk' || !valid ? null : { position: { x: p!.x, y: p!.y, z: p!.z }, yaw: safePoint!.yaw };
    const previous = this.mode;
    this.mode = mode;
    if (previous !== mode) this.ports.emit(mode, previous);
  }

  rule(): MovementModeRule {
    return MOVEMENT_MODE_RULES[this.mode];
  }

  /** The point a save stores for the player in this mode, or null to store the live position. */
  saveOverride(): { position: Vec3Like; yaw: number } | null {
    return this.rule().save === 'safePoint' ? this.point : null;
  }
}
