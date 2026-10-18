import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { HurtboxDef } from '../../combat/types';
import type { ActorId, ActorLike, DamageResultLike } from '../ports';
import type { AiState, EnemyView } from '../types';
import { FOE_FADE_GRACE_SECONDS } from './tuning';
import type { FoeEnd, FoeEnv, FoeKind, FoeSpawnInfo } from './types';

/** What a foe's primitive-built body gives the base class. Nothing here needs an asset. */
export interface FoeVisual {
  /** Feet at the origin; placed and turned by the foe. */
  root: THREE.Group;
  hurtboxDefs: HurtboxDef[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

export type FoePhase = 'alive' | 'dying' | 'fading' | 'gone';

/**
 * A brainless mortal actor: registers as an actor with hurtboxes, takes damage through the normal path
 * and has a small behaviour script in `think`/`animate`/`react`/`render`. Subclasses are the three foes.
 */
export abstract class Foe {
  readonly actor: ActorLike;
  readonly hurtboxes: HurtboxSet;
  readonly slug: string;
  readonly spawnerId: string | null;
  readonly damageScale: number;
  protected phase: FoePhase = 'alive';
  protected goneHow: FoeEnd = 'despawned';
  protected readonly removers: Array<() => void> = [];
  private phaseTime = 0;
  private fadeSeconds = 1;
  private fadeHandledByVfx = false;
  private dissolved = false;

  constructor(
    protected readonly env: FoeEnv,
    protected readonly info: FoeSpawnInfo,
    protected readonly visual: FoeVisual,
  ) {
    const host = env.host;
    this.slug = info.slug;
    this.spawnerId = info.spawnerId;
    this.damageScale = info.damageScale;
    const root = visual.root;
    host.scene.add(root);
    root.position.set(info.feet.x, info.feet.y, info.feet.z);
    root.rotation.set(0, info.yaw, 0);
    root.updateMatrixWorld(true);
    let hurtboxes: HurtboxSet | null = null;
    let actor: ActorLike | null = null;
    try {
      hurtboxes = new HurtboxSet(root, visual.hurtboxDefs, root);
      actor = host.actors.spawn({
        kind: info.def.kind,
        team: info.def.team,
        level: info.level,
        maxHealth: info.maxHealth,
        maxPoise: info.def.maxPoise,
        root,
        owner: root,
        spawnTag: info.spawnTag,
      });
      actor.data['audio'] = { material: info.def.material };
      actor.data['enemies'] = this.view;
      this.removers.push(host.combat.addTarget(hurtboxes, actor.id));
    } catch (err) {
      for (const remove of this.removers.splice(0)) remove();
      if (actor) host.actors.despawn(actor.id);
      hurtboxes?.dispose();
      this.disposeVisual();
      throw err;
    }
    this.hurtboxes = hurtboxes;
    this.actor = actor;
  }

  get id(): ActorId {
    return this.actor.id;
  }

  get kind(): FoeKind {
    return this.info.def.kind;
  }

  get root(): THREE.Group {
    return this.visual.root;
  }

  get view(): EnemyView {
    const self = this;
    return {
      get actorId() {
        return self.actor?.id ?? '';
      },
      kind: this.info.def.kind,
      get state() {
        return self.phase === 'alive' ? self.aiState() : 'dead';
      },
      spawnerId: this.spawnerId,
      get level() {
        return self.actor?.level ?? 1;
      },
    };
  }

  /** The nearest `AiState` word for `enemies.view(id).state`. */
  protected aiState(): AiState {
    return 'idle';
  }

  get isGone(): boolean {
    return this.phase === 'gone';
  }

  /** Alive and taking part (not dying or fading). */
  get active(): boolean {
    return this.phase === 'alive';
  }

  // ---- phases (called by the foe manager) -----------------------------------------------------------

  /** `intent` phase. */
  think(_dt: number): void {}

  /** `animation` phase: matrices current for combat. */
  animate(_dt: number): void {
    if (this.phase !== 'gone') this.visual.root.updateMatrixWorld(true);
  }

  /** `afterCombat` phase: the death and clearing fade. */
  react(dt: number): void {
    if (this.phase === 'gone') return;
    this.phaseTime += dt;
    if (this.phase === 'dying') {
      this.startFade(this.deathFadeSeconds());
      return;
    }
    if (this.phase !== 'fading') return;
    if (this.fadeHandledByVfx) {
      if (this.dissolved || this.phaseTime >= this.fadeSeconds + FOE_FADE_GRACE_SECONDS) this.despawn();
      return;
    }
    this.setOpacity(Math.max(0, 1 - this.phaseTime / this.fadeSeconds));
    if (this.phaseTime >= this.fadeSeconds) this.despawn();
  }

  render(_alpha: number): void {}

  // ---- events (from the foe manager) ----------------------------------------------------------------

  /** damage.dealt on this foe. */
  damaged(_result: DamageResultLike): void {}

  /** actor.died: stop at once, fade, despawn. */
  died(): void {
    if (this.phase !== 'alive') return;
    this.goneHow = 'died';
    this.disarm();
    this.phase = 'dying';
    this.phaseTime = 0;
  }

  /** Despawns the actor; `actor.despawned` then calls `cleanup`. */
  despawn(): void {
    if (this.phase === 'gone') return;
    this.env.host.actors.despawn(this.actor.id);
    this.cleanup();
  }

  /** Frees everything; idempotent (also used when something else despawned the actor). */
  cleanup(): void {
    if (this.phase === 'gone') return;
    this.onCleanup();
    this.disarm();
    this.phase = 'gone';
    this.disposeVisual();
    this.hurtboxes.dispose();
    this.env.gone(this, this.goneHow);
  }

  /** A subclass constructor failed after `super`: undo everything so a failed spawn leaves nothing behind. */
  protected abort(): void {
    this.disarm();
    this.phase = 'gone';
    this.env.host.actors.despawn(this.actor.id);
    this.hurtboxes.dispose();
    this.disposeVisual();
  }

  // ---- for subclasses -------------------------------------------------------------------------------

  protected deathFadeSeconds(): number {
    return 1;
  }

  /** Subclass cleanup before the base frees things (listeners, extra combat registrations). */
  protected onCleanup(): void {}

  /** Out of combat for good: no hurtboxes registered, not hittable. */
  protected disarm(): void {
    for (const remove of this.removers.splice(0)) {
      try {
        remove();
      } catch (err) {
        this.env.host.warn(`enemies: removing ${this.actor.id} from combat failed: ${String(err)}`);
      }
    }
    this.actor.hittable = false;
  }

  /** Dissolves (vfx) or fades the body over `seconds`, then despawns. */
  protected startFade(seconds: number): void {
    if (this.phase === 'fading' || this.phase === 'gone') return;
    this.phase = 'fading';
    this.phaseTime = 0;
    this.fadeSeconds = seconds;
    const vfx = this.env.host.services.get('vfx');
    if (!vfx) return;
    this.fadeHandledByVfx = true;
    const done = () => {
      this.dissolved = true;
    };
    try {
      vfx.dissolve(this.visual.root, seconds).then(done, done);
    } catch (err) {
      this.env.host.warn(`enemies: vfx dissolve failed for ${this.actor.id}: ${String(err)}`);
      this.fadeHandledByVfx = false;
    }
  }

  protected setOpacity(o: number): void {
    const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
    for (const m of this.visual.materials) {
      const transparent = v < 1;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent || m.userData['baseTransparent'] === true;
      m.opacity = v;
    }
  }

  /** Horizontal distance from the foe's root to a point. */
  protected distanceTo(p: { x: number; z: number }): number {
    const r = this.visual.root.position;
    return Math.hypot(p.x - r.x, p.z - r.z);
  }

  private disposeVisual(): void {
    for (const m of this.visual.materials) m.dispose();
    for (const g of this.visual.geometries) g.dispose();
    this.visual.root.removeFromParent();
  }
}
