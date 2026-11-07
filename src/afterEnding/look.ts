// The look of the world after the ending (N13, plans/act5-N13.md section 6), attached to N0's `worldTint`:
// - Rekindle: a warm, lighter grade outdoors (taste call T8), held indoors (the interior owns the lights and restores what
//   this wrote, as the ashfall does). Two FieldBlenders engaged on the same field re-base on each other every frame, so the
//   grade never overlaps another one: it is 0 in and near every storm region (the Waste and the Caldera inside it, where the
//   storm look and the Caldera sky write the same fields) and the ashfall over Harrowmark is off under Rekindle.
// - Let It Die: no grade; three dragons fly closed loops over Harrowmark, the Dragonspine and the Waste's plain (N4's
//   SiegeDragon, taste call T9). The Waste's darker storms are the storm look's own target colour (weather/stormLook.ts).
// Nothing registers a glow light (the 3/2/0 pool is untouched).
import * as THREE from 'three';
import { engineBox, type RegionId } from '../region/regions';
import { FieldBlender, scaled } from '../weather/fieldBlend';
import { insideDepth, ramp, stormBoxes, type Box } from '../weather/weight';
import { STORM_EDGE } from '../weather/tuning';
import { REGION_IDS, REGION_INFO } from '../region/regions';
import { SiegeDragon } from '../siege/dragons';
import type { DragonId } from '../siege/roster';
import type { PathPoint } from '../enemies/wyrm/large/flightPath';
import type { WorldTintKey } from '../caldera/worldTint';

/** Rekindle's grade (T8): lights toward warm white and a touch brighter, fog and sky toward a pale gold. */
export const REKINDLE_GRADE = { light: 0xffe6c0, lightMix: 0.25, intensity: 1.08, sky: 0xd9d2bf, skyMix: 0.2 } as const;
/** Metres over which a box's weight fades in at its edge. */
export const LOOK_EDGE = 200;

/** One flight (T9): which dragon, the loop's centre and radii (engine metres), its height above the ground, its start. */
export interface FlightDef {
  dragon: DragonId;
  centre: { x: number; z: number };
  radius: { x: number; z: number };
  altitude: number;
  phase: number;
}

export const AFTER_FLIGHTS: readonly FlightDef[] = [
  { dragon: 'ysmeryth', centre: { x: 8500, z: 2100 }, radius: { x: 900, z: 700 }, altitude: 140, phase: 0 },
  { dragon: 'hathren', centre: { x: 13500, z: 14000 }, radius: { x: 1500, z: 1200 }, altitude: 160, phase: 0.33 },
  { dragon: 'orsk', centre: { x: 11000, z: 5300 }, radius: { x: 1800, z: 600 }, altitude: 120, phase: 0.66 },
];
/** Points per loop. */
export const FLIGHT_POINTS = 16;
/** Beyond this the rig is hidden (still flown). */
export const FLIGHT_CULL = 900;
/** Within this the flyby sound runs (`dragon.flight`, N8's flyby). */
export const FLYBY_RANGE = 150;

/** A closed loop of points round the centre, each `altitude` above the ground under it. */
export function flightLoop(f: FlightDef, groundAt: (x: number, z: number) => number): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i < FLIGHT_POINTS; i++) {
    const a = (i / FLIGHT_POINTS) * Math.PI * 2;
    const x = f.centre.x + Math.cos(a) * f.radius.x;
    const z = f.centre.z + Math.sin(a) * f.radius.z;
    out.push({ x, y: groundAt(x, z) + f.altitude, z });
  }
  return out;
}

/** The storm regions' boxes (the Waste; the Caldera sits inside it). */
export function stormRegionBoxes(): Box[] {
  return stormBoxes(REGION_IDS, (id) => REGION_INFO[id as RegionId], (id) => engineBox(id as RegionId)).boxes;
}

/**
 * Rekindle's weight at a point: 0 inside a storm region and within the storm look's outside band (STORM_EDGE.outside), then
 * rising to 1 over LOOK_EDGE metres further out. So it never writes a field the storm look or the Caldera sky writes.
 */
export function rekindleWeight(storms: readonly Box[], x: number, z: number): number {
  let w = 1;
  for (const b of storms) {
    const out = -insideDepth(b, x, z) - STORM_EDGE.outside;
    w = Math.min(w, Math.max(0, Math.min(1, out / LOOK_EDGE)));
  }
  return w;
}

export interface LookHost {
  scene: THREE.Scene;
  camera: () => { x: number; y: number; z: number } | null;
  indoors: () => boolean;
  groundAt(x: number, z: number): number;
  flyby(actorId: string, on: boolean): void;
}

/** The look for one tint key; `step` runs each render frame. */
export class AfterEndingLook {
  private key: WorldTintKey | null = null;
  private readonly warmSky = new FieldBlender();
  private readonly warmLight = new FieldBlender();
  private readonly warmLevel = new FieldBlender();
  private warmW = 0;
  private snap = true;
  private dragons: SiegeDragon[] = [];
  private readonly near = new Set<string>();
  private readonly storms = stormRegionBoxes();

  constructor(private readonly host: LookHost) {
    const fog = (): THREE.Color | null => (host.scene.fog instanceof THREE.Fog ? host.scene.fog.color : null);
    const bg = (): THREE.Color | null => (host.scene.background instanceof THREE.Color ? host.scene.background : null);
    const sky = new THREE.Color(REKINDLE_GRADE.sky);
    const light = new THREE.Color(REKINDLE_GRADE.light);
    // A colour blender lerps fully to its target at weight 1, so each runs at the look's weight times its own mix; the
    // intensity blender runs at the look's weight.
    this.warmSky.addColor({ get: fog, target: sky.clone() });
    this.warmSky.addColor({ get: bg, target: sky.clone() });
    // The outdoor lights present now (the sun and the hemisphere light), as the ashfall reads them.
    for (const child of host.scene.children) {
      if (child instanceof THREE.DirectionalLight || child instanceof THREE.HemisphereLight) {
        const l = child;
        this.warmLevel.addNumber({ get: () => l.intensity, set: (v) => (l.intensity = v), mix: scaled(REKINDLE_GRADE.intensity) });
        this.warmLight.addColor({ get: () => l.color, target: light.clone() });
      }
    }
  }

  get current(): WorldTintKey | null {
    return this.key;
  }

  get flights(): readonly SiegeDragon[] {
    return this.dragons;
  }

  set(key: WorldTintKey | null): void {
    if (key === this.key) return;
    this.key = key;
    this.snap = true;
    if (key === 'let-it-die') this.launch();
    else this.land();
  }

  /** Each render frame (frameTime in seconds). */
  step(frameTime: number): void {
    const cam = this.host.camera();
    const indoors = this.host.indoors();
    if (cam && !indoors) {
      const warmGoal = this.key === 'rekindle' ? rekindleWeight(this.storms, cam.x, cam.z) : 0;
      this.warmW = this.snap ? warmGoal : ramp(this.warmW, warmGoal, frameTime);
      this.snap = false;
      this.warmSky.apply(this.warmW * REKINDLE_GRADE.skyMix);
      this.warmLight.apply(this.warmW * REKINDLE_GRADE.lightMix);
      this.warmLevel.apply(this.warmW);
    }
    for (const d of this.dragons) {
      d.update(frameTime);
      const p = d.position;
      const dist = cam ? Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z) : Infinity;
      d.rig.root.visible = !indoors && dist <= FLIGHT_CULL;
      const id = d.rig.root.name;
      const close = !indoors && dist <= FLYBY_RANGE;
      if (close !== this.near.has(id)) {
        if (close) this.near.add(id);
        else this.near.delete(id);
        this.host.flyby(id, close);
      }
    }
  }

  /** After a load: the audio stops every loop, so a dragon still in range announces itself again on the next frame. */
  onLoaded(): void {
    this.near.clear();
    this.snap = true;
  }

  /** Puts back what this wrote and lands the dragons. */
  dispose(): void {
    for (const b of [this.warmSky, this.warmLight, this.warmLevel]) b.restore();
    this.land();
    this.key = null;
  }

  private launch(): void {
    if (this.dragons.length) return;
    this.dragons = AFTER_FLIGHTS.map(
      (f) => new SiegeDragon(f.dragon, this.host.scene, flightLoop(f, (x, z) => this.host.groundAt(x, z)), f.phase, () => this.host.camera()),
    );
    for (const d of this.dragons) d.rig.root.name = `after-dragon-${d.id}`;
  }

  private land(): void {
    for (const id of this.near) this.host.flyby(id, false);
    this.near.clear();
    for (const d of this.dragons.splice(0)) d.dispose();
  }
}
