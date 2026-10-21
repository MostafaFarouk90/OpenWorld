import type * as THREE from 'three';
import type { ActorId, Vec3 } from './ports';
import type { QualityStep } from './tuning';
import { TIER3_EFFECT_IDS, type Tier3EffectId } from './effects/tier3';

export type EffectId =
  | 'hit-spark'
  | 'hit-spark-heavy'
  | 'block-spark'
  | 'parry-flash'
  | 'shockwave-ring'
  | 'scorch-decal'
  | 'ember-burst'
  | 'surge'
  | 'wraith-dissolve'
  | 'waystone-rekindle'
  | 'skill-q'
  | 'release-pulse'
  | 'yield-glyph'
  | 'leap-trail'
  | 'leap-dust'
  | 'leap-shell'
  | 'scar-flash'
  | 'ash-cloud'
  | 'calm-offering'
  | 'warm-hand'
  | Tier3EffectId;

export const EFFECT_IDS: readonly EffectId[] = [
  'hit-spark',
  'hit-spark-heavy',
  'block-spark',
  'parry-flash',
  'shockwave-ring',
  'scorch-decal',
  'ember-burst',
  'surge',
  'wraith-dissolve',
  'waystone-rekindle',
  'skill-q',
  'release-pulse',
  'yield-glyph',
  'leap-trail',
  'leap-dust',
  'leap-shell',
  'scar-flash',
  'ash-cloud',
  'calm-offering',
  'warm-hand',
  ...TIER3_EFFECT_IDS,
];

export interface EffectTransform {
  position: Vec3;
  normal?: Vec3;
  yaw?: number;
  scale?: number;
  attach?: THREE.Object3D;
}
export type EffectParams = Record<string, number | string | boolean>;
export interface EffectHandle {
  stop(): void;
  readonly alive: boolean;
}
export interface TrailHandle {
  setEmitting(on: boolean): void;
  dispose(): void;
}

/** contracts/vfx-and-feedback.md section 1, plus the thread-7 additions noted in that file. */
export interface VfxService {
  spawnEffect(id: EffectId | string, transform: EffectTransform, params?: EffectParams): EffectHandle;
  attachTrail(id: string, hilt: THREE.Object3D, tip: THREE.Object3D, opts?: { lifetime?: number; color?: number; attackId?: string }): TrailHandle;
  telegraph(actorId: ActorId, kind: 'block' | 'dodge', leadSeconds: number, opts?: { parts?: string[] }): void;
  shake(amplitude: number, seconds: number): void;
  fovPunch(degrees: number, seconds?: number): void;
  /** `reverse` fades the root in (1 to 0) instead of out, for a teleport arrival or a rise. */
  dissolve(root: THREE.Object3D, seconds: number, opts?: { tint?: number; reverse?: boolean }): Promise<void>;
  /** Pulses the screen vignette (parry flash, Surge): strength 0..1. */
  pulseScreen(strength: number, seconds: number, color?: number): void;
  /** Wraps weapon geometry with hilt and tip marker Objects for enemy trails (item 19). */
  createWeaponMarkers(weapon: THREE.Object3D): { hilt: THREE.Object3D; tip: THREE.Object3D };
  readonly quality: QualityStep;
  setQuality(q: QualityStep): void;
}

declare module '../core/Services' {
  interface GameServices {
    vfx: VfxService;
  }
}
