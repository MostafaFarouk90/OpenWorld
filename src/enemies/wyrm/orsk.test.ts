import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WYRM_SHAPE } from './builder/params';
import { restPose, WYRM_JOINTS, WyrmRig, type RootFrame } from './builder/rig';
import { ORSK, ORSK_BEATS, ORSK_PARAMS, OrskScene, OrskSequence, orskPose, type OrskBeat, type OrskPorts } from './orsk';
import { WYRMLING } from './tuning';

const DT = 1 / 60;

function ports(opts: { camera?: boolean } = {}) {
  const log: string[] = [];
  const beats: OrskBeat[] = [];
  const scene = new THREE.Scene();
  const p: OrskPorts = {
    scene,
    freezePlayer: (s) => {
      log.push(`freeze:${s}`);
      return () => log.push('unfreeze');
    },
    cutscene: (s) => {
      log.push(`cutscene:${s}`);
      return () => log.push('uncutscene');
    },
    camera: (shot) => {
      if (opts.camera === false) return null;
      log.push('camera');
      // The shot's functions stay callable for the whole sequence.
      expect(Number.isFinite((typeof shot.lookAt === 'function' ? shot.lookAt() : shot.lookAt).y)).toBe(true);
      return { release: () => log.push('release') };
    },
    beat: (b) => beats.push(b),
    sfx: (k) => log.push(`sfx:${k}`),
    shake: () => log.push('shake'),
  };
  return { p, log, beats, scene };
}

const REQ = { position: { x: 4000, y: 30, z: -3500 }, yaw: 0.4, roofHeight: 9 };

describe('OrskSequence', () => {
  it('fires each beat once, in order, at its time', () => {
    const s = new OrskSequence();
    const fired: Array<[OrskBeat, number]> = [];
    while (!s.done) for (const b of s.step(DT)) fired.push([b, s.time]);
    expect(fired.map((f) => f[0])).toEqual(ORSK_BEATS.map((b) => b.beat));
    for (const [b, t] of fired) {
      const at = ORSK_BEATS.find((x) => x.beat === b)!.at;
      expect(t).toBeGreaterThanOrEqual(at - 1e-9);
      expect(t - at).toBeLessThan(DT + 1e-9);
    }
    expect(s.step(DT)).toEqual([]);
    expect(s.skip()).toEqual([]);
  });

  it('skip mid-way returns each remaining beat once; a bad dt does nothing', () => {
    const s = new OrskSequence();
    expect(s.step(Number.NaN)).toEqual([]);
    expect(s.step(-1)).toEqual([]);
    let seen: OrskBeat[] = [];
    for (let i = 0; i < Math.round(3 / DT); i++) seen = seen.concat(s.step(DT));
    expect(seen).toEqual(['started', 'chainsBroken']);
    expect(s.skip()).toEqual(['roar', 'roofBurst', 'gone']);
    expect(s.done).toBe(true);
  });

  it('the pose: on the floor until the launch, at the roof at roofBurst, then on up', () => {
    expect(orskPose(1, 9).altitude).toBe(0);
    expect(orskPose(ORSK.launchAt - 0.01, 9).altitude).toBe(0);
    expect(orskPose(5.4, 9).altitude).toBeCloseTo(8, 5);
    expect(orskPose(6.0, 9).altitude).toBeGreaterThan(9 + ORSK.hideAbove);
    expect(orskPose(3.1, 9).pose.mouth).toBeGreaterThan(0.8);
  });
});

describe('OrskScene', () => {
  it('takes the freeze, the cutscene context and the camera; plays every beat; gives them all back on gone', async () => {
    const { p, log, beats, scene } = ports();
    const o = new OrskScene(p, REQ);
    expect(log).toEqual(['freeze:wyrm.orsk', 'cutscene:wyrm.orsk', 'camera']);
    expect(scene.getObjectByName('orsk')).toBeDefined();
    expect(scene.getObjectByName('orsk')!.position.x).toBe(4000);
    const chains = () => {
      const out: THREE.Object3D[] = [];
      scene.traverse((x) => x.name === 'orsk-chain' && x.visible && out.push(x));
      return out;
    };
    expect(chains()).toHaveLength(4);
    let hiddenAt = -1;
    for (let i = 0; i < Math.round(7 / DT) && o.playing; i++) {
      o.fixedUpdate(DT);
      if (hiddenAt < 0 && scene.getObjectByName('orsk') && !scene.getObjectByName('orsk')!.visible) hiddenAt = o.time;
      if (beats.includes('chainsBroken') && !beats.includes('gone')) expect(chains()).toHaveLength(0);
    }
    expect(beats).toEqual(['started', 'chainsBroken', 'roar', 'roofBurst', 'gone']);
    // Hidden once past roof + 2 (before `gone`, 6.4 s).
    expect(hiddenAt).toBeGreaterThan(5.4);
    expect(hiddenAt).toBeLessThan(6.4);
    await o.done;
    expect(log).toContain('sfx:sfx.wyrm.roar');
    expect(log.slice(-3)).toEqual(['release', 'uncutscene', 'unfreeze']);
    expect(scene.getObjectByName('orsk')).toBeUndefined();
    // Idempotent afterwards.
    o.skip();
    o.dispose();
    expect(beats).toHaveLength(5);
  });

  it('skip: the remaining beats once, in order, then done and undone', async () => {
    const { p, log, beats } = ports();
    const o = new OrskScene(p, REQ);
    for (let i = 0; i < Math.round(2.5 / DT); i++) o.fixedUpdate(DT);
    o.skip();
    expect(beats).toEqual(['started', 'chainsBroken', 'roar', 'roofBurst', 'gone']);
    await o.done;
    expect(log).toContain('unfreeze');
    expect(o.playing).toBe(false);
  });

  it('skip before the first tick still emits started first', () => {
    const { p, beats } = ports();
    new OrskScene(p, REQ).skip();
    expect(beats).toEqual(['started', 'chainsBroken', 'roar', 'roofBurst', 'gone']);
  });

  it('a beat listener that skips mid-fire: every beat still fires exactly once', () => {
    const { p, beats } = ports();
    let o: OrskScene | null = null;
    const beat = p.beat;
    p.beat = (b) => {
      beat(b);
      if (b === 'started') o!.skip();
    };
    o = new OrskScene(p, REQ);
    o.fixedUpdate(DT);
    o.fixedUpdate(DT);
    expect(beats).toEqual(['started', 'chainsBroken', 'roar', 'roofBurst', 'gone']);
  });

  it('headless (no camera): still every beat, and done resolves', async () => {
    const { p, beats } = ports({ camera: false });
    const o = new OrskScene(p, REQ);
    for (let i = 0; i < Math.round(7 / DT); i++) o.fixedUpdate(DT);
    await o.done;
    expect(beats).toHaveLength(5);
  });

  it('dispose (teardown) undoes everything without the remaining beats', async () => {
    const { p, log, beats, scene } = ports();
    const o = new OrskScene(p, REQ);
    o.fixedUpdate(DT);
    o.dispose();
    await o.done;
    expect(beats).toEqual(['started']);
    expect(log.slice(-3)).toEqual(['release', 'uncutscene', 'unfreeze']);
    expect(scene.getObjectByName('orsk')).toBeUndefined();
  });
});

// ---- Orsk's proportions (act2 follow-up: at 3x his legs read as stilts) ----

const ORIGIN: RootFrame = { x: 0, y: 0, z: 0, yaw: 0 };

/** A rig standing at rest at the origin, settled for a few ticks. */
function standing(rig: WyrmRig): WyrmRig {
  const pose = restPose();
  rig.resetSpine(ORIGIN, 0, pose);
  for (let i = 0; i < 5; i++) {
    rig.spine.step(DT, rig.headWorld(ORIGIN, 0, pose), { speed: 0, flying: false });
    rig.apply(ORIGIN, pose, DT);
  }
  return rig;
}

/** Rig-local bounds of the legs and of the body (spine), and the stance ratio: leg showing under the belly / body depth. */
function stance(rig: WyrmRig) {
  rig.legMesh!.computeBoundingBox();
  rig.spineMesh.computeBoundingBox();
  const legs = rig.legMesh!.boundingBox!.clone();
  const body = rig.spineMesh.boundingBox!.clone();
  return { legs, body, ratio: (body.min.y - legs.min.y) / (body.max.y - body.min.y) };
}

const EMBER_BUILD = {};
const WYRMLING_BUILD = { scale: WYRMLING.scale, segments: WYRMLING.segments, palette: 'wyrmling', legs: 'small', spikes: false } as const;

describe("Orsk's build", () => {
  it('sits heavy: a lower body on shorter, thicker legs than the Ember Wyrm, scaled up', () => {
    const orsk = standing(new WyrmRig(ORSK_PARAMS));
    const ember = standing(new WyrmRig(EMBER_BUILD));
    const o = stance(orsk);
    const e = stance(ember);
    // Leg showing under the belly, as a share of the body's depth: about 1 for the Ember Wyrm (and Orsk before
    // the fix, a uniform 3x of it), well under that for Orsk now.
    expect(e.ratio).toBeGreaterThan(0.95);
    expect(o.ratio).toBeLessThan(0.7);
    expect(o.ratio).toBeLessThan(e.ratio * 0.7);
    // Leg length and thickness against the chest radius.
    const legToChest = (p: { legScale?: number }) => (WYRM_SHAPE.legLength * (p.legScale ?? 1)) / WYRM_SHAPE.chestRadius;
    expect(legToChest(ORSK_PARAMS)).toBeLessThan(legToChest({}) * 0.8);
    expect(ORSK_PARAMS.legGirth!).toBeGreaterThanOrEqual(1.5);
    // The body rides lower than a uniform 3x Ember Wyrm: the belly is under half its old height.
    expect(o.body.min.y).toBeLessThan(e.body.min.y * ORSK.scale * 0.5);
    // Shorter legs still plant the feet (the old 3x build floated them 0.56 m up).
    expect(o.legs.min.y).toBeLessThanOrEqual(0.05);
    expect(o.legs.min.y).toBeGreaterThan(-0.09 * ORSK.scale * ORSK_PARAMS.legGirth!);
    orsk.dispose();
    ember.dispose();
  });

  it('only Orsk changes: the Ember Wyrm and the wyrmling keep their stance exactly (default proportions 1)', () => {
    const ember = standing(new WyrmRig(EMBER_BUILD));
    expect(ember.params).toMatchObject({ stance: 1, legScale: 1, legGirth: 1 });
    expect(ember.headWorld(ORIGIN, 0, restPose()).y).toBe(WYRM_SHAPE.headHeight);
    const e = stance(ember);
    // Pinned from main before the change.
    expect(e.legs.min.y).toBeCloseTo(0.1862, 3);
    expect(e.legs.max.y).toBeCloseTo(1.1682, 3);
    expect(e.body.min.y).toBeCloseTo(0.8935, 3);
    expect(e.body.max.y).toBeCloseTo(1.6065, 3);
    const ling = standing(new WyrmRig(WYRMLING_BUILD));
    expect(ling.params).toMatchObject({ stance: 1, legScale: 1, legGirth: 1 });
    const w = stance(ling);
    expect(w.legs.min.y).toBeCloseTo(0.1626, 3);
    expect(w.legs.max.y).toBeCloseTo(0.4057, 3);
    expect(w.body.min.y).toBeCloseTo(0.3124, 3);
    expect(w.body.max.y).toBeCloseTo(0.5626, 3);
    // An explicit default build draws the very same matrices.
    const explicit = standing(new WyrmRig({ stance: 1, legScale: 1, legGirth: 1 }));
    expect([...(explicit.legMesh!.instanceMatrix.array as Float32Array)]).toEqual([...(ember.legMesh!.instanceMatrix.array as Float32Array)]);
    expect([...(explicit.spineMesh.instanceMatrix.array as Float32Array)]).toEqual([...(ember.spineMesh.instanceMatrix.array as Float32Array)]);
    // Orsk keeps his size: 3x the length, the same hurtbox radii as a 3x build.
    const orsk = new WyrmRig(ORSK_PARAMS);
    expect(orsk.spine.length).toBeCloseTo(ember.spine.length * ORSK.scale, 9);
    const plain3x = new WyrmRig({ scale: ORSK.scale, palette: 'orsk', seed: 28 });
    expect(orsk.jointSize).toEqual(plain3x.jointSize);
    for (const r of [ember, ling, explicit, orsk, plain3x]) r.dispose();
  });

  it('the hurtbox capsules still cover the lowered body and stay above the floor', () => {
    const rig = standing(new WyrmRig(ORSK_PARAMS));
    const { body } = stance(rig);
    const capsules = WYRM_JOINTS.filter((j) => !j.startsWith('wing')).map((name) => {
      const o = rig.joints[name];
      const { half, radius } = rig.jointSize[name];
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
      return { name, a: o.position.clone().addScaledVector(axis, -half), b: o.position.clone().addScaledVector(axis, half), radius };
    });
    const seg = new THREE.Line3();
    const near = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const centre = new THREE.Vector3();
    for (let i = 0; i < rig.spineMesh.count; i++) {
      rig.spineMesh.getMatrixAt(i, m);
      centre.setFromMatrixPosition(m);
      const inside = capsules.some((c) => seg.set(c.a, c.b).closestPointToPoint(centre, true, near).distanceTo(centre) <= c.radius);
      expect(inside, `segment ${i} at y ${centre.y.toFixed(2)}`).toBe(true);
    }
    // The torso and belly reach the belly's underside, and no capsule sinks into the floor.
    const low = (n: string) => {
      const c = capsules.find((x) => x.name === n)!;
      return Math.min(c.a.y, c.b.y) - c.radius;
    };
    expect(Math.min(low('torso'), low('belly'))).toBeLessThanOrEqual(body.min.y);
    for (const c of capsules) expect(Math.min(c.a.y, c.b.y) - c.radius, c.name).toBeGreaterThanOrEqual(0);
    rig.dispose();
  });

  it('the set piece still fits the gallery: under the roof before the launch, through it at roofBurst', () => {
    for (const roofHeight of [8, 9]) {
      const { p, scene } = ports({ camera: false });
      const o = new OrskScene(p, { ...REQ, roofHeight });
      const top = () => {
        o.rig.spineMesh.computeBoundingBox();
        return o.rig.spineMesh.boundingBox!.max.y;
      };
      let maxBefore = 0;
      while (o.time < ORSK.launchAt - DT) {
        o.fixedUpdate(DT);
        maxBefore = Math.max(maxBefore, top(), o.rig.headPivot.position.y);
      }
      expect(maxBefore).toBeLessThan(roofHeight - 1);
      while (o.time < ORSK_BEATS.find((b) => b.beat === 'roofBurst')!.at - 1e-9) o.fixedUpdate(DT);
      expect(o.rig.headPivot.position.y).toBeGreaterThan(roofHeight);
      expect(scene.getObjectByName('orsk')!.visible).toBe(true);
      o.dispose();
    }
  });
});
