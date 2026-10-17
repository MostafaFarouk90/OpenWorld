import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, it } from 'vitest';

/**
 * Measurement tool for src/combat/hurtboxLayout.ts. Skipped in the normal run; use:
 *   MEASURE_HURTBOXES=1 npx vitest run src/combat/measureHurtboxes.measure.test.ts
 * Measures the bind pose (skeleton.pose()), no animation.
 */
const BONES = ['head', 'chest', 'upperarm.l', 'upperarm.r', 'lowerarm.l', 'lowerarm.r', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r'];
const WEAPON = /sword|shield/i;

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))];
const median = (a: number[]) => pct([...a].sort((x, y) => x - y), 0.5);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

describe.skipIf(!(globalThis as any).process?.env?.MEASURE_HURTBOXES)('measure Knight hurtboxes', () => {
  it('prints measured capsules', async () => {
    (globalThis as any).self ??= globalThis;
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    const scene: THREE.Object3D = gltf.scene;
    scene.updateMatrixWorld(true);

    const pts = new Map<string, THREE.Vector3[]>(BONES.map((b) => [b.replace(/\./g, ''), []]));
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (WEAPON.test(p.name)) return;
      m.skeleton.pose();
      scene.updateMatrixWorld(true);
      const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < pos.count; i++) {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = k; } }
        if (bw <= 0.5) continue;
        const bone = m.skeleton.bones[si.getComponent(i, best)];
        const list = pts.get(bone.name);
        if (!list) continue;
        m.getVertexPosition ? m.getVertexPosition(i, v) : v.fromBufferAttribute(pos as any, i);
        m.applyBoneTransform(i, v.fromBufferAttribute(pos as any, i));
        m.localToWorld(v);
        list.push(bone.worldToLocal(v.clone()));
      }
    });

    const out: any = {};
    for (const b of BONES) {
      const list = pts.get(b.replace(/\./g, ''))!;
      if (list.length < 20) { out[b] = { count: list.length, note: 'TOO FEW' }; continue; }
      const xs = list.map((p) => p.x), zs = list.map((p) => p.z), ys = list.map((p) => p.y);
      const mx = median(xs), mz = median(zs);
      const ox = Math.abs(mx) > 0.02 ? mx : 0, oz = Math.abs(mz) > 0.02 ? mz : 0;
      const rad = list.map((p) => Math.hypot(p.x - ox, p.z - oz)).sort((a, c) => a - c);
      const radius = pct(rad, 0.9);
      const ymin = Math.min(...ys), ymax = Math.max(...ys);
      let y0 = ymin + radius, y1 = ymax - radius;
      if (y1 < y0) { const c = (ymin + ymax) / 2; y0 = c - 0.01; y1 = c + 0.01; } // collapsed: short segment on the extent centre
      out[b] = { count: list.length, ymin: r4(ymin), ymax: r4(ymax), radius: r4(radius), ox: r4(ox), oz: r4(oz), start: [r4(ox), r4(y0), r4(oz)], end: [r4(ox), r4(y1), r4(oz)] };
    }
    for (const [b, o] of Object.entries<any>(out)) console.log('HURTBOX ' + b + ' ' + JSON.stringify(o));
  });
});
