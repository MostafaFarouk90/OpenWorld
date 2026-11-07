import { isHeavyBlow } from '../../../combat/heavyBlow';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId } from '../../ports';
import { STRIDER } from '../tuning';
import { LEG_IDS, type LegId } from './gait';
import { isStriderLeg } from './StriderBody';

type XZ = { x: number; z: number };

/** Duck-typed controls of the strider body (StriderBody). */
interface StriderBodyLike {
  setTrip?(leg: LegId | null): void;
  setDrink?(k: number): void;
  setPuddle?(at: { x: number; y: number; z: number } | null, opacity?: number): void;
  setOpacity(o: number): void;
}

/** The hit facts the trip rule reads (a damage request before it resolves). */
export interface LegHit {
  outcome?: string;
  kind: string;
  bone?: string;
  attackId?: string;
  poise?: number;
}

/**
 * A hit that trips a leg at once: a projectile (a Pathfinder bolt or its blast), a spell, or a heavy blow (the heavy chop, or
 * any hit of 45 poise or more). Status ticks and script hits never count.
 */
export function tripsAtOnce(r: LegHit): boolean {
  if (r.kind === 'status' || r.kind === 'script') return false;
  if (r.kind === 'spell') return true;
  if ((r.attackId ?? '').startsWith('pathfinder.bolt')) return true;
  return isHeavyBlow({ attackId: r.attackId, poise: r.poise });
}

/** What the plugin's trip modifier and tests read of one strider. */
export interface StriderView {
  tripped: LegId | null;
  /** Records a light leg hit at time `now` (seconds); true when it is the second on that leg inside the window: a trip. */
  lightHit(leg: LegId, now: number): boolean;
  /** The leg the next poise break folds (set by the modifier just before it breaks the poise). */
  armTrip(leg: LegId): void;
  /** Folds `leg` now (its poise is already broken, so no stagger would follow a poise hit): the trip's stun. */
  tripNow(leg: LegId): void;
  drinking: boolean;
  /** Where it holds its target: 'back' (backing off), 'close' (closing), 'hold' (in its band), or null when not fighting. */
  range: 'back' | 'close' | 'hold' | null;
}
const VIEWS = new Map<ActorId, StriderView>();
export function striderView(actorId: ActorId): StriderView | null {
  return VIEWS.get(actorId) ?? null;
}

/**
 * The `strider` overlay (plans/act4-L5.md section 2): holds its target between `STRIDER.nearRange` and `farRange` (backs off
 * inside, closes outside, stands and faces it between), folds the tripped leg on a poise break (the waste plugin's modifier
 * breaks the poise on a leg hit), offers Calm with a Rain Flask while tripped or unaware (`grounded`), and on an accepted
 * Calm walks to the water poured where Cael stood, drinks, and stalks off fading.
 */
export function makeStriderOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const body = ctx.body as unknown as StriderBodyLike;
  let tripped: LegId | null = null;
  let armed: LegId | null = null;
  const lightHits: Record<LegId, number[]> = { fl: [], fr: [], bl: [], br: [] };
  let range: StriderView['range'] = null;
  let clock = 0;
  // The calmed leave.
  let leaveT = 0;
  let puddle: { x: number; y: number; z: number } | null = null;
  let drinkLeft = 0;
  let drinking = false;
  let toWater = 0;
  /** Leave time when the drink ended (the walk off counts from it). */
  let puddleDone = 0;
  let away: XZ = { x: 1, z: 0 };

  const view: StriderView = {
    get tripped() {
      return tripped;
    },
    lightHit(leg, now) {
      const list = lightHits[leg].filter((t) => now - t <= STRIDER.lightHitWindow);
      list.push(now);
      lightHits[leg] = list;
      if (list.length >= STRIDER.lightHitsToTrip) {
        lightHits[leg] = [];
        return true;
      }
      return false;
    },
    armTrip(leg) {
      armed = leg;
    },
    tripNow(leg) {
      armed = null;
      ctx.brain.stunned(STRIDER.tripSeconds);
      tripped = leg;
      body.setTrip?.(leg);
    },
    get drinking() {
      return drinking;
    },
    get range() {
      return range;
    },
  };
  VIEWS.set(ctx.actorId, view);

  const clearTrip = (): void => {
    if (tripped === null) return;
    tripped = null;
    body.setTrip?.(null);
  };

  return {
    intent(dt, intent, senses) {
      clock += dt;
      const state = ctx.brain.state;
      if (tripped !== null && state !== 'stagger') clearTrip();
      if (state !== 'chase' || !senses.targetPos) {
        range = null;
        return;
      }
      const d = senses.distance;
      const self = senses.self;
      const t = senses.targetPos;
      intent.face = { x: t.x, z: t.z };
      if (d < STRIDER.nearRange) {
        // Too close: step back away from the target, still facing it.
        const len = Math.max(1e-3, Math.hypot(self.x - t.x, self.z - t.z));
        const back = STRIDER.nearRange + 1.5;
        intent.goal = { x: t.x + ((self.x - t.x) / len) * back, z: t.z + ((self.z - t.z) / len) * back };
        intent.speed = ctx.def.walkSpeed * 1.4;
        intent.stopDistance = 0.3;
        range = 'back';
      } else if (d > STRIDER.farRange) {
        intent.goal = { x: t.x, z: t.z };
        intent.stopDistance = STRIDER.farRange - 1;
        range = 'close';
      } else {
        intent.goal = null;
        intent.speed = 0;
        range = 'hold';
      }
    },

    staggered() {
      // A poise break: fold the leg the modifier named (any other break folds a front leg).
      tripped = armed ?? 'fl';
      armed = null;
      body.setTrip?.(tripped);
      return false; // the brain staggers for `breakStaggerSeconds` (the trip)
    },

    stateChanged(from) {
      if (from === 'stagger') clearTrip();
      if (from === 'calmed' && leaveT > 0) {
        // A calm revoked mid-leave (struck while it walked off): it stands up at full opacity, hostile again.
        leaveT = 0;
        drinking = false;
        body.setDrink?.(0);
        body.setOpacity(1);
        body.setPuddle?.(null);
      }
    },

    // Calm (a Rain Flask) while tripped, or while it has not taken anyone up (unaware); the brain's own window otherwise.
    mercyOpen(open) {
      // A trip by a stun (`tripNow`) opens no brain window, so the trip itself is the window.
      if (tripped !== null) return ctx.brain.state === 'stagger';
      return open;
    },
    calmContext() {
      return { grounded: tripped !== null || ctx.brain.target === null };
    },

    leave(dt, how) {
      if (leaveT === 0) {
        clearTrip();
        const p = ctx.host.player.feet;
        const f = ctx.feet();
        puddle = how === 'calmed' ? { x: p.x, y: ctx.host.heightAt(p.x, p.z), z: p.z } : null;
        drinkLeft = how === 'calmed' ? STRIDER.drinkSeconds : 0;
        toWater = 0;
        puddleDone = 0;
        const len = Math.max(1e-3, Math.hypot(f.x - p.x, f.z - p.z));
        away = { x: (f.x - p.x) / len, z: (f.z - p.z) / len };
      }
      leaveT += dt;
      if (puddle) body.setPuddle?.(puddle, 0.55 * Math.max(0, 1 - leaveT / STRIDER.puddleSeconds));
      const f = ctx.feet();
      if (puddle && drinkLeft > 0) {
        const dx = puddle.x - f.x;
        const dz = puddle.z - f.z;
        const d = Math.hypot(dx, dz);
        // It walks until its head (about 2 m ahead of its feet) is over the water, then lowers and drinks.
        // It gives up the walk after `waterSeconds` and drinks where it stands (the water is never out of its reach).
        if (d > 2.2 && !drinking && toWater < STRIDER.waterSeconds) {
          toWater += dt;
          ctx.move({ x: (dx / d) * ctx.def.walkSpeed, z: (dz / d) * ctx.def.walkSpeed }, dt);
          return true;
        }
        drinking = true;
        drinkLeft -= dt;
        body.setDrink?.(Math.min(1, (STRIDER.drinkSeconds - drinkLeft) * 2));
        if (drinkLeft <= 0) {
          drinking = false;
          body.setDrink?.(0);
          // Walk off from the water, away from Cael.
          const p = ctx.host.player.feet;
          const len = Math.max(1e-3, Math.hypot(f.x - p.x, f.z - p.z));
          away = { x: (f.x - p.x) / len, z: (f.z - p.z) / len };
          puddleDone = leaveT;
        }
        return true;
      }
      // Walk off and fade.
      ctx.move({ x: away.x * ctx.def.walkSpeed, z: away.z * ctx.def.walkSpeed }, dt);
      const walked = leaveT - puddleDone;
      const left = STRIDER.walkOffSeconds - walked;
      body.setOpacity(Math.max(0, Math.min(1, left / STRIDER.fadeSeconds)));
      if (left <= 0) {
        body.setPuddle?.(null);
        ctx.finish();
      }
      return true;
    },

    dispose() {
      VIEWS.delete(ctx.actorId);
      void LEG_IDS;
    },
  };
}

/**
 * The trip rule as a damage modifier body (the waste plugin registers it; tests call it): a player's or an ally's landed hit
 * on a strider's shin breaks its poise at once when it trips at once, or when it is the second light hit on that leg inside
 * the window. It names the leg on the strider's view first, so the stagger folds that leg.
 */
export function striderTripRule(
  req: LegHit & { poise: number },
  target: { id: string; poise: number },
  now: number,
): boolean {
  if (req.outcome !== 'hit' || req.kind === 'status' || req.kind === 'script') return false;
  const leg = isStriderLeg(req.bone);
  if (!leg) return false;
  const view = striderView(target.id);
  if (!view || view.tripped !== null) return false;
  const trip = tripsAtOnce(req) || view.lightHit(leg, now);
  if (!trip) return false;
  if (target.poise <= 0) {
    // Its poise is still broken from the last trip (it regains it only after a pause in the hits): fold the leg directly.
    view.tripNow(leg);
    return true;
  }
  view.armTrip(leg);
  req.poise = Math.max(req.poise ?? 0, target.poise);
  return true;
}
