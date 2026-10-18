// Story-state rules for the crowd (plan section 3). Pure: inputs are the South Gate state (from thread 6's flags through
// ctx.gates), thread 18's stealth and chase readers, and the quality step.
import type { GateState } from '../harrowmark/gate';
import type { QualityStep } from '../vfx/tuning';
import { CROWD_TUNING } from './tuning';
import type { ClusterSpec } from './clusters';

export interface DensityInput {
  gate: GateState;
  stealthActive: boolean;
  chaseActive: boolean;
  quality: QualityStep;
  /** Multiplier hook for a later day/night clock (1 by default; the game has no clock yet). */
  night?: number;
}

export interface Density {
  /** Count multiplier for every lane and cluster, 0 empties the streets. */
  scale: number;
  /** M06's stealth ground is clear: `gate-queue` and the gate-square groups are off, main street south starts later. */
  guarded: boolean;
  lod0Range: number;
}

export function densityFor(i: DensityInput): Density {
  const q = CROWD_TUNING.quality[i.quality] ?? CROWD_TUNING.quality.high;
  const night = Number.isFinite(i.night) ? Math.max(0, Math.min(1, i.night as number)) : 1;
  return {
    scale: i.chaseActive ? 0 : q.count * night,
    guarded: i.gate === 'guarded' || i.stealthActive,
    lod0Range: q.lod0Range,
  };
}

/** The arc-length range a lane's walkers use, or null when the lane is off. */
export function laneRange(name: string, length: number, d: Density): [number, number] | null {
  if (d.scale <= 0) return null;
  if (d.guarded) {
    if (name === 'gate-queue') return null;
    if (name === 'main-street-south') {
      const start = CROWD_TUNING.guardedMainStreetStart;
      return start < length ? [start, length] : null;
    }
  }
  return [0, length];
}

/** Walkers a lane should carry for its range. */
export function laneTarget(base: number, length: number, range: [number, number] | null, d: Density): number {
  if (!range || length <= 0) return 0;
  return Math.round(base * d.scale * ((range[1] - range[0]) / length));
}

/** Whether a cluster stands. Low quality keeps every other cluster (by index), so counts scale with the toggle. */
export function clusterOn(spec: ClusterSpec, index: number, d: Density): boolean {
  if (d.scale <= 0) return false;
  if (d.guarded && spec.group === 'gate-square') return false;
  if (d.scale < 0.6) return index % 2 === 0;
  if (d.scale < 0.9) return index % 4 !== 3;
  return true;
}
