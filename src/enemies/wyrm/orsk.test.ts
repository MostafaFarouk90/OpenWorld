import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ORSK, ORSK_BEATS, OrskScene, OrskSequence, orskPose, type OrskBeat, type OrskPorts } from './orsk';

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
