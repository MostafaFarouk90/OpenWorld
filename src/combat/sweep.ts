import * as THREE from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import type { HurtboxSet } from './HurtboxSet';

/** Result of sweeping a blade against one hurtbox set. `s` is the sweep fraction (0 = old frame, 1 = new). */
export interface SweepHit {
  bone: string;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  s: number;
}

const MIN_BLADE_LENGTH = 1e-6;

const quadA = new ExtendedTriangle();
const quadB = new ExtendedTriangle();
const quadBox = new THREE.Box3();
const line = new THREE.Line3();
const tmpTri = new ExtendedTriangle();
const mid = new THREE.Vector3();
const motion = new THREE.Vector3();
const oldPt = new THREE.Vector3();
const newPt = new THREE.Vector3();
const d1 = new THREE.Vector3();
const d2 = new THREE.Vector3();
const r = new THREE.Vector3();
const c1 = new THREE.Vector3();
const c2 = new THREE.Vector3();

/** True for a finite blade segment of at least MIN_BLADE_LENGTH (NaN-safe: NaN compares false). */
export function isUsableBlade(h: THREE.Vector3, t: THREE.Vector3): boolean {
  return h.distanceToSquared(t) >= MIN_BLADE_LENGTH ** 2 && Number.isFinite(h.x + h.y + h.z + t.x + t.y + t.z);
}

/** Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection). */
export function closestSegmentSegment(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
  out1: THREE.Vector3,
  out2: THREE.Vector3,
): number {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const eps = 1e-12;
  let s: number;
  let t: number;
  if (a <= eps && e <= eps) {
    s = t = 0;
  } else if (a <= eps) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= eps) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > eps ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  out1.copy(p1).addScaledVector(d1, s);
  out2.copy(p2).addScaledVector(d2, t);
  return out1.distanceTo(out2);
}

/**
 * Analytic test of the blade segment h-t against the set's world-space capsules. Catches a blade
 * that starts inside a hurtbox and zero-length frames, which a surface sweep cannot see.
 * Returns the hit with the smallest penetration-normalised distance, or null.
 */
export function segmentVsCapsules(h: THREE.Vector3, t: THREE.Vector3, set: HurtboxSet, s: number): SweepHit | null {
  let best: SweepHit | null = null;
  let bestDist = Infinity;
  for (const cap of set.capsules) {
    const dist = closestSegmentSegment(h, t, cap.a, cap.b, c1, c2);
    if (!(dist <= cap.radius) || dist >= bestDist) continue;
    bestDist = dist;
    const normal = new THREE.Vector3().subVectors(c1, c2);
    if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
    else normal.normalize();
    best = { bone: cap.name, point: c2.clone().addScaledVector(normal, cap.radius), normal, s };
  }
  return best;
}

/**
 * Sweeps the blade from (h0,t0) to (h1,t1) against a hurtbox set: the swept quad is tested against the
 * set's BVH with shapecast, plus analytic tests at both blade poses. Returns the earliest hit or null.
 */
export function sweepBlade(
  h0: THREE.Vector3,
  t0: THREE.Vector3,
  h1: THREE.Vector3,
  t1: THREE.Vector3,
  set: HurtboxSet,
): SweepHit | null {
  if (set.count === 0) return null;
  if (!isUsableBlade(h0, t0) || !isUsableBlade(h1, t1)) return null;

  // Blade already inside a capsule at the start of the frame: earliest possible hit.
  const startHit = segmentVsCapsules(h0, t0, set, 0);
  if (startHit) {
    motion.subVectors(t1, t0).add(d1.subVectors(h1, h0)).multiplyScalar(0.5);
    orient(startHit.normal, motion);
    return startHit;
  }

  motion.subVectors(t1, t0).add(d1.subVectors(h1, h0)).multiplyScalar(0.5);
  let best: SweepHit | null = null;

  if (motion.lengthSq() > 1e-12) {
    quadA.a.copy(h0);
    quadA.b.copy(t0);
    quadA.c.copy(t1);
    quadB.a.copy(h0);
    quadB.b.copy(t1);
    quadB.c.copy(h1);
    quadA.needsUpdate = true;
    quadB.needsUpdate = true;
    quadBox.makeEmpty().expandByPoint(h0).expandByPoint(t0).expandByPoint(h1).expandByPoint(t1);

    set.bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(quadBox),
      intersectsTriangle: (tri, triIndex) => {
        let hit = tri.intersectsTriangle(quadA, line);
        if (!hit) hit = tri.intersectsTriangle(quadB, line);
        if (!hit) return false;
        mid.addVectors(line.start, line.end).multiplyScalar(0.5);
        const s = sweepFraction(mid, h0, t0, h1, t1);
        if (best && s >= best.s) return false;
        tmpTri.a.copy(tri.a);
        tmpTri.b.copy(tri.b);
        tmpTri.c.copy(tri.c);
        const normal = tmpTri.getNormal(new THREE.Vector3());
        orient(normal, motion);
        best = { bone: set.nameOfTriangle(triIndex), point: mid.clone(), normal, s };
        return false;
      },
    });
  }
  if (best) return best;

  // Blade ends inside a capsule (also covers a zero-motion frame).
  const endHit = segmentVsCapsules(h1, t1, set, 1);
  if (endHit) orient(endHit.normal, motion);
  return endHit;
}

/** Flips `normal` to oppose `motion`; a zero motion leaves it unchanged. */
function orient(normal: THREE.Vector3, motionDir: THREE.Vector3): void {
  if (normal.dot(motionDir) > 0) normal.negate();
}

function sweepFraction(p: THREE.Vector3, h0: THREE.Vector3, t0: THREE.Vector3, h1: THREE.Vector3, t1: THREE.Vector3): number {
  // Position along the blade, then how far between the old and new blade at that position.
  d1.subVectors(t0, h0);
  const u = THREE.MathUtils.clamp(d1.dot(r.subVectors(p, h0)) / Math.max(d1.lengthSq(), 1e-12), 0, 1);
  oldPt.lerpVectors(h0, t0, u);
  newPt.lerpVectors(h1, t1, u);
  d2.subVectors(newPt, oldPt);
  const len2 = d2.lengthSq();
  if (len2 < 1e-12) return 0;
  return THREE.MathUtils.clamp(d2.dot(r.subVectors(p, oldPt)) / len2, 0, 1);
}
