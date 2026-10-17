import * as THREE from 'three';
import { ControllerAttackWindow } from '../combat/ControllerAttackWindow';
import { CombatSystem } from '../combat/CombatSystem';
import { HurtboxSet } from '../combat/HurtboxSet';
import { WeaponTracer } from '../combat/WeaponTracer';
import type { HitEvent } from '../combat/types';
import { COMBAT } from '../config/constants';
import type { KnightAvatar } from '../characters/KnightAvatar';

export interface CombatSounds {
  /** A hit landed at `position` (world space). */
  hit(position: { x: number; y: number; z: number }, damage: number): void;
}

export interface HitStats {
  hits: number;
  totalDamage: number;
  lastBone: string;
  lastDamage: number;
}

export interface Dummy {
  readonly model: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  readonly mixer: THREE.AnimationMixer;
  readonly idle: THREE.AnimationAction | null;
  readonly reaction: THREE.AnimationAction | null;
}

type DummyEntry = Dummy;

/** HUD line for the hit counter; empty before the first hit. */
export function formatHitStats(s: HitStats): string {
  if (s.hits === 0) return '';
  return `Hits ${s.hits} · damage ${Math.round(s.totalDamage * 10) / 10} · last ${s.lastBone} (${s.lastDamage})`;
}

/**
 * Player-versus-dummy combat inside the world: the avatar's sword traces dummy hurtboxes while the
 * animation controller says an attack is active. `fixedUpdate` must run after the avatar's fixed
 * update (contracts/animation-events.md), when mixers and matrices are final for the tick.
 */
export class WorldCombat {
  readonly combat = new CombatSystem();
  readonly stats: HitStats = { hits: 0, totalDamage: 0, lastBone: '', lastDamage: 0 };
  private readonly dummies = new Map<Dummy, DummyEntry>();
  private tracer: WeaponTracer | null = null;
  private playerBoxes: HurtboxSet | null = null;
  private disposed = false;
  private debugVisible = false;
  private readonly hitListeners = new Set<(e: HitEvent) => void>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly sounds?: CombatSounds,
  ) {
    this.unsubscribe = this.combat.bus.subscribe((e) => this.onHit(e));
  }

  get dummyCount(): number {
    return this.dummies.size;
  }

  /** Listener for every hit, after stats and sound are handled. Returns an unsubscribe function. */
  onHitEvent(listener: (e: HitEvent) => void): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  /** Arms the avatar's sword; its own hurtboxes are never hit. Second calls are ignored. */
  attachPlayer(avatar: KnightAvatar): void {
    if (this.tracer || this.disposed) return;
    avatar.root.updateMatrixWorld(true);
    const own = new HurtboxSet(avatar.model, undefined, avatar);
    this.playerBoxes = own;
    this.tracer = new WeaponTracer({
      attacker: avatar,
      weapon: avatar.weapon,
      hilt: avatar.weaponHilt,
      tip: avatar.weaponTip,
      ownHurtboxes: own,
      bus: this.combat.bus,
    });
    this.combat.addAttacker(this.tracer, new ControllerAttackWindow(avatar.controller));
  }

  /** Adds an Idle Knight as a training dummy. `model` is placed in the scene by the caller or here. */
  addDummy(model: THREE.Object3D, clips: THREE.AnimationClip[]): Dummy {
    if (this.disposed) throw new Error('WorldCombat: disposed');
    if (!model.parent) this.scene.add(model);
    model.updateMatrixWorld(true);
    const hurtboxes = new HurtboxSet(model, undefined, model);
    const mixer = new THREE.AnimationMixer(model);
    const idleClip = THREE.AnimationClip.findByName(clips, 'Idle');
    const idle = idleClip ? mixer.clipAction(idleClip).play() : null;
    const hitClip = THREE.AnimationClip.findByName(clips, COMBAT.dummyReactionClip);
    let reaction: THREE.AnimationAction | null = null;
    if (hitClip) {
      reaction = mixer.clipAction(hitClip);
      reaction.setLoop(THREE.LoopOnce, 1);
      reaction.clampWhenFinished = true; // hold the last pose while Idle fades back in
      mixer.addEventListener('finished', (ev) => {
        if ((ev as unknown as { action: THREE.AnimationAction }).action !== reaction || !idle) return;
        idle.reset().play().crossFadeFrom(reaction!, COMBAT.dummyReactionFadeSeconds, false);
        // The faded-out reaction is stopped by the mixer once its weight reaches 0.
      });
    }
    const entry: DummyEntry = { model, hurtboxes, mixer, idle, reaction };
    this.dummies.set(entry, entry);
    this.combat.addTarget(hurtboxes);
    if (this.debugVisible) this.setDebugVisible(true);
    return entry;
  }

  /** Stops tracing the dummy, also mid-swing, and frees its hurtboxes. Unknown dummies are ignored. */
  removeDummy(dummy: Dummy): void {
    const entry = this.dummies.get(dummy);
    if (!entry) return;
    this.dummies.delete(dummy);
    this.combat.removeTarget(entry.hurtboxes);
    entry.mixer.stopAllAction();
    entry.hurtboxes.dispose();
    entry.model.removeFromParent();
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    for (const d of this.dummies.values()) {
      if (visible && !d.hurtboxes.debugMesh.parent) this.scene.add(d.hurtboxes.debugMesh);
      d.hurtboxes.setDebugVisible(visible);
    }
  }

  fixedUpdate(dt: number): HitEvent[] {
    if (this.disposed) return [];
    for (const d of this.dummies.values()) {
      d.mixer.update(dt);
      d.model.updateMatrixWorld(true);
    }
    this.playerBoxes?.tickFlash(dt);
    return this.combat.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    for (const d of [...this.dummies.values()]) {
      this.combat.removeTarget(d.hurtboxes);
      d.mixer.stopAllAction();
      d.hurtboxes.dispose();
      d.model.removeFromParent();
    }
    this.dummies.clear();
    this.playerBoxes?.dispose();
    this.playerBoxes = null;
    this.hitListeners.clear();
    this.combat.dispose();
  }

  private onHit(e: HitEvent): void {
    this.stats.hits++;
    this.stats.totalDamage += e.damage;
    this.stats.lastBone = e.bone;
    this.stats.lastDamage = e.damage;
    const entry = [...this.dummies.values()].find((d) => d.model === e.target);
    if (entry?.reaction) {
      entry.reaction.reset().play();
      if (entry.idle) entry.reaction.crossFadeFrom(entry.idle, COMBAT.dummyReactionFadeSeconds, false);
    }
    // One failing consumer must not stop the others or the simulation.
    try {
      this.sounds?.hit(e.point, e.damage);
    } catch (err) {
      console.error('WorldCombat: hit sound failed', err);
    }
    for (const l of [...this.hitListeners]) {
      try {
        l(e);
      } catch (err) {
        console.error('WorldCombat: hit listener failed', err);
      }
    }
  }
}
