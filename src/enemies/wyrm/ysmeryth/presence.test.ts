import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { YSMERYTH_IDS } from './def';
import { YsmerythPresence } from './presence';
import { YSMERYTH_SCENE, type PoseMark, type YsmerythPose } from './scene';

const MARKS: Record<YsmerythPose, PoseMark> = {
  perch: { x: 0, y: 40, z: 0, yaw: 0 },
  land: { x: 30, y: 30, z: 0, yaw: 1 },
  reveal: { x: 30, y: 30, z: 5, yaw: 1 },
  oath: { x: 30, y: 30, z: 5, yaw: 1.2 },
};

function rig(opts: { m31?: boolean; marks?: Partial<Record<YsmerythPose, PoseMark>> } = {}) {
  const scene = new THREE.Scene();
  const flags = { m31: opts.m31 ?? false, trial: false };
  const poses: YsmerythPose[] = [];
  const warns: string[] = [];
  const marks = opts.marks ?? MARKS;
  const byId = Object.fromEntries(Object.entries(marks).map(([k, v]) => [YSMERYTH_IDS.hearth[k as YsmerythPose], v]));
  const p = new YsmerythPresence({
    scene,
    getBool: (k) => k === YSMERYTH_IDS.m31Complete && flags.m31,
    anchor: (id) => byId[id],
    trialRunning: () => flags.trial,
    emitPose: (pose) => void poses.push(pose),
    warn: (m) => void warns.push(m),
  });
  const tick = (s: number) => {
    for (let i = 0; i < Math.round(s * 60); i++) p.tick(1 / 60);
  };
  return { p, scene, flags, poses, warns, tick, inScene: () => scene.getObjectByName('ysmeryth') !== undefined };
}

describe("Ysmeryth's Hearth presence (K6a PR 2)", () => {
  it('absent before M31; perched at the Hearth once story.m31.complete is set (derived, never saved)', () => {
    const r = rig();
    r.tick(0.1);
    expect(r.inScene()).toBe(false);
    r.flags.m31 = true;
    r.tick(0.1);
    expect(r.p.pose).toBe('perch');
    expect(r.inScene()).toBe(true);
    expect(r.p.current!.at).toMatchObject({ x: 0, y: 40, z: 0 });
    expect(r.poses).toEqual(['perch']);
  });

  it('K13 poses: she flies between marks in about flightSeconds and settles on the mark; same-spot poses switch in place', () => {
    const r = rig({ m31: true });
    r.tick(0.1);
    expect(r.p.show('land')).toBe(true);
    r.tick(0.5);
    expect(r.p.current!.flying).toBe(true);
    expect(r.p.current!.at.y).toBeGreaterThan(40);
    r.tick(YSMERYTH_SCENE.flightSeconds);
    expect(r.p.current!.flying).toBe(false);
    expect(r.p.current!.at).toMatchObject({ x: 30, y: 30, z: 0, yaw: 1 });
    r.p.show('reveal');
    r.tick(YSMERYTH_SCENE.flightSeconds + 0.5);
    r.p.show('oath');
    r.tick(0.1);
    expect(r.p.current!.flying).toBe(false);
    expect(r.p.pose).toBe('oath');
    expect(r.poses).toEqual(['perch', 'land', 'reveal', 'oath']);
  });

  it('absent while the trial runs; hide holds until a load, which goes back to the derived perch', () => {
    const r = rig({ m31: true });
    r.tick(0.1);
    r.flags.trial = true;
    r.tick(0.1);
    expect(r.inScene()).toBe(false);
    r.flags.trial = false;
    r.p.hide();
    r.tick(0.1);
    expect(r.inScene()).toBe(false);
    r.p.onLoaded();
    expect(r.p.pose).toBe('perch');
    r.p.show('oath');
    r.p.onLoaded();
    expect(r.p.pose).toBe('perch');
    expect(r.p.current!.flying).toBe(false);
  });

  it('failure: a missing Hearth anchor refuses the pose and warns once; dispose removes the rig', () => {
    const r = rig({ m31: true, marks: { perch: MARKS.perch } });
    r.tick(0.1);
    expect(r.p.show('oath')).toBe(false);
    expect(r.p.show('reveal')).toBe(false);
    expect(r.warns).toHaveLength(1);
    expect(r.p.pose).toBe('perch');
    r.p.dispose();
    expect(r.inScene()).toBe(false);
  });
});
