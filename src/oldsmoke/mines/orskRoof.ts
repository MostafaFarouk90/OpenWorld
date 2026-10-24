import * as THREE from 'three';
import { layoutInterior } from '../../interiors/layout';
import type { CoreContext as Ctx } from '../../region/coreTypes';
import { heightAt } from '../../terrain/heightfield';
import '../../enemies/wyrm/events';
import { LOWER_GALLERIES_DEF, LOWER_GALLERIES_ID, M20_HALL_RECT, M20_ROOF_HEIGHT } from './lowerGalleries';

export const ORSK_GONE_FLAG = 'story.m20.orskGone';
/** Seconds the broken roof's chunks fall before they are removed. */
export const ROOF_DEBRIS_SECONDS = 2;
const SLAB_THICKNESS = 0.8;
const CHUNKS = 14;
const GRAVITY = 14;
const ROCK = 0x3a3632;

/** The roof as pure state: whether the slab is up, and how long the debris has fallen (null: none falling). */
export interface RoofState {
  present: boolean;
  debris: number | null;
}

/** Roof for a given `story.m20.orskGone`: absent when Orsk is gone, and no debris (a load never replays the burst). */
export const roofFor = (orskGone: boolean): RoofState => ({ present: !orskGone, debris: null });

/** `roofBurst`: the slab goes and the debris starts; a roof already gone stays gone with no new debris. */
export function roofBurst(s: RoofState): RoofState {
  return s.present ? { present: false, debris: 0 } : s;
}

/** Advances the debris clock; it ends after `ROOF_DEBRIS_SECONDS`. Bad or negative `dt` changes nothing. */
export function roofStep(s: RoofState, dt: number): RoofState {
  if (s.debris === null || !(dt > 0) || !Number.isFinite(dt)) return s;
  const t = s.debris + dt;
  return { present: s.present, debris: t >= ROOF_DEBRIS_SECONDS ? null : t };
}

/** Whether anything of the roof (slab or falling chunks) is drawn. */
export const roofDrawn = (s: RoofState): boolean => s.present || s.debris !== null;

/** Cheap fixed hash in [0, 1) so the chunks fall the same way every time. */
const unit = (i: number, k: number): number => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Chunk `i` after `t` seconds of falling, in hall-local metres (y above the floor). */
export function chunkPose(i: number, t: number): { x: number; y: number; z: number; scale: number; spin: number } {
  const w = M20_HALL_RECT.x1 - M20_HALL_RECT.x0;
  const d = M20_HALL_RECT.z1 - M20_HALL_RECT.z0;
  const x = M20_HALL_RECT.x0 + 3 + unit(i, 1) * (w - 6);
  const z = M20_HALL_RECT.z0 + 3 + unit(i, 2) * (d - 6);
  const scale = 0.5 + unit(i, 3) * 1.1;
  const y = Math.max(scale / 2, M20_ROOF_HEIGHT - 0.5 * GRAVITY * t * t);
  return { x, y, z, scale, spin: (unit(i, 4) - 0.5) * 6 * t };
}

/** The Lower Galleries' low rock roof over the M20 hall; Orsk bursts through it. Returns the undo. */
export function registerOrskRoof(ctx: Ctx): () => void {
  const origin = layoutInterior(LOWER_GALLERIES_DEF, heightAt).origin;
  // Everything hangs off one group at the interior's origin, so the children stay small whatever the world offset (far-coordinate rule).
  const group = new THREE.Group();
  group.name = 'orsk-roof';
  group.position.set(origin.x, origin.y, origin.z);

  const material = new THREE.MeshStandardMaterial({ color: ROCK, roughness: 0.95, metalness: 0 });
  const slabGeo = new THREE.BoxGeometry(M20_HALL_RECT.x1 - M20_HALL_RECT.x0, SLAB_THICKNESS, M20_HALL_RECT.z1 - M20_HALL_RECT.z0);
  const slab = new THREE.Mesh(slabGeo, material);
  slab.name = 'orsk-roof-slab';
  slab.position.set((M20_HALL_RECT.x0 + M20_HALL_RECT.x1) / 2, M20_ROOF_HEIGHT + SLAB_THICKNESS / 2, (M20_HALL_RECT.z0 + M20_HALL_RECT.z1) / 2);
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const chunks = new THREE.InstancedMesh(chunkGeo, material, CHUNKS);
  chunks.name = 'orsk-roof-debris';
  chunks.frustumCulled = false;
  chunks.visible = false;
  group.add(slab, chunks);
  group.visible = false;
  ctx.scene.add(group);

  let state = roofFor(ctx.state.getBool(ORSK_GONE_FLAG));
  const dummy = new THREE.Object3D();

  const inside = () => ctx.services.get('interiors')?.current === LOWER_GALLERIES_ID;
  const sync = () => {
    slab.visible = state.present;
    chunks.visible = state.debris !== null;
    group.visible = roofDrawn(state) && inside();
  };
  const poseChunks = () => {
    if (state.debris === null) return;
    for (let i = 0; i < CHUNKS; i++) {
      const p = chunkPose(i, state.debris);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.spin, p.spin * 0.7, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      chunks.setMatrixAt(i, dummy.matrix);
    }
    chunks.instanceMatrix.needsUpdate = true;
  };
  const reload = () => {
    state = roofFor(ctx.state.getBool(ORSK_GONE_FLAG));
    sync();
  };
  sync();

  const offs = [
    ctx.events.on('wyrm.orsk', ({ beat }) => {
      if (beat !== 'roofBurst') return;
      state = roofBurst(state);
      poseChunks();
      sync();
    }),
    // Orsk gone set live without a burst (a skip that bypassed it): the roof is simply gone, no debris.
    ctx.events.on('flag.changed', ({ key }) => {
      if (key === ORSK_GONE_FLAG && ctx.state.getBool(ORSK_GONE_FLAG) && state.present) reload();
    }),
    ctx.events.on('save.loaded', reload),
    ctx.events.on('interior.entered', sync),
    ctx.events.on('interior.exited', sync),
  ];
  const removeSystem = ctx.systems.add({
    id: 'oldsmoke.orskRoof',
    fixedPhase: 'animation',
    fixedUpdate(dt) {
      // The interior events fire after the reveal; following `current` shows the slab from the first frame and hides it on the way out.
      const here = inside();
      if (here !== group.visible && roofDrawn(state)) sync();
      if (state.debris === null) return;
      state = roofStep(state, dt);
      poseChunks();
      sync();
    },
  });

  return () => {
    offs.forEach((off) => off());
    removeSystem();
    ctx.scene.remove(group);
    slabGeo.dispose();
    chunkGeo.dispose();
    material.dispose();
    chunks.dispose();
  };
}
