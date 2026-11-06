// Act 4 L3 (plans/act4-L3.md 2.10): ash falling over Harrowmark from `story.gate.a4`, with a dusk grade (every light at
// 45%, warmed toward orange, an ember sky and fog colour). No gameplay effect and no fog distance change. Weighted by
// the camera's distance to Harrowmark's box (full inside, 0 at 300 m out), off indoors, quality-tiered (spike numbers).
// The fields go through the weather's field blender, so the interiors' snapshot and restore stay exact. It shares the
// fog colour and sky with the storm look, kept apart by distance (see weather/stormLook.ts).
import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import { ACT4_GATE_FLAG, engineBox } from '../region/regions';
import type { QualityStep } from '../vfx/tuning';
import { FieldBlender, scaled } from '../weather/fieldBlend';
import { AshParticles } from '../weather/particles';
import { ASHFALL } from '../weather/tuning';
import { insideDepth, ramp, type Box } from '../weather/weight';

export const ASHFALL_SYSTEM_ID = 'ashfall.render';

/** 1 inside Harrowmark's box, 0 at `ASHFALL.fade` metres outside; 0 before the gate flag or indoors. */
export function ashfallWeight(box: Box, x: number, z: number, gate: boolean, indoors: boolean): number {
  if (!gate || indoors) return 0;
  const d = insideDepth(box, x, z);
  return d >= 0 ? 1 : Math.max(0, 1 + d / ASHFALL.fade);
}

const particleOpts = (step: QualityStep) => ({
  count: ASHFALL.particles[step] ?? ASHFALL.particles.medium,
  half: 30,
  wind: { x: 0.6, z: 0.3 },
  fall: 0.9,
  sway: 0.4,
  color: 0x9a948c,
  size: 0.09,
  seed: 'ashfall',
});

export function installAshfall(ctx: Pick<GameContext, 'scene' | 'camera' | 'state' | 'services' | 'systems' | 'events'>): () => void {
  const camera = ctx.camera;
  if (!camera) return () => {};
  const box = engineBox('harrowmark');
  const dusk = new THREE.Color(ASHFALL.duskColor);
  const sky = new THREE.Color(ASHFALL.skyColor);
  const blender = new FieldBlender();
  const fog = (): THREE.Fog | null => (ctx.scene.fog instanceof THREE.Fog ? ctx.scene.fog : null);
  blender.addColor({ get: () => fog()?.color ?? null, target: sky });
  blender.addColor({ get: () => (ctx.scene.background instanceof THREE.Color ? ctx.scene.background : null), target: sky });
  // The outdoor lights present now (the sun and the hemisphere light); interiors add their own lights as children later.
  for (const child of ctx.scene.children) {
    if (child instanceof THREE.DirectionalLight || child instanceof THREE.HemisphereLight) {
      const light = child;
      blender.addNumber({ get: () => light.intensity, set: (v) => (light.intensity = v), mix: scaled(ASHFALL.lightScale) });
      blender.addColor({ get: () => light.color, target: dusk });
    }
  }
  const stepNow = (): QualityStep => (ctx.services.get('quality')?.step ?? 'medium') as QualityStep;
  let step = stepNow();
  let particles = new AshParticles(particleOpts(step));
  ctx.scene.add(particles.object);
  // Read each frame: the quality plugin may set up after this one, and a change rebuilds the particles.
  const syncStep = (): void => {
    const s = stepNow();
    if (s === step) return;
    step = s;
    particles.dispose();
    particles = new AshParticles(particleOpts(step));
    ctx.scene.add(particles.object);
  };
  let weight = 0;
  let snap = false;
  const offLoaded = ctx.events.on('save.loaded', () => {
    snap = true;
  });
  const off = ctx.systems.add({
    id: ASHFALL_SYSTEM_ID,
    renderPhase: 'world',
    order: 914,
    render: (_alpha: number, frameTime: number) => {
      syncStep();
      const cam = camera.position;
      const i = ctx.services.get('interiors') as { current: string | null } | undefined;
      const indoors = !!i?.current;
      const goal = ashfallWeight(box, cam.x, cam.z, ctx.state.getBool(ACT4_GATE_FLAG), indoors);
      // Indoors the weight holds (the interior's camera is elsewhere, and nothing outdoors shows): the door back out
      // finds the look where it was, with no fade in. A load's snap waits for the first outdoor frame.
      if (!indoors) {
        weight = snap ? goal : ramp(weight, goal, frameTime);
        snap = false;
      }
      // Indoors the interior owns the lights and fog (it restores what this wrote on exit).
      if (!indoors) blender.apply(weight);
      particles.update(cam, frameTime, indoors ? 0 : weight, 0.7 * weight);
    },
  });
  return () => {
    off();
    offLoaded();
    blender.restore();
    particles.dispose();
  };
}
