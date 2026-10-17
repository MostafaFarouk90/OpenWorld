import type * as THREE from 'three';

/** Hurtbox names, shared by the layout, damage multipliers and tests. */
export const HURTBOX_NAMES = [
  'head',
  'torso',
  'upperArmL',
  'upperArmR',
  'lowerArmL',
  'lowerArmR',
  'upperLegL',
  'upperLegR',
  'lowerLegL',
  'lowerLegR',
] as const;
export type HurtboxName = (typeof HURTBOX_NAMES)[number];

/**
 * A capsule fixed to a skeleton bone. `start` and `end` are the capsule's axis endpoints in the
 * bone's local space (bone space of `bone`); `radius` is in metres (assumes unscaled bones).
 */
export interface HurtboxDef {
  name: string;
  /** Name of the bone in the skeleton (Object3D name) the capsule follows. */
  bone: string;
  start: THREE.Vector3Like;
  end: THREE.Vector3Like;
  radius: number;
}

/** One hit of a weapon sweep on a target's hurtbox. */
export interface HitEvent {
  /** Hurtbox (bone) name that was struck. */
  bone: string;
  point: THREE.Vector3;
  /** Unit normal of the struck surface, pointing against the blade's motion. */
  normal: THREE.Vector3;
  attacker: unknown;
  target: unknown;
  /** Damage after bone multiplier. */
  damage: number;
}

/** Where the attack-active window comes from (animation controller or the demo's mixer). */
export interface AttackWindowSource {
  readonly clipName: string;
  /** Normalised active window within the clip, 0..1. */
  readonly start: number;
  readonly end: number;
  /** Current normalised clip time 0..1, or null when the clip is not playing. */
  currentTime(): number | null;
  /** Stable per swing when the source knows it (animation contract `swingId`); re-arms hits when it changes. */
  readonly swingId?: number;
}
