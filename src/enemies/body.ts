import type * as THREE from 'three';
import type { AttackWindowSource } from '../combat/types';
import type { EnemyAnimator, PlayOptions, WindowPhase } from './EnemyAnimator';
import type { EnemyModel } from './EnemyModel';
import type { MoveDef, WeaponChannel } from './types';

/**
 * The visual and animation side of one enemy, as `Enemy` uses it. `HumanoidBody` wraps the KayKit rig
 * (EnemyModel plus EnemyAnimator); quadruped bodies (hound, horse) implement the same members.
 */
export interface EnemyBody {
  /** Feet at the origin; the enemy places and turns this. */
  readonly root: THREE.Group;
  /** The object the HurtboxSet and the tracers hang from. */
  readonly owner: THREE.Object3D;
  readonly hurtboxes: EnemyModel['hurtboxes'];
  readonly tracers: EnemyModel['tracers'];
  readonly weapons: EnemyModel['weapons'];
  readonly materials: THREE.Material[];
  setTelegraph(t: number, color?: THREE.ColorRepresentation): void;
  setOpacity(o: number): void;

  readonly currentClip: string | null;
  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null;
  windowSource(channel: WeaponChannel): AttackWindowSource;
  clipDuration(clip: string): number | undefined;
  play(clip: string, opts?: PlayOptions): string;
  playAttack(move: MoveDef, leadSeconds: number): number;
  cancelAttack(): void;
  /** Advances the animation by one fixed tick. */
  fixedUpdate(dt: number): void;
  /** Disposes the animation, then the visual (materials, hurtbox mesh, scene node). */
  dispose(): void;
}

/** The Knight-rig body: a thin delegate over the existing model and animator. */
export class HumanoidBody implements EnemyBody {
  constructor(
    readonly model: EnemyModel,
    readonly animator: EnemyAnimator,
  ) {}
  get root() { return this.model.root; }
  get owner() { return this.model.owner; }
  get hurtboxes() { return this.model.hurtboxes; }
  get tracers() { return this.model.tracers; }
  get weapons() { return this.model.weapons; }
  get materials() { return this.model.materials; }
  get currentClip() { return this.animator.currentClip; }
  get onWindow() { return this.animator.onWindow; }
  set onWindow(v) { this.animator.onWindow = v; }
  get onClipEnd() { return this.animator.onClipEnd; }
  set onClipEnd(v) { this.animator.onClipEnd = v; }
  setTelegraph(t: number, color?: THREE.ColorRepresentation) { this.model.setTelegraph(t, color); }
  setOpacity(o: number) { this.model.setOpacity(o); }
  windowSource(channel: WeaponChannel) { return this.animator.windowSource(channel); }
  clipDuration(clip: string) { return this.animator.clipDuration(clip); }
  play(clip: string, opts?: PlayOptions) { return this.animator.play(clip, opts); }
  playAttack(move: MoveDef, leadSeconds: number) { return this.animator.playAttack(move, leadSeconds); }
  cancelAttack() { this.animator.cancelAttack(); }
  fixedUpdate(dt: number) { this.animator.fixedUpdate(dt); }
  dispose() {
    this.animator.dispose();
    this.model.dispose();
  }
}
