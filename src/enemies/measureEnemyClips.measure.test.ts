import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { ENEMY_ATTACKS, ENEMY_CLIPS } from './clips';
import { ASH_WRAITH, BLIGHTED_SOLDIER } from './defs';
import { buildEnemyModel, type EnemyModel } from './EnemyModel';
import type { EnemyDef } from './types';

/**
 * Measurement tool for the windows in src/enemies/clips.ts. Skipped in the normal run; use:
 *   MEASURE_ENEMY_CLIPS=1 npx vitest run src/enemies/measureEnemyClips.measure.test.ts
 *
 * RULE (as knightClips.ts was measured from the sword tip): build the enemy with buildEnemyModel, play the clip
 * alone on a mixer at 1/60 s ticks, and take the world speed of the move's channel tip (the claw tip, the
 * sword tip, or the shield's far edge) between consecutive ticks. The window spans the ticks whose speed is at
 * least 45% of the clip's peak, taking the run around the peak tick (gaps up to 2 ticks bridged): activeStart = the normalised time of the tick before the first fast tick (the
 * sweep runs from there), activeEnd = the last fast tick, each widened by 0.01 and rounded to 2 decimals.
 */
const THRESHOLD = 0.45;
const MARGIN = 0.01;
const GAP = 2;

/** Extra clips measured to judge the choices (printed only). */
const CANDIDATES: Array<{ clip: string; def: EnemyDef; channel: 'right' | 'left' }> = [
  { clip: '1H_Melee_Attack_Slice_Horizontal', def: ASH_WRAITH, channel: 'right' },
  { clip: '2H_Melee_Attack_Slice', def: ASH_WRAITH, channel: 'right' },
  { clip: '2H_Melee_Attack_Spinning', def: ASH_WRAITH, channel: 'right' },
  { clip: 'Unarmed_Melee_Attack_Punch_A', def: ASH_WRAITH, channel: 'right' },
  { clip: '1H_Melee_Attack_Slice_Diagonal', def: BLIGHTED_SOLDIER, channel: 'right' },
  { clip: 'Block_Attack', def: BLIGHTED_SOLDIER, channel: 'right' },
];

async function loadKnight(): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
}

interface Measured {
  activeStart: number;
  activeEnd: number;
  peak: number;
  ticks: number;
  profile: string;
}

function measure(model: EnemyModel, clip: THREE.AnimationClip, channel: 'right' | 'left'): Measured {
  const mixer = new THREE.AnimationMixer(model.owner);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const tip = model.weapons[channel]!.tip;
  const ticks = Math.round(clip.duration / FIXED_TIMESTEP);
  const pos = new THREE.Vector3();
  const prev = new THREE.Vector3();
  mixer.update(0);
  model.root.updateMatrixWorld(true);
  tip.getWorldPosition(prev);
  const speeds: number[] = [];
  for (let i = 1; i <= ticks; i++) {
    mixer.update(FIXED_TIMESTEP);
    model.root.updateMatrixWorld(true);
    tip.getWorldPosition(pos);
    speeds.push(pos.distanceTo(prev) / FIXED_TIMESTEP);
    prev.copy(pos);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model.owner);
  const peak = Math.max(...speeds);
  // The strike is the run of fast ticks around the peak tick; gaps of up to GAP ticks are bridged, so a
  // wind-up flick earlier in the clip is not mistaken for the strike.
  const peakAt = speeds.indexOf(peak);
  const fastAt = (i: number) => i >= 0 && i < speeds.length && speeds[i] >= THRESHOLD * peak;
  const reach = (from: number, step: number): number => {
    let edge = from;
    for (let i = from + step; i >= 0 && i < speeds.length; i += step) {
      if (fastAt(i)) edge = i;
      else if (Math.abs(i - edge) > GAP) break;
    }
    return edge;
  };
  // speeds[i] is the motion from tick i to tick i + 1, i.e. normalised time i/ticks to (i+1)/ticks.
  const first = reach(peakAt, -1);
  const last = reach(peakAt, 1);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const activeStart = r2(Math.max(0, first / ticks - MARGIN));
  const activeEnd = r2(Math.min(1, (last + 1) / ticks + MARGIN));
  const profile = speeds.map((s) => (s / peak >= THRESHOLD ? '#' : s / peak >= 0.2 ? '+' : '.')).join('');
  return { activeStart, activeEnd, peak: Math.round(peak * 100) / 100, ticks, profile: profile + ` peak tick ${peakAt}` };
}

describe.skipIf(!(globalThis as any).process?.env?.MEASURE_ENEMY_CLIPS)('measure enemy clips', () => {
  it('prints measured windows and checks clip names', async () => {
    const gltf = await loadKnight();
    const byName = new Map(gltf.animations.map((c) => [c.name, c]));
    const missing = Object.values(ENEMY_CLIPS).filter((n) => !byName.has(n));
    console.log('ENEMY_CLIPS missing from Knight.glb: ' + (missing.length ? missing.join(', ') : 'none'));
    expect(missing).toEqual([]);

    const model = (def: EnemyDef) =>
      buildEnemyModel({ model: SkeletonUtils.clone(gltf.scene), clips: gltf.animations }, def);
    const wraith = model(ASH_WRAITH);
    const soldier = model(BLIGHTED_SOLDIER);
    const uses: Record<keyof typeof ENEMY_ATTACKS, { m: EnemyModel; channels: Array<'right' | 'left'> }> = {
      wraithClaw: { m: wraith, channels: ['right'] },
      wraithSweep: { m: wraith, channels: ['right'] },
      wraithGrab: { m: wraith, channels: ['right'] },
      soldierChop: { m: soldier, channels: ['right'] },
      soldierBash: { m: soldier, channels: ['left', 'right'] },
    };
    const line = (label: string, clip: THREE.AnimationClip, r: Measured) =>
      console.log(
        `ENEMY CLIP ${label} ${clip.name} duration=${clip.duration.toFixed(3)} ticks=${r.ticks} peak=${r.peak} m/s ` +
          `window=[${r.activeStart}, ${r.activeEnd}]\n  ${r.profile}`,
      );
    for (const [key, entry] of Object.entries(ENEMY_ATTACKS) as Array<[keyof typeof ENEMY_ATTACKS, (typeof ENEMY_ATTACKS)[keyof typeof ENEMY_ATTACKS]]>) {
      const clip = byName.get(entry.clip);
      expect(clip, entry.clip).toBeDefined();
      for (const ch of uses[key].channels) line(`${key}/${ch}`, clip!, measure(uses[key].m, clip!, ch));
    }
    for (const c of CANDIDATES) {
      const clip = byName.get(c.clip);
      if (!clip) continue;
      line(`candidate/${c.def.kind}/${c.channel}`, clip, measure(c.def === ASH_WRAITH ? wraith : soldier, clip, c.channel));
    }
  });
});
