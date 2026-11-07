// The gate as a taunter (plans/act5-N4.md section 4): one hidden actor per gate anchor draws foes Cael has not hit in the
// last 8 s; a foe's hit on it becomes a small cut of the gate's health (capped a second), never health on the actor.
import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import type { DamageModifier } from '../actors/DamageResolver';
import { HurtboxSet } from '../combat/HurtboxSet';
import type { GameContext } from '../core/Game';
import type { Vec3 } from '../physics/PhysicsWorld';
import { GATE } from './tuning';

export type GateHost = Pick<GameContext, 'scene' | 'actors' | 'combat' | 'damage' | 'services'>;

export const GATE_KIND = 'siege-gate';
export const GATE_MODIFIER = { id: 'siege.gate-hit', order: -49 } as const;

export interface GateOptions {
  siegeId: string;
  points: readonly Vec3[];
  maxHealth: number;
  /** True when `enemyId` may take the gate's bait (not hit by Cael in the assist window, no breach). */
  accepts(enemyId: ActorId): boolean;
  /** Applies `n` health of foot damage to the gate (the director's barricade). */
  damageGate(n: number): void;
  /** False once the gate is breached: the taunters stand down. */
  standing(): boolean;
}

/** The gate's taunters and the foot-hit rule. */
export class GateTaunters {
  private readonly parts: Array<{ actor: Actor; root: THREE.Group; hurt: HurtboxSet; off: Array<() => void> }> = [];
  private unmodify: (() => void) | null = null;
  /** Foot damage dealt in the current second (the cap). */
  private window = 0;
  private windowLeft = 1;
  private readonly cap: number;

  constructor(
    private readonly host: GateHost,
    private readonly opts: GateOptions,
  ) {
    this.cap = opts.maxHealth * GATE.footCapPctPerS;
    const taunts = host.services.get('enemies')?.taunts;
    for (const [i, p] of opts.points.entries()) {
      const root = new THREE.Group();
      root.name = `siege-gate-${i + 1}`;
      const core = new THREE.Object3D();
      core.name = 'siege-gate-core';
      core.position.y = 1;
      root.add(core);
      root.position.set(p.x, p.y, p.z);
      host.scene.add(root);
      root.updateMatrixWorld(true);
      const hurt = new HurtboxSet(root, [{ name: 'gate', bone: 'siege-gate-core', start: { x: 0, y: -0.8, z: 0 }, end: { x: 0, y: 0.8, z: 0 }, radius: GATE.hurtRadius }], root);
      const actor = host.actors.spawn({ kind: GATE_KIND, team: 'ally', maxHealth: 1e9, maxPoise: 0, root, owner: root, untargetable: true });
      actor.data['audio'] = { material: 'wood' };
      const off: Array<() => void> = [host.combat.addTarget(hurt, actor.id)];
      if (taunts) {
        off.push(
          taunts.register({
            id: actor.id,
            position: () => ({ x: p.x, y: p.y, z: p.z }),
            alive: () => opts.standing(),
            radius: GATE.tauntRadius,
            seconds: Number.POSITIVE_INFINITY,
            accepts: (enemyId) => opts.accepts(enemyId),
          }),
        );
      }
      this.parts.push({ actor, root, hurt, off });
    }
    const ids = new Set(this.parts.map((q) => q.actor.id));
    const modifier: DamageModifier = (req, target) => {
      if (!ids.has(target.id)) return;
      const foot = req.outcome === 'hit' && req.amount > 0 && opts.standing() ? this.footHit() : 0;
      req.amount = 0;
      req.poise = 0;
      if (foot > 0) opts.damageGate(foot);
    };
    this.unmodify = host.damage.addModifier(GATE_MODIFIER.id, modifier, GATE_MODIFIER.order);
  }

  get actorIds(): ActorId[] {
    return this.parts.map((p) => p.actor.id);
  }

  /** One foot hit's share, within what is left of this second's cap. */
  private footHit(): number {
    const want = this.opts.maxHealth * GATE.footHitPct;
    const n = Math.max(0, Math.min(want, this.cap - this.window));
    this.window += n;
    return n;
  }

  fixedUpdate(dt: number): void {
    this.windowLeft -= dt;
    if (this.windowLeft <= 0) {
      this.windowLeft = 1;
      this.window = 0;
    }
    for (const p of this.parts) p.root.updateMatrixWorld(true);
  }

  dispose(): void {
    this.unmodify?.();
    this.unmodify = null;
    for (const p of this.parts) {
      for (const off of p.off) off();
      this.host.actors.despawn(p.actor.id);
      p.hurt.dispose();
      p.root.removeFromParent();
    }
    this.parts.length = 0;
  }
}
