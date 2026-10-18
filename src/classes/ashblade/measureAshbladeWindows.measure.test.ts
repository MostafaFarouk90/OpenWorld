import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { ASHBLADE_ATTACKS } from './attackSet';

/**
 * Measurement tool for the windows in attackSet.ts. Skipped in the normal run; use:
 *   MEASURE_ASHBLADE=1 npx vitest run src/classes/ashblade/measureAshbladeWindows.measure.test.ts
 *
 * Same rule as src/enemies/measureEnemyClips.measure.test.ts: play the clip alone at 1/60 s ticks on Rogue.glb and take the
 * world speed of the knife tips (`Knife`, and `Knife_Offhand` for dual clips; the faster of the two). The window spans the
 * ticks at or above 45% of the peak speed around the peak (gaps up to 2 ticks bridged): activeStart is the normalised time of
 * the tick before the first fast tick, activeEnd the last fast tick, each widened by 0.01 and rounded to 2 decimals.
 */
const THRESHOLD = 0.45;
const MARGIN = 0.01;
const GAP = 2;

describe.skipIf(!(globalThis as any).process?.env?.MEASURE_ASHBLADE)('measure Ashblade attack windows', () => {
  it('prints the windows', async () => {
    (globalThis as any).self ??= globalThis;
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Rogue.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    const scene: THREE.Object3D = gltf.scene;
    const tips = ['Knife', 'Knife_Offhand'].map((name) => {
      const mesh = scene.getObjectByName(name) as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!;
      return { mesh, local: new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2) };
    });
    for (const def of ASHBLADE_ATTACKS) {
      const clip = (gltf.animations as THREE.AnimationClip[]).find((c) => c.name === def.clip)!;
      const mixer = new THREE.AnimationMixer(scene);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      const dual = def.clip.startsWith('Dualwield');
      const used = dual ? tips : tips.slice(0, 1);
      const n = Math.round(clip.duration / FIXED_TIMESTEP);
      const prev = used.map(() => new THREE.Vector3());
      const pos = new THREE.Vector3();
      mixer.update(0);
      scene.updateMatrixWorld(true);
      used.forEach((t, i) => prev[i].copy(t.local).applyMatrix4(t.mesh.matrixWorld));
      const speeds: number[] = [];
      for (let k = 1; k <= n; k++) {
        mixer.update(FIXED_TIMESTEP);
        scene.updateMatrixWorld(true);
        let best = 0;
        used.forEach((t, i) => {
          pos.copy(t.local).applyMatrix4(t.mesh.matrixWorld);
          best = Math.max(best, pos.distanceTo(prev[i]) / FIXED_TIMESTEP);
          prev[i].copy(pos);
        });
        speeds.push(best);
      }
      const peak = Math.max(...speeds);
      const peakAt = speeds.indexOf(peak);
      const fast = speeds.map((s) => s >= peak * THRESHOLD);
      let lo = peakAt;
      let hi = peakAt;
      for (let i = peakAt - 1, gap = 0; i >= 0 && gap <= GAP; i--) fast[i] ? ((lo = i), (gap = 0)) : gap++;
      for (let i = peakAt + 1, gap = 0; i < n && gap <= GAP; i++) fast[i] ? ((hi = i), (gap = 0)) : gap++;
      const start = (lo - 1) / n;
      const profile = speeds.map((v, i) => (v >= peak * 0.25 ? `${(i / n).toFixed(2)}:${v.toFixed(0)}` : '')).filter(Boolean).join(' ');
      console.log(`PROFILE ${def.clip} ${profile}`);
      const r2 = (x: number) => Math.round(x * 100) / 100;
      console.log(`WINDOW ${def.clip} duration ${clip.duration.toFixed(3)} peak ${peak.toFixed(2)} m/s start ${r2(Math.max(0, start - MARGIN))} end ${r2(Math.min(1, (hi + 1) / n + MARGIN))}`);
    }
  });
});
