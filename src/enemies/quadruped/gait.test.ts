import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  blendPose,
  bitePose,
  crouchPose,
  dominantGait,
  GAIT_OFFSETS,
  gaitWeights,
  headLowerPose,
  howlPose,
  idlePose,
  knockdownPose,
  LEG_IDS,
  legPhases,
  locomotionPose,
  pouncePose,
  POUNCE_PEAK_LIFT,
  spineHeight,
  strideFrequency,
  wrapPhase,
  DEFAULT_TUNING,
  type Pose,
} from './gait';
import { HOUND, quadrupedDims } from './params';

const L = HOUND.legLength;
const dims = quadrupedDims(HOUND);

function poseDistance(a: Pose, b: Pose): number {
  let d = Math.abs(a.lift - b.lift) + Math.abs(a.pitch - b.pitch) + Math.abs(a.neck - b.neck) + Math.abs(a.fall - b.fall);
  for (const id of LEG_IDS) d = Math.max(d, Math.abs(a.legs[id].upper - b.legs[id].upper), Math.abs(a.legs[id].lower - b.legs[id].lower));
  return d;
}

describe('gait weights', () => {
  it('sum to 1 and pick walk, trot, gallop by speed', () => {
    for (let s = 0; s < 12; s += 0.1) {
      const w = gaitWeights(s);
      expect(w.walk + w.trot + w.gallop).toBeCloseTo(1, 12);
      expect(w.walk).toBeGreaterThanOrEqual(0);
      expect(w.trot).toBeGreaterThanOrEqual(0);
      expect(w.gallop).toBeGreaterThanOrEqual(0);
    }
    expect(dominantGait(1)).toBe('walk');
    expect(dominantGait(3.8)).toBe('trot');
    expect(dominantGait(8)).toBe('gallop');
  });

  it('speedScale moves the thresholds', () => {
    expect(dominantGait(5, { ...DEFAULT_TUNING, speedScale: 2 })).toBe('walk');
    expect(dominantGait(5, { ...DEFAULT_TUNING, speedScale: 1 })).toBe('gallop');
  });

  it('treats negative and non-finite speed as rest', () => {
    for (const s of [-3, NaN, -Infinity]) expect(gaitWeights(s).walk).toBe(1);
  });
});

describe('phase', () => {
  it('wraps into [0, 1)', () => {
    expect(wrapPhase(1)).toBe(0);
    expect(wrapPhase(-0.25)).toBeCloseTo(0.75, 12);
    expect(wrapPhase(NaN)).toBe(0);
    expect(wrapPhase(3.5)).toBeCloseTo(0.5, 12);
  });

  it('stays continuous across speed changes: one tick moves it by at most freq*dt', () => {
    let phase = 0.3;
    const dt = 1 / 60;
    let prev = phase;
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      const speed = i < 100 ? 1 : i < 200 ? 6 : i < 300 ? 2 : i < 400 ? 4 : 0.5;
      phase = advancePhase(phase, speed, dt, L);
      const step = (phase - prev + 1) % 1;
      worst = Math.max(worst, step);
      expect(step).toBeLessThanOrEqual(strideFrequency(speed, L) * dt + 1e-12);
      prev = phase;
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('stride frequency is continuous in speed and zero at rest', () => {
    expect(strideFrequency(0, L)).toBe(0);
    let prev = strideFrequency(0.01, L);
    for (let s = 0.02; s < 10; s += 0.01) {
      const f = strideFrequency(s, L);
      expect(Math.abs(f - prev)).toBeLessThan(0.05);
      prev = f;
    }
  });

  it('is unchanged for zero speed, negative dt, zero dt and NaN', () => {
    expect(advancePhase(0.4, 0, 1 / 60, L)).toBeCloseTo(0.4, 12);
    expect(advancePhase(0.4, 3, -1, L)).toBeCloseTo(0.4, 12);
    expect(advancePhase(0.4, 3, 0, L)).toBeCloseTo(0.4, 12);
    expect(advancePhase(0.4, 3, NaN, L)).toBeCloseTo(0.4, 12);
    expect(advancePhase(0.4, -2, 1 / 60, L)).toBeCloseTo(0.4, 12);
    expect(advancePhase(0.4, NaN, 1 / 60, L)).toBeCloseTo(0.4, 12);
  });

  it('a full cycle at a steady speed returns to the same phase', () => {
    let p = 0;
    const speed = 2;
    const cycle = 1 / strideFrequency(speed, L);
    const steps = 1200;
    for (let i = 0; i < steps; i++) p = advancePhase(p, speed, cycle / steps, L);
    expect(p === 0 || Math.abs(p - 1) < 1e-9 || p < 1e-9).toBe(true);
  });
});

describe('leg offsets', () => {
  it('walk is a lateral sequence a quarter cycle apart', () => {
    const o = GAIT_OFFSETS.walk;
    const order = [...LEG_IDS].sort((a, b) => o[a] - o[b]);
    expect(order).toEqual(['FL', 'BR', 'FR', 'BL']);
    expect(o.BR - o.FL).toBeCloseTo(0.25, 12);
    expect(o.FR - o.BR).toBeCloseTo(0.25, 12);
    expect(o.BL - o.FR).toBeCloseTo(0.25, 12);
  });

  it('trot moves diagonal pairs together, half a cycle apart', () => {
    const o = GAIT_OFFSETS.trot;
    expect(o.FL).toBe(o.BR);
    expect(o.FR).toBe(o.BL);
    expect(Math.abs(o.FR - o.FL)).toBeCloseTo(0.5, 12);
  });

  it('gallop pairs the hind legs and the fore legs', () => {
    const o = GAIT_OFFSETS.gallop;
    expect(Math.abs(o.BR - o.BL)).toBeLessThan(0.15);
    expect(Math.abs(o.FR - o.FL)).toBeLessThan(0.15);
    expect(Math.abs(o.FL - o.BL)).toBeGreaterThan(0.4);
  });

  it('legPhases wraps and keeps the offsets', () => {
    const p = legPhases('walk', 0.9);
    expect(p.FL).toBeCloseTo(0.9, 12);
    expect(p.BR).toBeCloseTo(0.15, 12);
    for (const id of LEG_IDS) expect(p[id]).toBeGreaterThanOrEqual(0);
    for (const id of LEG_IDS) expect(p[id]).toBeLessThan(1);
  });

  it('diagonal legs have equal angles in a pure trot, opposite legs differ', () => {
    const p = locomotionPose(0.17, 3.8);
    expect(Math.abs(p.legs.FL.upper - p.legs.BR.upper)).toBeLessThan(0.12);
    expect(Math.abs(p.legs.FL.upper - p.legs.FR.upper)).toBeGreaterThan(0.1);
  });
});

describe('locomotionPose', () => {
  it('is continuous in phase and in speed', () => {
    for (const speed of [0.3, 1, 2.8, 3.5, 4.8, 6]) {
      let prev = locomotionPose(0, speed);
      for (let ph = 0.005; ph <= 1.0001; ph += 0.005) {
        const cur = locomotionPose(ph, speed);
        expect(poseDistance(prev, cur)).toBeLessThan(0.35);
        prev = cur;
      }
    }
    for (const ph of [0, 0.3, 0.7]) {
      let prev = locomotionPose(ph, 0);
      for (let s = 0.01; s < 9; s += 0.01) {
        const cur = locomotionPose(ph, s);
        expect(poseDistance(prev, cur)).toBeLessThan(0.15);
        prev = cur;
      }
    }
  });

  it('at zero speed equals the idle pose and ignores phase', () => {
    const a = locomotionPose(0.1, 0, DEFAULT_TUNING, 0);
    const b = locomotionPose(0.8, 0, DEFAULT_TUNING, 0);
    expect(poseDistance(a, idlePose(0))).toBeLessThan(1e-9);
    expect(poseDistance(a, b)).toBeLessThan(1e-9);
  });

  it('swings more with speed', () => {
    const amp = (s: number) => {
      let m = 0;
      for (let ph = 0; ph < 1; ph += 0.02) m = Math.max(m, Math.abs(locomotionPose(ph, s).legs.FL.upper));
      return m;
    };
    expect(amp(1.5)).toBeLessThan(amp(3.8));
    expect(amp(3.8)).toBeLessThan(amp(8));
  });

  it('bobs the body (lift varies over a gallop cycle)', () => {
    const lifts: number[] = [];
    for (let ph = 0; ph < 1; ph += 0.02) lifts.push(locomotionPose(ph, 8).lift);
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeGreaterThan(0.05);
  });
});

describe('poses', () => {
  it('crouch lowers the body below idle and clamps k', () => {
    const idle = spineHeight(idlePose(0), dims);
    const full = spineHeight(crouchPose(1), dims);
    expect(full).toBeLessThan(idle - 0.1 * L);
    expect(spineHeight(crouchPose(7), dims)).toBeCloseTo(full, 12);
    expect(spineHeight(crouchPose(-1), dims)).toBeCloseTo(spineHeight(crouchPose(0), dims), 12);
    expect(spineHeight(crouchPose(NaN), dims)).toBeCloseTo(spineHeight(crouchPose(0), dims), 12);
  });

  it('pounce starts at the full crouch, peaks mid-arc, lands low and on the ground', () => {
    expect(poseDistance(pouncePose(0), crouchPose(1))).toBeLessThan(1e-9);
    expect(pouncePose(0).lift).toBeCloseTo(0, 12);
    expect(pouncePose(1).lift).toBeCloseTo(0, 12);
    expect(pouncePose(0.5).lift).toBeCloseTo(POUNCE_PEAK_LIFT, 12);
    expect(pouncePose(0.5).lift).toBeGreaterThan(pouncePose(0.25).lift);
    expect(pouncePose(0.25).lift).toBeCloseTo(pouncePose(0.75).lift, 12);
    expect(poseDistance(pouncePose(1), crouchPose(0.5))).toBeLessThan(1e-9);
    // Airborne: the body is higher than standing.
    expect(spineHeight(pouncePose(0.5), dims)).toBeGreaterThan(spineHeight(idlePose(0), dims));
  });

  it('pounce is continuous along the arc', () => {
    let prev = pouncePose(0);
    for (let u = 0.01; u <= 1.0001; u += 0.01) {
      const cur = pouncePose(u);
      expect(poseDistance(prev, cur)).toBeLessThan(0.2);
      prev = cur;
    }
  });

  it('howl raises the head, head lower drops it, relative to idle', () => {
    expect(howlPose(1).neck + howlPose(1).head).toBeGreaterThan(idlePose(0).neck + idlePose(0).head + 0.8);
    expect(headLowerPose(1).neck).toBeLessThan(idlePose(0).neck - 0.5);
    expect(howlPose(0).neck).toBeCloseTo(0, 12);
  });

  it('knockdown lies the body down on its side', () => {
    const k = knockdownPose(1);
    expect(k.fall).toBeCloseTo(1, 12);
    expect(k.roll).toBeGreaterThan(1.2);
    expect(spineHeight(k, dims)).toBeLessThan(spineHeight(idlePose(0), dims) * 0.7);
    expect(spineHeight(k, dims)).toBeGreaterThan(0);
    expect(knockdownPose(0).fall).toBe(0);
  });

  it('bite thrusts the head down and forward at the snap', () => {
    expect(bitePose(0.5).neck).toBeLessThan(bitePose(0).neck);
    expect(bitePose(0).neck).toBeCloseTo(0, 12);
    expect(bitePose(1).neck).toBeCloseTo(0, 12);
  });

  it('every pose keeps a standing or lying body above the ground (finite, positive height)', () => {
    const poses = [idlePose(1), crouchPose(1), pouncePose(0.3), howlPose(1, 2), headLowerPose(1), knockdownPose(0.6), bitePose(0.5), locomotionPose(0.4, 6)];
    for (const p of poses) {
      const h = spineHeight(p, dims);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });

  it('idle at rest grounds the feet at y = 0 (spine at rest height for straight legs)', () => {
    const straight: Pose = blendPose(idlePose(0), idlePose(0), 0);
    for (const id of LEG_IDS) {
      straight.legs[id].upper = 0;
      straight.legs[id].lower = 0;
    }
    straight.pitch = 0;
    straight.lift = 0;
    expect(spineHeight(straight, dims)).toBeCloseTo(dims.spineRestY, 12);
  });

  it('blendPose clamps k and does not alias its inputs', () => {
    const a = idlePose(0);
    const b = crouchPose(1);
    const m = blendPose(a, b, 0.5);
    expect(m.legs).not.toBe(a.legs);
    expect(poseDistance(blendPose(a, b, 5), b)).toBeLessThan(1e-12);
    expect(poseDistance(blendPose(a, b, -5), a)).toBeLessThan(1e-12);
    expect(poseDistance(blendPose(a, b, NaN), a)).toBeLessThan(1e-12);
  });
});
