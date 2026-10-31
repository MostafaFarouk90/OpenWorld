import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { wyrmParams } from '../builder/params';
import { WYRM_PALETTES } from '../builder/palettes';
import { LOD_DISTANCES, lodDistances, restPose, WyrmRig, type RootFrame } from '../builder/rig';
import { lodFor } from '../WyrmBody';
import { HATHREN_PARAMS } from '../hathren/scene';

const DT = 1 / 60;
const ROOT: RootFrame = { x: 0, y: 0, z: 0, yaw: 0 };

function posed(rig: WyrmRig, ticks = 1, pose = restPose()): WyrmRig {
  const head = rig.headWorld(ROOT, 0, pose);
  rig.spine.reset(head, { x: 0, y: -0.3, z: 1 });
  for (let i = 0; i < ticks; i++) {
    rig.spine.step(DT, rig.headWorld(ROOT, 0, pose), { speed: 2, flying: false });
    rig.apply(ROOT, pose, DT);
  }
  return rig;
}

const matrices = (m: THREE.InstancedMesh) => [...(m.instanceMatrix.array as Float32Array)].slice(0, m.count * 16);

describe('builder extensions for large dragons (K6a)', () => {
  it('validates form, breath and collar, with land, flame and no collar by default', () => {
    expect(wyrmParams()).toMatchObject({ form: 'land', breath: 'flame', collar: false });
    expect(() => wyrmParams({ form: 'air' as never })).toThrow('form');
    expect(() => wyrmParams({ breath: 'acid' as never })).toThrow('breath');
  });

  it("Hathren's build: water form, no legs, short fin-wings, a thin frill, the teal palette", () => {
    const rig = posed(new WyrmRig(HATHREN_PARAMS));
    expect(rig.params).toMatchObject({ form: 'water', breath: 'water', legs: 'none', scale: 4.5 });
    expect(rig.legMesh).toBeNull();
    expect(rig.palette).toBe(WYRM_PALETTES.hathren);
    expect(rig.params.wingspan).toBeLessThan(1);
    // The frill blades are thin across and long along the body (land spikes are round).
    const m = new THREE.Matrix4();
    rig.spikeMesh!.getMatrixAt(0, m);
    const sx = new THREE.Vector3().setFromMatrixColumn(m, 0).length();
    const sz = new THREE.Vector3().setFromMatrixColumn(m, 2).length();
    expect(sz / sx).toBeGreaterThan(5);
    const land = posed(new WyrmRig({ scale: 4.5 }));
    land.spikeMesh!.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixColumn(m, 2).length() / new THREE.Vector3().setFromMatrixColumn(m, 0).length()).toBeCloseTo(1, 3);
    rig.dispose();
    land.dispose();
  });

  it('water breath sprays pale water and pale mist; flame stays orange', () => {
    const pose = { ...restPose(), breath: 1, breathReach: 20, jaw: 1 };
    const water = posed(new WyrmRig(HATHREN_PARAMS), 30, pose);
    const fire = posed(new WyrmRig({ scale: 4.5 }), 30, pose);
    const colours = (r: WyrmRig) => r.breathPoints.geometry.getAttribute('aColor').array as Float32Array;
    const firstLive = (r: WyrmRig) => {
      const c = colours(r);
      for (let i = 0; i < c.length / 4; i++) if (c[i * 4 + 3]! > 0) return [c[i * 4]!, c[i * 4 + 1]!, c[i * 4 + 2]!];
      return null;
    };
    expect(water.breathAlive).toBeGreaterThan(0);
    const w = firstLive(water)!;
    const f = firstLive(fire)!;
    expect(w[2]).toBeGreaterThan(0.8); // blue-white
    expect(f[2]).toBeLessThan(0.3); // orange
    water.dispose();
    fire.dispose();
  });

  it('a collar is drawn only when asked, round the neck', () => {
    const plain = posed(new WyrmRig());
    expect(plain.collarMesh).toBeNull();
    const drake = posed(new WyrmRig({ scale: 0.8, collar: true }));
    expect(drake.collarMesh).not.toBeNull();
    const neck = drake.joints.neck.position;
    const at = new THREE.Vector3().setFromMatrixPosition(drake.collarMesh!.matrix);
    expect(at.distanceTo(neck)).toBeLessThan(drake.spine.length * 0.2);
    plain.dispose();
    drake.dispose();
  });

  it('LOD distances scale with size: a 6x dragon keeps full detail to 240 m; 1x and smaller keep the Act 2 bands', () => {
    expect(lodDistances(1)).toEqual([...LOD_DISTANCES]);
    expect(lodDistances(0.35)).toEqual([...LOD_DISTANCES]);
    expect(lodDistances(6)).toEqual([240, 540]);
    expect(lodDistances(NaN)).toEqual([...LOD_DISTANCES]);
    expect(lodFor(100, 0, 1)).toBe(2);
    expect(lodFor(100, 0, 6)).toBe(0);
    expect(lodFor(300, 0, 6)).toBe(1);
  });

  it('a 6x build is deterministic, keeps 28 segments and the same draw calls per LOD as 1x', () => {
    const a = posed(new WyrmRig({ scale: 6, palette: 'cooled-slag', crest: true, seed: 7 }), 40);
    const b = posed(new WyrmRig({ scale: 6, palette: 'cooled-slag', crest: true, seed: 7 }), 40);
    expect(a.spineMesh.count).toBe(28);
    expect(matrices(a.spineMesh)).toEqual(matrices(b.spineMesh));
    const one = posed(new WyrmRig({ seed: 7 }), 1);
    for (const lod of [0, 1, 2]) {
      a.lod = lod;
      one.lod = lod;
      posed(a, 1);
      posed(one, 1);
      expect(a.drawCalls()).toEqual(one.drawCalls());
    }
    a.dispose();
    b.dispose();
    one.dispose();
  });

  it('a 6x dragon costs about what a 1x one does per tick (interleaved batches, medians; 1.5 ms on the reference machine is the plan note)', () => {
    const big = posed(new WyrmRig({ scale: 6, palette: 'cooled-slag', crest: true }));
    const small = posed(new WyrmRig());
    const pose = { ...restPose(), flap: 0.3, fold: 0.2 };
    let t = 0;
    const tick = (r: WyrmRig) => {
      t += DT;
      const head = r.headWorld({ x: Math.sin(t) * 3, y: 0, z: -t * 2, yaw: 0 }, 0, pose);
      r.spine.step(DT, head, { speed: 2, flying: false });
      r.apply({ x: Math.sin(t) * 3, y: 0, z: -t * 2, yaw: 0 }, pose, DT);
    };
    for (let i = 0; i < 60; i++) {
      tick(big);
      tick(small);
    }
    const batch = (r: WyrmRig) => {
      const s = performance.now();
      for (let i = 0; i < 120; i++) tick(r);
      return performance.now() - s;
    };
    const median = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1]!;
    const bigT: number[] = [];
    const smallT: number[] = [];
    for (let k = 0; k < 15; k++) {
      if (k % 2 === 0) {
        bigT.push(batch(big));
        smallT.push(batch(small));
      } else {
        smallT.push(batch(small));
        bigT.push(batch(big));
      }
    }
    console.info(`6x / 1x per-tick cost: ${(median(bigT) / median(smallT)).toFixed(2)}`);
    expect(median(bigT) / Math.max(1e-3, median(smallT))).toBeLessThan(1.35);
    big.dispose();
    small.dispose();
  });
});
