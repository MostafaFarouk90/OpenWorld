import * as THREE from 'three';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { HurtboxDef } from '../../../combat/types';
import { STRIDER_BUILD } from '../tuning';
import { ProceduralBody, type ClipSample, type ProceduralBodyOptions } from '../proceduralBody';
import { STRIDER_CLIP_ALIASES, STRIDER_CLIP_DURATIONS, STRIDER_CLIPS } from './clips';
import {
  DEFAULT_GAIT_BUILD,
  LEG_END,
  LEG_IDS,
  LEG_SIDE,
  StriderGait,
  framePoint,
  hipPoint,
  legPole,
  solveLeg,
  type GroundFn,
  type HullFrame,
  type LegId,
  type V3,
} from './gait';

/** The shin hurtboxes' names (and their bone objects): a hit on one of these is a leg hit (the trip rule). */
export const STRIDER_LEG_HURTBOXES: Readonly<Record<LegId, string>> = { fl: 'leg.fl', fr: 'leg.fr', bl: 'leg.bl', br: 'leg.br' };
export const isStriderLeg = (bone: string | undefined): LegId | null => {
  if (!bone) return null;
  for (const leg of LEG_IDS) if (STRIDER_LEG_HURTBOXES[leg] === bone) return leg;
  return null;
};

/** The foreleg that strikes in each attack. */
const STRIKE_LEG: Readonly<Record<string, LegId>> = { Lunge: 'fl', Blast: 'fr' };

export interface StriderBodyOptions extends ProceduralBodyOptions {
  tint?: number;
  emissive?: number;
  /** Ground height for the feet; absent: flat at the root's height. */
  groundAt?: GroundFn;
}

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

interface LegParts {
  thigh: THREE.Object3D;
  shin: THREE.Object3D;
  foot: THREE.Mesh;
}

/**
 * The Waste Strider as an `EnemyBody` (Act 4 L5): a narrow ash hull carried high on four long two-segment legs, a drooping
 * head on a short neck. The gait script (gait.ts) plants the feet in world space and the legs are solved by IK each tick, so
 * the feet hold the ground while the hull moves; attacks, the trip and death override single feet. Hurtboxes on the hull,
 * the head and each shin (`leg.fl` ... `leg.br`). Duck-typed controls for the overlay: `setTrip(leg | null)`, `setDrink(k)`,
 * `setPuddle(at | null)`, and `tripLeg`.
 */
export class StriderBody extends ProceduralBody {
  readonly root: THREE.Group;
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly materials: THREE.Material[];
  readonly gait: StriderGait;

  private readonly hull: THREE.Object3D;
  private readonly head: THREE.Object3D;
  private readonly legs: Record<LegId, LegParts>;
  private readonly puff: THREE.Mesh;
  private readonly puddle: THREE.Mesh;
  private readonly baseEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private readonly ground: GroundFn | null;
  private readonly frame: HullFrame = { x: 0, y: 0, z: 0, yaw: 0 };
  private tripped: LegId | null = null;
  private tripK = 0;
  private drinkK = 0;
  private deathK = 0;
  private opacity = 1;
  private gaitReady = false;
  /** The last drawn world points (tests read them). */
  readonly drawn: Record<LegId, { hip: V3; knee: V3; foot: V3 }> = {} as Record<LegId, { hip: V3; knee: V3; foot: V3 }>;

  constructor(options: StriderBodyOptions = {}) {
    super(STRIDER_CLIP_DURATIONS, STRIDER_CLIP_ALIASES, STRIDER_CLIPS.idle, options);
    const b = STRIDER_BUILD;
    this.ground = options.groundAt ?? null;
    this.root = new THREE.Group();
    this.root.name = 'enemy-strider';
    this.owner = new THREE.Group();
    this.owner.name = 'strider-visual';
    this.root.add(this.owner);

    const hullMat = new THREE.MeshStandardMaterial({ color: options.tint ?? 0xa49c90, roughness: 0.95, emissive: options.emissive ?? 0x120804 });
    const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(options.tint ?? 0xa49c90).multiplyScalar(0.62), roughness: 0.9 });
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0, depthWrite: false });
    const puddleMat = new THREE.MeshBasicMaterial({ color: 0x2a2a30, transparent: true, opacity: 0, depthWrite: false });
    this.materials = [hullMat, legMat, puffMat, puddleMat];
    this.baseEmissive.set(hullMat, hullMat.emissive.clone());
    this.baseEmissive.set(legMat, legMat.emissive.clone());

    // Hull: a capsule along the body's length (forward is local -Z).
    this.hull = new THREE.Object3D();
    this.hull.name = 'hull';
    const hullMesh = new THREE.Mesh(new THREE.CapsuleGeometry(b.hullRadius, b.hullLength, 4, 10), hullMat);
    hullMesh.rotation.x = Math.PI / 2;
    hullMesh.castShadow = true;
    this.hull.add(hullMesh);
    this.owner.add(this.hull);

    // Head on a short neck at the front, drooping.
    this.head = new THREE.Object3D();
    this.head.name = 'head';
    this.head.position.set(0, 0.1, -(b.hullLength / 2 + b.hullRadius));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, b.neck, 6), legMat);
    neck.position.set(0, -b.neck * 0.35, -b.neck * 0.35);
    neck.rotation.x = -Math.PI / 4;
    const skull = new THREE.Mesh(new THREE.ConeGeometry(0.16, b.headLength, 7), hullMat);
    skull.position.set(0, -b.neck * 0.7, -b.neck * 0.7 - b.headLength * 0.4);
    skull.rotation.x = -Math.PI / 2 - 0.5;
    skull.castShadow = true;
    this.head.add(neck, skull);
    this.hull.add(this.head);

    this.legs = {} as Record<LegId, LegParts>;
    for (const leg of LEG_IDS) {
      const thigh = new THREE.Object3D();
      thigh.name = `thigh.${leg}`;
      const tm = new THREE.Mesh(new THREE.CylinderGeometry(b.legRadius * 1.2, b.legRadius, b.thigh, 6), legMat);
      tm.position.y = b.thigh / 2;
      tm.castShadow = true;
      thigh.add(tm);
      const shin = new THREE.Object3D();
      shin.name = STRIDER_LEG_HURTBOXES[leg];
      const sm = new THREE.Mesh(new THREE.CylinderGeometry(b.legRadius, b.legRadius * 0.55, b.shin, 6), legMat);
      sm.position.y = b.shin / 2;
      sm.castShadow = true;
      shin.add(sm);
      const foot = new THREE.Mesh(new THREE.ConeGeometry(b.legRadius * 1.3, 0.22, 5), legMat);
      foot.rotation.x = Math.PI;
      this.owner.add(thigh, shin, foot);
      this.legs[leg] = { thigh, shin, foot };
    }

    this.puff = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), puffMat);
    this.puff.visible = false;
    this.owner.add(this.puff);
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), puddleMat);
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.visible = false;
    this.root.add(this.puddle);

    const defs: HurtboxDef[] = [
      { name: 'body', bone: 'hull', start: { x: 0, y: 0, z: b.hullLength / 2 }, end: { x: 0, y: 0, z: -b.hullLength / 2 }, radius: b.hullRadius * 1.15 },
      { name: 'head', bone: 'head', start: { x: 0, y: -0.2, z: -0.2 }, end: { x: 0, y: -0.5, z: -0.8 }, radius: 0.22 },
      ...LEG_IDS.map((leg) => ({
        name: STRIDER_LEG_HURTBOXES[leg],
        bone: STRIDER_LEG_HURTBOXES[leg],
        start: { x: 0, y: 0.1, z: 0 },
        end: { x: 0, y: b.shin - 0.1, z: 0 },
        // A gameplay volume fuller than the 7 cm shin, so a blade cannot slip past it between frames.
        radius: 0.22,
      })),
    ];
    this.gait = new StriderGait(this.frame, DEFAULT_GAIT_BUILD, this.ground);
    this.pose({ clip: STRIDER_CLIPS.idle, time: 0, u: 0, attack: null }, 0);
    this.root.updateMatrixWorld(true);
    this.hurtboxes = new HurtboxSet(this.owner, defs, this.owner);
    // The `right` channel only satisfies the body contract: both moves hit through their ground area (`MoveDef.area`), so
    // the tracer sits inside the hull, where it can never touch anyone.
    this.addChannel('right', this.hull, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.01), this.owner);
  }

  // ------------------------------------------------------------------------------------------- controls

  /** Trips (folds) one leg, or none. */
  setTrip(leg: LegId | null): void {
    this.tripped = leg;
  }

  get tripLeg(): LegId | null {
    return this.tripped;
  }

  /** 0..1: the hull lowered and the head down to the water. */
  setDrink(k: number): void {
    this.drinkK = THREE.MathUtils.clamp(Number.isFinite(k) ? k : 0, 0, 1);
  }

  /** The poured water's wet patch at a world point (shown under the strider's root's parent space), or hidden. */
  setPuddle(at: { x: number; y: number; z: number } | null, opacity = 0.55): void {
    const mat = this.puddle.material as THREE.MeshBasicMaterial;
    if (!at) {
      this.puddle.visible = false;
      mat.opacity = 0;
      return;
    }
    this.root.updateMatrixWorld(true);
    const local = this.root.worldToLocal(new THREE.Vector3(at.x, at.y + 0.03, at.z));
    this.puddle.position.copy(local);
    this.puddle.visible = true;
    mat.opacity = opacity * this.opacity;
  }

  setOpacity(o: number): void {
    if (this.disposed) return;
    this.opacity = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
    for (const m of this.materials.slice(0, 2)) {
      const transparent = this.opacity < 1;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = this.opacity;
      m.depthWrite = !transparent;
    }
  }

  // ------------------------------------------------------------------------------------------- pose

  protected pose(sample: ClipSample, dt: number): void {
    const b = STRIDER_BUILD;
    this.frame.x = this.root.position.x;
    this.frame.y = this.root.position.y;
    this.frame.z = this.root.position.z;
    this.frame.yaw = this.root.rotation.y;
    if (!this.gaitReady) {
      this.gait.reset(this.frame);
      this.gaitReady = true;
    }
    const dying = sample.clip === STRIDER_CLIPS.death;
    const tripping = this.tripped !== null || sample.clip === STRIDER_CLIPS.trip;
    // The gait stands still while it lies tripped or dies (the feet stay where they were).
    if (!dying && !tripping) this.gait.step(this.frame, dt);
    this.tripK = THREE.MathUtils.clamp(this.tripK + (tripping ? dt * 3 : -dt * 1.5), 0, 1);
    this.deathK = dying ? Math.max(this.deathK, smooth(0, 0.8, sample.u)) : 0;

    // Attack overrides of the striking foreleg: drawn back (the 0.6 s draw-back, sand puff), then thrust out.
    const strike = sample.attack ? STRIKE_LEG[sample.clip] : undefined;
    let strikeFoot: V3 | null = null;
    let puffK = 0;
    if (strike && sample.attack) {
      const start = sample.attack.activeStart;
      const end = sample.attack.activeEnd;
      const side = LEG_SIDE[strike];
      const drawn = framePoint(this.frame, side * 0.7, 0.2, b.hullHeight * 0.55);
      const out = sample.clip === STRIDER_CLIPS.lunge
        ? framePoint(this.frame, side * 0.3, 4.6, 0.35)
        : framePoint(this.frame, side * 0.9, 3.6, 0.1);
      const rest = this.gait.foot(strike).at;
      const k1 = smooth(0, start, sample.u);
      const k2 = smooth(start, end, sample.u);
      const k3 = smooth(end + 0.15, 1, sample.u);
      const lerp = (a: V3, c: V3, k: number): V3 => ({ x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k });
      strikeFoot = lerp(lerp(lerp(rest, drawn, k1), out, k2), rest, k3);
      puffK = sample.u < start ? smooth(start * 0.4, start, sample.u) : 1 - smooth(end, end + 0.2, sample.u);
      if (sample.clip === STRIDER_CLIPS.blast) puffK = Math.max(puffK, sample.u >= start ? 1 - smooth(end, 1, sample.u) : 0);
    }

    // Hull height: the gait's, dropped on a trip (to the folded corner), for a drink, and to the ground in death.
    let hullY = this.gait.hullY;
    hullY -= this.tripK * 1.5;
    hullY -= this.drinkK * 1.2;
    hullY = THREE.MathUtils.lerp(hullY, b.hullRadius + 0.05, this.deathK);
    const hit = sample.clip === STRIDER_CLIPS.hit ? Math.sin(Math.PI * sample.u) * 0.15 : 0;
    const tripSide = this.tripped ? LEG_SIDE[this.tripped] : 0;
    const tripEnd = this.tripped ? LEG_END[this.tripped] : 0;
    const sway = Math.sin(this.gait.phase * Math.PI * 4) * b.sway;
    this.hull.position.set(0, hullY - hit, 0);
    this.hull.rotation.set(
      tripEnd * this.tripK * 0.25 + this.drinkK * 0.25 + (sample.attack ? 0.08 : 0),
      0,
      sway + tripSide * this.tripK * -0.3 + this.deathK * 0.2,
    );
    this.head.rotation.x = -0.2 - this.drinkK * 0.6 + this.deathK * 0.4;

    // The legs.
    this.root.updateMatrixWorld(true);
    for (const leg of LEG_IDS) {
      const hip = hipPoint(this.frame, leg, hullY - hit, DEFAULT_GAIT_BUILD);
      let foot: V3 = { ...this.gait.foot(leg).at };
      if (leg === strike && strikeFoot) foot = strikeFoot;
      if (this.tripped === leg) {
        // The tripped leg folds under the hull.
        const under = framePoint(this.frame, LEG_SIDE[leg] * 0.9, LEG_END[leg] * 0.7, 0.1);
        foot = lerpV(foot, under, this.tripK);
      }
      if (this.deathK > 0) {
        const splay = framePoint(this.frame, LEG_SIDE[leg] * b.footX * 1.7, LEG_END[leg] * (b.hipZ + b.footZ * 1.6), 0);
        if (this.ground) splay.y = this.ground(splay.x, splay.z);
        foot = lerpV(foot, splay, this.deathK);
      }
      const ik = solveLeg(hip, foot, b.thigh, b.shin, legPole(this.frame, leg));
      this.drawn[leg] = { hip, knee: ik.knee, foot: ik.foot };
      const parts = this.legs[leg];
      this.placeSegment(parts.thigh, hip, ik.knee);
      this.placeSegment(parts.shin, ik.knee, ik.foot);
      const fl = this.toLocal(ik.foot);
      parts.foot.position.set(fl.x, fl.y + 0.08, fl.z);
    }

    // The sand puff at the striking foot.
    const pmat = this.puff.material as THREE.MeshBasicMaterial;
    if (puffK > 0.01 && strike) {
      const f = this.drawn[strike].foot;
      const g = this.ground ? this.ground(f.x, f.z) : this.frame.y;
      const l = this.toLocal({ x: f.x, y: Math.min(f.y, g + 0.4), z: f.z });
      this.puff.position.set(l.x, l.y, l.z);
      this.puff.scale.setScalar(0.6 + puffK * 1.4);
      pmat.opacity = 0.5 * puffK * this.opacity;
      this.puff.visible = true;
    } else {
      this.puff.visible = false;
      pmat.opacity = 0;
    }

    // Telegraph: the hull and legs warm toward the telegraph colour.
    for (const [m, base] of this.baseEmissive) m.emissive.copy(base).lerp(this.telegraphColor, this.telegraphK * 0.5);
  }

  protected disposeVisual(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  private toLocal(p: V3): THREE.Vector3 {
    return this.owner.worldToLocal(new THREE.Vector3(p.x, p.y, p.z));
  }

  /** Places a segment object at `from`, its local +Y along `from` to `to`. */
  private placeSegment(obj: THREE.Object3D, from: V3, to: V3): void {
    const a = this.owner.worldToLocal(this.tmpA.set(from.x, from.y, from.z));
    const c = this.owner.worldToLocal(this.tmpB.set(to.x, to.y, to.z));
    obj.position.copy(a);
    this.tmpDir.subVectors(c, a);
    if (this.tmpDir.lengthSq() < 1e-10) return;
    obj.quaternion.setFromUnitVectors(UP, this.tmpDir.normalize());
  }
}

function lerpV(a: V3, c: V3, k: number): V3 {
  return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k };
}
