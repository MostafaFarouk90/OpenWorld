import { HEAVY_ATTACKS, HIT_STACK, STAB_ATTACKS } from './tuning';
import type { ActorsLike, ClockLike, DamageResultLike, Vec3 } from './ports';
import type { EffectId, VfxService } from './types';

export interface FeedbackPlan {
  hitStop: number;
  shake: { amplitude: number; seconds: number } | null;
  fov: number;
  effect: EffectId | null;
  /** Extra effects for heavy hits. */
  extra: EffectId[];
  sparks: number;
  pulse: number;
}

const NONE: FeedbackPlan = { hitStop: 0, shake: null, fov: 0, effect: null, extra: [], sparks: 0, pulse: 0 };

/** The hit feedback stack (design 11.0, contract vfx-and-feedback.md section 2) as a pure function. */
export function planFeedback(r: Pick<DamageResultLike, 'outcome' | 'attackId' | 'killed' | 'kind'>): FeedbackPlan {
  switch (r.outcome) {
    case 'immune':
      return NONE;
    case 'blocked':
      return { ...NONE, hitStop: HIT_STACK.blocked.hitStop, effect: 'block-spark', sparks: HIT_STACK.blocked.sparks };
    case 'parried':
      return {
        ...NONE,
        hitStop: HIT_STACK.parried.hitStop,
        shake: { amplitude: HIT_STACK.parried.shake, seconds: HIT_STACK.parried.shakeSeconds },
        fov: HIT_STACK.parried.fov,
        effect: 'parry-flash',
        extra: ['shockwave-ring'],
        pulse: 0.5,
      };
    case 'hit': {
      const heavy = r.killed || (r.attackId !== undefined && HEAVY_ATTACKS.has(r.attackId));
      if (heavy) {
        const h = HIT_STACK.heavy;
        return {
          hitStop: r.killed ? h.kill : h.hitStop,
          shake: { amplitude: h.shake, seconds: h.shakeSeconds },
          fov: h.fov,
          effect: 'hit-spark-heavy',
          extra: ['shockwave-ring', 'scorch-decal'],
          sparks: h.sparks,
          pulse: 0.25,
        };
      }
      const n = HIT_STACK.normal;
      return {
        hitStop: r.attackId !== undefined && STAB_ATTACKS.has(r.attackId) ? n.stab : n.hitStop,
        shake: { amplitude: n.shake, seconds: n.shakeSeconds },
        fov: n.fov,
        effect: 'hit-spark',
        extra: [],
        sparks: n.sparks,
        pulse: 0,
      };
    }
  }
}

export interface HitFeedbackDeps {
  vfx: Pick<VfxService, 'spawnEffect' | 'shake' | 'fovPunch' | 'pulseScreen'>;
  clock: ClockLike;
  actors: ActorsLike;
}

/**
 * Applies the stack for each `damage.dealt`. Damage numbers are the core's job (they already come from
 * the same event), so this spawns none. Spell hits are damped after the first one in a tick so a
 * five-target Surge does not stack five hit-stops and FOV punches.
 */
export class HitFeedback {
  private spellTick = -1;
  private readonly pos = { x: 0, y: 0, z: 0 };

  constructor(private readonly deps: HitFeedbackDeps) {}

  onDamage(r: DamageResultLike): void {
    const plan = planFeedback(r);
    if (!plan.effect) return;
    const { vfx, clock } = this.deps;
    const at = this.locate(r);
    const spellRepeat = r.kind === 'spell' && this.spellTick === clock.tick;
    if (r.kind === 'spell') this.spellTick = clock.tick;
    const transform = { position: at, normal: r.normal };

    vfx.spawnEffect(plan.effect, transform, { count: plan.sparks });
    for (const id of plan.extra) vfx.spawnEffect(id, transform);
    if (spellRepeat) return;

    const damp = r.kind === 'spell' ? HIT_STACK.spellDamp : 1;
    const paused = clock.frozen === true && !((clock.hitStopRemaining ?? 0) > 0);
    // Hit-stop requested while the game is paused is dropped: it would extend the stop after unpausing.
    if (plan.hitStop > 0 && !paused) clock.hitStop(plan.hitStop * damp);
    if (plan.shake) vfx.shake(plan.shake.amplitude * damp, plan.shake.seconds);
    if (plan.fov > 0) vfx.fovPunch(plan.fov * damp);
    if (plan.pulse > 0) vfx.pulseScreen(plan.pulse * damp, 0.18);
  }

  private locate(r: DamageResultLike): Vec3 {
    if (r.point && Number.isFinite(r.point.x + r.point.y + r.point.z)) return r.point;
    const target = this.deps.actors.get(r.targetId);
    if (target?.root) {
      this.pos.x = target.root.position.x;
      this.pos.y = target.root.position.y + 1;
      this.pos.z = target.root.position.z;
    } else {
      this.pos.x = this.pos.y = this.pos.z = 0;
    }
    return { ...this.pos };
  }
}
