// Cosmetic followers (plans/act2-A5.md section 2): never in a party slot, never actors, no combat. The Ember pup
// (design 14, R07 spared: the Ember Hound rig at half scale, sits when idle) and the Kindling Brush tail light (design
// 7.9: a small light trailing at hip height while Cael holds the item). Each walks a FollowModel of its own and hides
// indoors, in stealth sections and on horseback past 40 m, as companions do; it reappears behind Cael.
import * as THREE from 'three';
import { HOUND } from '../enemies/quadruped/params';
import { QuadrupedBody } from '../enemies/quadruped/QuadrupedBody';
import { FollowModel, behind, type FollowTuning, type Gait, type Vec3 } from './FollowModel';
import { COMPANION_TUNING } from './tuning';

export const FOLLOWER_TUNING = {
  pup: { scale: 0.5, slotBack: 1.8, slotSide: -1 },
  brush: { slotBack: 0.9, slotSide: 0, hipHeight: 0.95, light: { color: 0xffa040, intensity: 1.1, distance: 5 }, emberRadius: 0.06 },
} as const;

export interface FollowerVisual {
  readonly root: THREE.Object3D;
  setGait(g: Gait): void;
  /** Shows or hides it; absent: the root's visibility. The brush dims its light instead, so the scene's light count stays put. */
  setShown?(on: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

export interface FollowerPorts {
  scene: THREE.Object3D;
  feet(): Vec3;
  yaw(): number;
  groundAt(x: number, z: number, yHint: number): number | null;
  indoors(): boolean;
  stealth(): boolean;
  mounted(): boolean;
}

export class CosmeticFollower {
  private visual: FollowerVisual | null = null;
  private model: FollowModel | null = null;
  private shown = false;

  constructor(
    readonly id: string,
    private readonly build: () => FollowerVisual,
    private readonly p: FollowerPorts,
    private readonly tuning: FollowTuning,
    /** Height of the root above the ground (the brush floats at hip height). */
    private readonly lift = 0,
  ) {}

  get active(): boolean {
    return this.visual !== null;
  }

  get visible(): boolean {
    return this.shown;
  }

  get position(): Vec3 | null {
    return this.model ? { ...this.model.pos } : null;
  }

  /** Builds or disposes the visual (its reader: a flag, an item). */
  setWanted(on: boolean): void {
    if (on === this.active) return;
    if (!on) {
      this.visual?.dispose();
      this.visual = null;
      this.model = null;
      this.shown = false;
      return;
    }
    this.visual = this.build();
    this.p.scene.add(this.visual.root);
    this.applyShown(false);
    this.model = new FollowModel(this.p.feet(), this.p.yaw(), this.tuning);
    this.shown = false;
  }

  /** A load or fast travel: he reappears behind Cael. */
  requestPlace(): void {
    if (this.model) this.shown = false;
  }

  fixedUpdate(dt: number): void {
    const v = this.visual;
    const m = this.model;
    if (!v || !m || !(dt > 0)) return;
    const feet = this.p.feet();
    const tooFar = this.p.mounted() && Math.hypot(m.pos.x - feet.x, m.pos.z - feet.z) > this.tuning.teleportDistance;
    const hide = this.p.indoors() || this.p.stealth() || tooFar;
    if (hide) {
      this.setShown(false);
      return;
    }
    if (!this.shown) {
      if (!this.placeBehind(feet)) return;
      this.setShown(true);
    }
    const step = m.step({ dt, player: feet, playerYaw: this.p.yaw(), groundAt: (x, z, y) => this.p.groundAt(x, z, y) });
    if (step.teleport && !this.placeBehind(feet)) this.setShown(false);
    v.setGait(m.gait);
    v.root.position.set(m.pos.x, m.pos.y + this.lift, m.pos.z);
    v.root.rotation.y = m.yaw;
    v.update(dt);
  }

  dispose(): void {
    this.setWanted(false);
  }

  private placeBehind(feet: Vec3): boolean {
    const m = this.model!;
    const yaw = this.p.yaw();
    const b = behind(feet, yaw, this.tuning.teleportBack, this.tuning.slotSide);
    const y = this.p.groundAt(b.x, b.z, feet.y);
    m.place({ x: b.x, y: y ?? feet.y, z: b.z }, yaw);
    return true;
  }

  private setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.applyShown(on);
  }

  private applyShown(on: boolean): void {
    const v = this.visual;
    if (!v) return;
    if (v.setShown) v.setShown(on);
    else v.root.visible = on;
  }
}

/** The shipped procedural Ember Hound rig at half scale; sits (the crouch, held) when idle. */
export function buildPup(): FollowerVisual {
  const body = new QuadrupedBody({ ...HOUND }, { warn: () => {} });
  const root = new THREE.Group();
  root.name = 'ember-pup';
  body.root.scale.setScalar(FOLLOWER_TUNING.pup.scale);
  root.add(body.root);
  let gait: Gait | null = null;
  return {
    root,
    setGait(g) {
      if (g === gait) return;
      gait = g;
      if (g === 'idle') body.play('Crouch', { loop: false });
      else body.play(g === 'walk' ? 'Walk' : 'Run', { loop: true });
    },
    update: (dt) => body.fixedUpdate(dt),
    dispose() {
      body.dispose();
      root.removeFromParent();
    },
  };
}

/** A small point light and an ember bead, trailing at hip height. */
export function buildBrush(): FollowerVisual {
  const t = FOLLOWER_TUNING.brush;
  const root = new THREE.Group();
  root.name = 'kindling-brush';
  const light = new THREE.PointLight(t.light.color, t.light.intensity, t.light.distance);
  const geo = new THREE.SphereGeometry(t.emberRadius, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: t.light.color });
  const ember = new THREE.Mesh(geo, mat);
  root.add(light, ember);
  let clock = 0;
  let shown = true;
  return {
    root,
    setGait() {},
    setShown(on) {
      shown = on;
      ember.visible = on;
      if (!on) light.intensity = 0;
    },
    update(dt) {
      if (!shown) return;
      // A slow flicker and bob.
      clock += dt;
      light.intensity = t.light.intensity * (0.85 + 0.15 * Math.sin(clock * 7.3) * Math.sin(clock * 3.1));
      ember.position.y = 0.05 * Math.sin(clock * 2.2);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      light.dispose();
      root.removeFromParent();
    },
  };
}

export const pupTuning = (): FollowTuning => ({ ...COMPANION_TUNING, slotBack: FOLLOWER_TUNING.pup.slotBack, slotSide: FOLLOWER_TUNING.pup.slotSide, teleportBack: 2 });
export const brushTuning = (): FollowTuning => ({ ...COMPANION_TUNING, slotBack: FOLLOWER_TUNING.brush.slotBack, slotSide: FOLLOWER_TUNING.brush.slotSide, arriveRadius: 0.2, teleportBack: 1 });
