import * as THREE from 'three';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { HurtboxDef } from '../../../combat/types';
import { GNATS } from '../tuning';
import { ProceduralBody, type ClipSample, type ProceduralBodyOptions } from '../proceduralBody';
import { GNAT_CLIP_ALIASES, GNAT_CLIP_DURATIONS, GNAT_CLIPS } from './clips';

export interface SwarmBodyOptions extends ProceduralBodyOptions {
  tint?: number;
  /** Low quality draws half the points. */
  lowQuality?: boolean;
  /** Seed of the points' scatter (tests pin it). */
  seed?: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/** One unit offset per point (inside a unit sphere) and its own flutter phase, seeded. */
export function swarmOffsets(count: number, seed: number): { offsets: Float32Array; phases: Float32Array } {
  let s = (seed >>> 0) || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  const offsets = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // A point in the unit ball, denser toward the middle.
    const r = Math.pow(rnd(), 0.6);
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(2 * rnd() - 1);
    offsets[i * 3] = r * Math.sin(ph) * Math.cos(th);
    offsets[i * 3 + 1] = r * Math.cos(ph) * 0.7;
    offsets[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    phases[i] = rnd() * Math.PI * 2;
  }
  return { offsets, phases };
}

/**
 * The Cinder Gnat swarm as an `EnemyBody` (Act 4 L5): a `THREE.Points` cloud of ember gnats hovering over the ground, each
 * point fluttering on its own phase (the design's sprite flutter, done on the CPU: 140 points). `Sting` contracts the cloud
 * to 40% of its radius and brightens it through the wind-up, then washes it out over the window; `Disperse` (death)
 * scatters it outward and fades it. One sphere hurtbox. Duck-typed: `radiusNow`, `brightness`, `pointCount`.
 */
export class SwarmBody extends ProceduralBody {
  readonly root: THREE.Group;
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly materials: THREE.Material[];
  readonly pointCount: number;

  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly offsets: Float32Array;
  private readonly phases: Float32Array;
  private readonly baseColor: THREE.Color;
  private readonly hot = new THREE.Color(0xffe0a0);
  private opacity = 1;
  radiusNow: number = GNATS.radius;
  brightness = 0;

  constructor(options: SwarmBodyOptions = {}) {
    super(GNAT_CLIP_DURATIONS, GNAT_CLIP_ALIASES, GNAT_CLIPS.idle, options);
    this.root = new THREE.Group();
    this.root.name = 'enemy-gnats';
    this.owner = new THREE.Group();
    this.owner.name = 'swarm';
    this.owner.position.y = GNATS.hover;
    this.root.add(this.owner);

    this.pointCount = options.lowQuality ? Math.round(GNATS.points / 2) : GNATS.points;
    const { offsets, phases } = swarmOffsets(this.pointCount, options.seed ?? 7);
    this.offsets = offsets;
    this.phases = phases;
    this.positions = new Float32Array(this.pointCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.baseColor = new THREE.Color(options.tint ?? 0xff7a2a);
    const mat = new THREE.PointsMaterial({
      color: this.baseColor.clone(),
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.owner.add(this.points);
    this.materials = [mat];

    const core = new THREE.Object3D();
    core.name = 'swarm-core';
    this.owner.add(core);
    const defs: HurtboxDef[] = [{ name: 'body', bone: 'swarm-core', start: { x: 0, y: -0.3, z: 0 }, end: { x: 0, y: 0.3, z: 0 }, radius: 1.2 }];
    this.pose({ clip: GNAT_CLIPS.idle, time: 0, u: 0, attack: null }, 0);
    this.root.updateMatrixWorld(true);
    this.hurtboxes = new HurtboxSet(this.owner, defs, this.owner);
    // The sting hits through its ground area (`MoveDef.area`): the tracer sits at the centre, too short to touch anyone.
    this.addChannel('right', core, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.01), this.owner);
  }

  setOpacity(o: number): void {
    if (this.disposed) return;
    this.opacity = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
  }

  protected pose(sample: ClipSample, _dt: number): void {
    let radius = GNATS.radius;
    let bright = 0;
    let alpha = 0.9;
    if (sample.clip === GNAT_CLIPS.sting && sample.attack) {
      const start = sample.attack.activeStart;
      const end = sample.attack.activeEnd;
      // Contract through the wind-up, then wash out wide over the window, then settle.
      const contract = smooth(0, start, sample.u) * (1 - smooth(start, end, sample.u));
      const wash = smooth(start, end, sample.u) * (1 - smooth(end, 1, sample.u));
      radius = GNATS.radius * (1 - (1 - GNATS.contract) * contract) + wash * 0.6;
      bright = Math.max(contract, wash * 0.6);
    } else if (sample.clip === GNAT_CLIPS.death) {
      radius = GNATS.radius * (1 + 2.5 * smooth(0, 1, sample.u));
      alpha = 0.9 * (1 - smooth(0.2, 1, sample.u));
    } else if (sample.clip === GNAT_CLIPS.hit) {
      radius = GNATS.radius * (1 + 0.3 * Math.sin(Math.PI * sample.u));
    }
    bright = Math.max(bright, this.telegraphK);
    this.radiusNow = radius;
    this.brightness = bright;
    const t = this.time;
    for (let i = 0; i < this.pointCount; i++) {
      const ph = this.phases[i]!;
      const fx = Math.sin(t * 7 + ph) * 0.12;
      const fy = Math.sin(t * 9 + ph * 1.7) * 0.1;
      const fz = Math.cos(t * 8 + ph * 0.9) * 0.12;
      // The whole cloud turns slowly round its centre.
      const ox = this.offsets[i * 3]!;
      const oz = this.offsets[i * 3 + 2]!;
      const a = t * 0.8;
      const rx = ox * Math.cos(a) - oz * Math.sin(a);
      const rz = ox * Math.sin(a) + oz * Math.cos(a);
      this.positions[i * 3] = rx * radius + fx;
      this.positions[i * 3 + 1] = this.offsets[i * 3 + 1]! * radius + fy;
      this.positions[i * 3 + 2] = rz * radius + fz;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    const mat = this.materials[0] as THREE.PointsMaterial;
    mat.color.copy(this.baseColor).lerp(this.hot, bright * 0.7);
    mat.size = 0.09 * (1 + bright * 0.6);
    mat.opacity = alpha * this.opacity;
  }

  protected disposeVisual(): void {
    this.points.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
