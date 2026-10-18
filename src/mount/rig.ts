// The one importer of thread 5's quadruped rig (src/enemies/quadruped): the mount codes against this file only, so
// a later swap of the rig (or of the horse for a glb) touches nothing else in src/mount. rig.test.ts pins the API.
import type * as THREE from 'three';
import { LEG_IDS, QuadrupedGait, bodyPitch, spineHeight, type GaitName, type Pose } from '../enemies/quadruped/gait';
import { HORSE_PROPORTIONS, type QuadrupedParams } from '../enemies/quadruped/params';
import { QuadrupedRig, type QuadrupedSockets } from '../enemies/quadruped/QuadrupedRig';

export { QuadrupedGait, QuadrupedRig, bodyPitch };
export type { GaitName, Pose, QuadrupedParams, QuadrupedSockets };

/** The Ashmare: thread 5's horse proportions, a dark hide and an ember glow (design 14.3). */
export const HORSE: Readonly<QuadrupedParams> = Object.freeze({
  ...HORSE_PROPORTIONS,
  tint: 0x2a211d,
  emissive: 0x2a0a00,
});

export type GaitMode = 'idle' | GaitName;

/** Below this speed (m/s) the horse reads as standing. */
export const IDLE_BELOW = 0.3;

/** The gait the horse shows at `gait`'s current speed. */
export function modeOf(gait: QuadrupedGait): GaitMode {
  return gait.speed < IDLE_BELOW ? 'idle' : gait.gait;
}

/** Puts `pose` on the rig's joints, plus `slope` (radians) of body pitch from the ground. */
export function applyPose(rig: THREE.Object3D, pose: Pose, slope = 0): void {
  const j = QuadrupedRig.joints(rig);
  const d = QuadrupedRig.dims(rig);
  const p = slope === 0 ? pose : { ...pose, pitch: pose.pitch + slope };
  j.spine.position.y = spineHeight(p, d);
  j.spine.rotation.set(p.pitch, 0, p.roll);
  j.neck.rotation.x = d.restNeck + p.neck;
  j.head.rotation.x = d.restHead + p.head;
  j.tail.rotation.set(-(d.restTail + p.tail), p.tailSway, 0);
  for (const id of LEG_IDS) {
    j.legs[id].upper.rotation.x = p.legs[id].upper;
    j.legs[id].lower.rotation.x = p.legs[id].lower;
  }
}
