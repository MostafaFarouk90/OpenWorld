// Act 5 thread N1 PR 1 (plans/act5-N1.md section 5): the Caldera's orange sky. The region's `sky: 'caldera-orange'` key
// (v0.9 item 1) is read by region; the grade is built on Act 4's ash-fall pattern (rendering/ashfall.ts): sky and fog
// colours toward the forge's orange, the outdoor lights warmed, weighted by the camera's depth into the box (0 at its
// edge, full once inside the crest), off indoors, through the weather's field blender so an interior's snapshot and
// restore stay exact. No fog distance change and no gameplay effect. From `story.gate.a5` (before it nobody is inside).
import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import { ACT5_GATE_FLAG } from '../region/act5Regions';
import { engineBox, REGION_INFO, type RegionId } from '../region/regions';
import { FieldBlender, scaled } from '../weather/fieldBlend';
import { insideDepth, ramp, type Box } from '../weather/weight';

export const CALDERA_SKY_SYSTEM_ID = 'caldera.sky';

/** The sky keys this module paints, and their look (first numbers; tuned on the real-game shots). */
export const SKY_LOOKS = {
  'caldera-orange': {
    /** Sky and fog colour at full weight. */
    sky: 0xd0702e,
    fog: 0x9a5530,
    /** The outdoor lights' tint and intensity scale at full weight. */
    light: 0xffb878,
    lightScale: 0.85,
    /**
     * The grade starts this far inside the box, after the storm look has faded out (weather STORM_HOLE_FADE), so the two
     * blenders never write the same fields in the same band; it is full `fadeIn` metres later (the crest stands 150 m in).
     */
    fadeStart: 100,
    fadeIn: 150,
  },
} as const;
export type SkyKey = keyof typeof SKY_LOOKS;

/** The regions with a sky key this module knows, with their boxes. */
export function skyRegions(): { id: RegionId; key: SkyKey; box: Box }[] {
  return (Object.keys(REGION_INFO) as RegionId[]).flatMap((id) => {
    const key = REGION_INFO[id].sky;
    return key && Object.hasOwn(SKY_LOOKS, key) ? [{ id, key: key as SkyKey, box: engineBox(id) }] : [];
  });
}

/** 0 outside the box and over its first `fadeStart` metres, rising to 1 `fadeIn` metres further in; 0 indoors or before the gate. */
export function skyWeight(box: Box, fadeStart: number, fadeIn: number, x: number, z: number, gate: boolean, indoors: boolean): number {
  if (!gate || indoors) return 0;
  const d = insideDepth(box, x, z) - fadeStart;
  if (d <= 0) return 0;
  return Math.min(1, d / fadeIn);
}

export function installCalderaSky(ctx: Pick<GameContext, 'scene' | 'camera' | 'state' | 'services' | 'systems' | 'events'>): () => void {
  const camera = ctx.camera;
  const region = skyRegions().find((r) => r.key === 'caldera-orange');
  if (!camera || !region) return () => {};
  const look = SKY_LOOKS[region.key];
  const sky = new THREE.Color(look.sky);
  const fogColor = new THREE.Color(look.fog);
  const warm = new THREE.Color(look.light);
  const blender = new FieldBlender();
  const fog = (): THREE.Fog | null => (ctx.scene.fog instanceof THREE.Fog ? ctx.scene.fog : null);
  blender.addColor({ get: () => fog()?.color ?? null, target: fogColor });
  blender.addColor({ get: () => (ctx.scene.background instanceof THREE.Color ? ctx.scene.background : null), target: sky });
  for (const child of ctx.scene.children) {
    if (child instanceof THREE.DirectionalLight || child instanceof THREE.HemisphereLight) {
      const light = child;
      blender.addNumber({ get: () => light.intensity, set: (v) => (light.intensity = v), mix: scaled(look.lightScale) });
      blender.addColor({ get: () => light.color, target: warm });
    }
  }
  let weight = 0;
  let snap = false;
  const offLoaded = ctx.events.on('save.loaded', () => {
    snap = true;
  });
  const off = ctx.systems.add({
    id: CALDERA_SKY_SYSTEM_ID,
    renderPhase: 'world',
    // After the storm look (915) and the ash-fall (914): inside the Caldera neither is drawn, so this is the last word.
    order: 916,
    render: (_alpha: number, frameTime: number) => {
      const cam = camera.position;
      const i = ctx.services.get('interiors') as { current: string | null } | undefined;
      const indoors = !!i?.current;
      const goal = skyWeight(region.box, look.fadeStart, look.fadeIn, cam.x, cam.z, ctx.state.getBool(ACT5_GATE_FLAG), indoors);
      if (!indoors) {
        weight = snap ? goal : ramp(weight, goal, frameTime);
        snap = false;
        blender.apply(weight);
      }
    },
  });
  return () => {
    off();
    offLoaded();
    blender.restore();
  };
}
