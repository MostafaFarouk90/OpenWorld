import * as THREE from 'three';

/** Bones the sneak pose moves (KayKit names as Three.js strips them; KNIGHT_BONES). */
export interface SneakBones {
  hips: THREE.Bone;
  spine: THREE.Bone;
  legs: readonly { upper: THREE.Bone; lower: THREE.Bone; foot: THREE.Bone }[];
}

export const SNEAK_POSE = {
  /** Hip drop in metres at full weight; the legs fold by two-bone IK so the feet stay planted. */
  hipDrop: 0.22,
  /** Forward lean of the spine at full weight. */
  leanRadians: (14 * Math.PI) / 180,
  /** Seconds to blend in or out. */
  blendSeconds: 0.15,
} as const;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The procedural sneak pose (plans/slice-2-stealth-chase.md section 3): no KayKit sneak clip, so after the mixer each
 * fixed tick it lowers the hips, folds each leg with two-bone IK to keep the foot where the clip put it, and leans
 * the spine forward. Axis-agnostic (works in world space), so any class kit with these bones gets it. Allocates
 * nothing per tick.
 */
export class SneakPose {
  private weight = 0;
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly foot = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly q3 = new THREE.Quaternion();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly feet: THREE.Vector3[];
  /** Every bone the pose writes, with the clip's value before the write and the value written. */
  private readonly touched: { bone: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; wPos: THREE.Vector3; wQuat: THREE.Quaternion }[];
  private wrote = false;

  constructor(private readonly bones: SneakBones) {
    this.feet = bones.legs.map(() => new THREE.Vector3());
    const all: THREE.Object3D[] = [bones.hips, bones.spine, ...bones.legs.flatMap((l) => [l.upper, l.lower])];
    this.touched = all.map((bone) => ({ bone, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), wPos: new THREE.Vector3(), wQuat: new THREE.Quaternion() }));
  }

  /**
   * A clip that does not key a bone leaves our last write in place; undo it so the pose never accumulates. A bone the
   * mixer did rewrite is left as the mixer set it.
   */
  private restore(): void {
    if (!this.wrote) return;
    this.wrote = false;
    for (const t of this.touched) {
      if (t.bone.position.equals(t.wPos)) t.bone.position.copy(t.pos);
      if (t.bone.quaternion.equals(t.wQuat)) t.bone.quaternion.copy(t.quat);
    }
  }

  get blend(): number {
    return this.weight;
  }

  /**
   * One tick after the animation mixer. `sneaking` is the target; `forward` the character's facing (world, any
   * length). Returns the weight it applied.
   */
  apply(sneaking: boolean, forward: THREE.Vector3Like, dt: number): number {
    const step = dt / SNEAK_POSE.blendSeconds;
    this.weight = Math.max(0, Math.min(1, this.weight + (sneaking ? step : -step)));
    const w = this.weight;
    this.restore();
    if (w <= 0) return 0;
    const b = this.bones;
    for (const t of this.touched) {
      t.pos.copy(t.bone.position);
      t.quat.copy(t.bone.quaternion);
    }
    this.fwd.set(forward.x, 0, forward.z);
    if (this.fwd.lengthSq() < 1e-12) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, UP).normalize();

    const top = b.hips.parent ?? b.hips;
    top.updateMatrixWorld(true);
    b.legs.forEach((leg, i) => leg.foot.getWorldPosition(this.feet[i]));

    // 1. Drop the hips (world down, converted into the hips' parent frame).
    const hp = b.hips.getWorldPosition(this.v1).addScaledVector(UP, -SNEAK_POSE.hipDrop * w);
    if (b.hips.parent) b.hips.parent.worldToLocal(hp);
    b.hips.position.copy(hp);
    b.hips.updateMatrixWorld(true);

    // 2. Fold each leg back onto its planted foot.
    b.legs.forEach((leg, i) => this.solveLeg(leg, this.feet[i]));

    // 3. Lean the spine forward about the character's right axis.
    this.rotateWorld(b.spine, this.right, -SNEAK_POSE.leanRadians * w);
    b.spine.updateMatrixWorld(true);
    for (const t of this.touched) {
      t.wPos.copy(t.bone.position);
      t.wQuat.copy(t.bone.quaternion);
    }
    this.wrote = true;
    return w;
  }

  /** Two-bone IK: fold the knee to the needed angle (foot swinging back, knee forward), then aim the thigh. */
  private solveLeg(leg: SneakBones['legs'][number], target: THREE.Vector3): void {
    const H = leg.upper.getWorldPosition(this.v1);
    const K = leg.lower.getWorldPosition(this.v2);
    const A = leg.foot.getWorldPosition(this.v3);
    const l1 = H.distanceTo(K);
    const l2 = K.distanceTo(A);
    if (!(l1 > 1e-6 && l2 > 1e-6)) return;
    const d = Math.min(H.distanceTo(target), l1 + l2 - 1e-4);
    const u = this.v4.subVectors(H, K).normalize();
    const wv = this.foot.subVectors(A, K).normalize();
    const current = u.angleTo(wv);
    const wanted = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
    const delta = current - wanted;
    if (Math.abs(delta) > 1e-6) {
      // Fold about the character's right axis; pick the sign that swings the foot backward (the knee goes forward).
      this.qa.setFromAxisAngle(this.right, delta);
      this.qb.setFromAxisAngle(this.right, -delta);
      const backA = this.v4.copy(wv).applyQuaternion(this.qa).dot(this.fwd);
      const backB = this.v4.copy(wv).applyQuaternion(this.qb).dot(this.fwd);
      this.rotateWorld(leg.lower, this.right, backA <= backB ? delta : -delta);
      leg.lower.updateMatrixWorld(true);
    }
    // Aim: rotate the thigh so hip-to-foot points at the planted foot.
    const H2 = leg.upper.getWorldPosition(this.v1);
    const now = leg.foot.getWorldPosition(this.v3).sub(H2).normalize();
    const want = this.v2.subVectors(target, H2).normalize();
    this.q1.setFromUnitVectors(now, want);
    this.applyWorldQuat(leg.upper, this.q1);
    leg.upper.updateMatrixWorld(true);
  }

  private rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
    this.q1.setFromAxisAngle(axis, angle);
    this.applyWorldQuat(bone, this.q1);
  }

  /** bone.local = P^-1 * R * P * bone.local, P the parent's world rotation. */
  private applyWorldQuat(bone: THREE.Object3D, r: THREE.Quaternion): void {
    const p = bone.parent ? bone.parent.getWorldQuaternion(this.q2) : this.q2.identity();
    this.q3.copy(p).invert().multiply(r).multiply(p);
    bone.quaternion.premultiply(this.q3);
  }

  /** Snap the blend (a class swap rebinds a new pose at the old weight). */
  setBlend(w: number): void {
    this.weight = Math.max(0, Math.min(1, Number.isFinite(w) ? w : 0));
  }
}
