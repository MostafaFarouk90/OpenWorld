// Act 4 L3 (plans/act4-L3.md 2.4, 2.11): the storm's look. One weight from 0 to 1 (phase x edge fade x 3 s ramp)
// drives the fog (near, far, colour), the sky colour, the camera's far plane (the storm view distance: fewer terrain
// draw calls), the ash layer, the particles and the shelter beacons. Everything goes through the field blender, so the
// graphics service, the Greyfen mist and the interiors keep their own values. Indoors the interior owns the scene.
import * as THREE from 'three';
import type { GameContext as CoreContext } from '../core/Game';
import { engineBox, REGION_IDS, REGION_INFO } from '../region/regions';
import { heightAt } from '../terrain/heightfield';
import type { QualityStep } from '../vfx/tuning';
import { AshLayer } from './ashLayer';
import { FieldBlender, closeTo, toward } from './fieldBlend';
import { AshParticles } from './particles';
import { ASH_MASK, STORM_COLOR, STORM_LOOK, type StormLook } from './tuning';
import { edgeFade, insideDepth, phaseWeight, ramp, type Box } from './weight';
import type { WeatherKind } from './types';

export const STORM_LOOK_SYSTEM_ID = 'weather.look';

/** What the look draws at `weight` (0 to 1, the storm's full strength at 1) on a quality step, with or without the mask. */
export function lookAt(step: QualityStep, weight: number, mask: boolean): { fogNear: number; fogFar: number; layerAlpha: number; particles: number; cameraFar: number } {
  const l: StormLook = STORM_LOOK[step] ?? STORM_LOOK.medium;
  const w = Math.min(1, Math.max(0, weight));
  return {
    fogNear: l.fogNear,
    fogFar: mask ? l.maskFogFar : l.fogFar,
    layerAlpha: (mask ? l.maskLayerAlpha : l.layerAlpha) * w,
    // The warning shows a quarter of the particles (its weight is 0.2; the particles follow the weight at 1.25x).
    particles: Math.round(l.particles * Math.min(1, w * 1.25)),
    cameraFar: l.viewDistance * 1.05,
  };
}

/** The look's target weight for the region's weather at a camera position (0 indoors). */
export function targetWeight(kind: WeatherKind, boxes: readonly Box[], x: number, z: number, indoors: boolean): number {
  if (indoors) return 0;
  let fade = 0;
  for (const b of boxes) fade = Math.max(fade, edgeFade(insideDepth(b, x, z)));
  return phaseWeight(kind) * fade;
}

export function maskActive(ctx: Pick<CoreContext, 'state' | 'services'>): boolean {
  if (ctx.state.getBool(ASH_MASK.flag)) return true;
  const inv = ctx.services.get('inventory') as { has?(id: string): boolean } | undefined;
  try {
    return inv?.has?.(ASH_MASK.itemId) === true;
  } catch {
    return false;
  }
}

const BEACON_RANGE = 600;

export function installStormLook(ctx: CoreContext, rt: { lookKind: WeatherKind; currentShelter: string | null; shelterPoints(): readonly { id: string; x: number; z: number }[] }): () => void {
  const camera = ctx.camera;
  if (!camera) return () => {};
  const boxes = REGION_IDS.filter((id) => REGION_INFO[id].weather === 'ash-storm').map(engineBox);
  const stepNow = (): QualityStep => (ctx.services.get('quality')?.step ?? 'medium') as QualityStep;
  const target = { near: 12, far: 140, camFar: 630 };
  const stormColor = new THREE.Color(STORM_COLOR);
  const fog = (): THREE.Fog | null => (ctx.scene.fog instanceof THREE.Fog ? ctx.scene.fog : null);
  const blender = new FieldBlender()
    .addNumber({ get: () => fog()?.near ?? 0, set: (v) => fog() && (fog()!.near = v), mix: (b, w) => toward(target.near)(b, w) })
    .addNumber({ get: () => fog()?.far ?? 0, set: (v) => fog() && (fog()!.far = v), mix: (b, w) => closeTo(target.far)(b, w) })
    .addNumber({
      get: () => camera.far,
      set: (v) => {
        if (camera.far === v) return;
        camera.far = v;
        camera.updateProjectionMatrix();
      },
      mix: (b, w) => closeTo(target.camFar)(b, w),
    })
    .addColor({ get: () => fog()?.color ?? null, target: stormColor })
    .addColor({ get: () => (ctx.scene.background instanceof THREE.Color ? ctx.scene.background : null), target: stormColor });

  let step = stepNow();
  const layer = new AshLayer(STORM_COLOR);
  ctx.scene.add(layer.object);
  let particles = new AshParticles({ count: STORM_LOOK[step].particles, half: 30, wind: { x: 14, z: 5 }, fall: 1.5, sway: 2.5, color: 0x6f6a64, size: 0.12, seed: 'storm' });
  ctx.scene.add(particles.object);
  const offQuality = ctx.services.get('quality')?.subscribe((s) => {
    step = s as QualityStep;
    particles.dispose();
    particles = new AshParticles({ count: STORM_LOOK[step].particles, half: 30, wind: { x: 14, z: 5 }, fall: 1.5, sway: 2.5, color: 0x6f6a64, size: 0.12, seed: 'storm' });
    ctx.scene.add(particles.object);
  });

  // Shelter beacons: a lantern column per shelter, unfogged, so it shows through the storm.
  const beaconGeom = new THREE.CylinderGeometry(0.15, 0.15, 14, 6, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.55, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const beacons = new Map<string, THREE.Mesh>();
  const beaconFor = (id: string, x: number, z: number): THREE.Mesh => {
    let m = beacons.get(id);
    if (!m) {
      m = new THREE.Mesh(beaconGeom, beaconMat);
      m.name = `weather.beacon:${id}`;
      m.position.set(x, heightAt(x, z) + 7, z);
      ctx.scene.add(m);
      beacons.set(id, m);
    }
    return m;
  };

  let weight = 0;
  let snap = false;
  const offLoaded = ctx.events.on('save.loaded', () => {
    snap = true;
  });

  const off = ctx.systems.add({
    id: STORM_LOOK_SYSTEM_ID,
    renderPhase: 'world',
    // After the Greyfen mist (911) and the stacks (910), so the storm's fog is the one drawn.
    order: 915,
    render: (_alpha, frameTime) => {
      const cam = camera.position;
      const i = ctx.services.get('interiors') as { current: string | null } | undefined;
      const indoors = !!i?.current;
      const goal = targetWeight(rt.lookKind, boxes, cam.x, cam.z, indoors);
      weight = snap ? goal : ramp(weight, goal, frameTime);
      snap = false;
      const mask = maskActive(ctx);
      const look = lookAt(step, weight, mask);
      target.near = look.fogNear;
      target.far = look.fogFar;
      target.camFar = look.cameraFar;
      // Indoors the interior owns fog, sky and lights: leave them and the blender's bases alone. The interior snapshots
      // what this wrote and restores it on exit, so the blend carries on from there (the act3 mist's rule).
      if (!indoors) blender.apply(weight);
      layer.update(frameTime, indoors ? 0 : look.layerAlpha);
      particles.update(cam, frameTime, indoors ? 0 : look.particles / Math.max(1, particles.count), Math.min(1, weight * 1.25) * 0.8);
      const inRange = new Set<string>();
      if (!indoors) {
        for (const s of rt.shelterPoints()) {
          if (Math.hypot(s.x - cam.x, s.z - cam.z) > BEACON_RANGE) continue;
          inRange.add(s.id);
          const m = beaconFor(s.id, s.x, s.z);
          m.visible = true;
        }
      }
      for (const [id, m] of beacons) if (!inRange.has(id)) m.visible = false;
      beaconMat.opacity = 0.35 + 0.45 * Math.min(1, weight);
    },
  });

  return () => {
    off();
    offLoaded();
    offQuality?.();
    blender.restore();
    layer.dispose();
    particles.dispose();
    for (const m of beacons.values()) m.removeFromParent();
    beacons.clear();
    beaconGeom.dispose();
    beaconMat.dispose();
  };
}

