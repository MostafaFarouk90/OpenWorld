import type * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId, DamageResultLike } from '../../ports';
import type { MoveDef } from '../../types';
import { HAWK, HAWK_PARENT } from '../tuning';
import { HawkFlight, type XZ } from './flight';

/** Duck-typed extras of the hawk body (HawkBody). */
interface HawkBodyLike {
  setAltitude?(m: number): void;
  setFlash?(t: number): void;
  setOpacity(o: number): void;
}

type XYZ = { x: number; y: number; z: number };
type WaterLike = { volumeAt(p: XYZ): { kind: string } | null };
type StealthLike = { active(): boolean; hidden(): boolean };

/**
 * A hit that knocks a hawk out of its hover or dive (coordinator ruling B): a landed player hit by a projectile. There is
 * no projectile flag on a damage request, so it is a Pathfinder bolt (`pathfinder.bolt.*`, its blasts included) or a cast
 * (`kind: 'spell'`: the Emberwright's bolts and other spells). Status ticks never count.
 */
export function isGroundingHit(r: Pick<DamageResultLike, 'kind' | 'attackId' | 'outcome'>): boolean {
  if (r.outcome !== 'hit' || r.kind === 'status' || r.kind === 'script') return false;
  if (r.kind === 'spell') return true;
  return (r.attackId ?? '').startsWith('pathfinder.bolt');
}

/** The view other modules read (tests, the plugin, K13's R18 step). */
export interface HawkView {
  mode: HawkFlight['mode'];
  altitude: number;
  grounded: boolean;
  stoops: number;
}
const VIEWS = new Map<ActorId, () => HawkView>();
export function hawkView(actorId: ActorId): HawkView | null {
  return VIEWS.get(actorId)?.() ?? null;
}

/**
 * The `hawk` overlay (the Rime Hawk, plans/act3-K6b-pr2.md section 2): drives `HawkFlight` from the brain, circles out of
 * reach, gates `hawk.stoop` to the soar and `hawk.rake` to the skim after a dive, locks the dive's line when its window opens,
 * calls the hover off when the target goes into water or out of sight, knocks the hawk down on a projectile in the hover or
 * dive or a poise break in the air, gates Calm to the grounded stagger or the nest, and flies it off when calmed. Options
 * `nest` (an anchor id: perch there) and `nestGuard` (the R18 parents: stoop only near the nest, break off after a stoop once
 * the target backs away).
 */
export function makeHawkOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const opts = ctx.options as BehaviourContext['options'] & { nest?: string; nestGuard?: boolean };
  const spawnAt = ctx.feet();
  const nestAnchor = opts.nest ? ctx.host.anchors.find(opts.nest) : undefined;
  if (opts.nest && !nestAnchor) ctx.host.warn(`[hawk] ${ctx.slug}: nest anchor '${opts.nest}' is missing; it soars instead`);
  const nest: XZ | null = nestAnchor ? { x: nestAnchor.position.x, z: nestAnchor.position.z } : null;
  const guard = opts.nestGuard === true;
  const home: XZ = nest && guard ? nest : { x: spawnAt.x, z: spawnAt.z };
  const flight = new HawkFlight({
    home,
    // A guarding parent circles its nest (K4's circling anchors), it does not sit on it.
    nest: guard ? null : nest,
    startAirborne: guard || !nest,
    homeRadius: guard ? HAWK_PARENT.circleRadius : undefined,
    rng: ctx.rng,
  });
  const body = ctx.body as unknown as HawkBodyLike;
  const svc = ctx.host.services as unknown as { get(name: string): unknown };
  let fallBy: ActorId | null = null;
  /** Why it is falling: a poise break or a projectile (`break`: the grounded stagger and its Calm window) or a status stun. */
  let fallStun = false;
  /** An R18 parent broke off after a stoop: it ignores Cael until he comes back inside `HAWK_PARENT.stoopRadius`. */
  let brokeOff = false;
  let stoops = 0;
  let leaveT = 0;
  let deadAlt = -1;
  const self = { x: 0, z: 0 };
  const target = { x: 0, z: 0 };

  const aim = (): Readonly<XYZ> => ctx.aim?.() ?? ctx.host.player.feet;
  /** The target is in water, or (stealth) hidden from it: no stoop starts, and a hover is called off. Null: open to a stoop. */
  const shielded = (): 'water' | 'hidden' | null => {
    const p = aim();
    const water = svc.get('water') as WaterLike | undefined;
    if (water?.volumeAt({ x: p.x, y: p.y + 0.1, z: p.z })) return 'water';
    const stealth = svc.get('stealth') as StealthLike | undefined;
    if (!stealth?.active()) return null;
    // In a stealth section an ambient hawk leaves Cael alone; a nest parent (R18) stoops on him only when he is seen.
    return (guard ? stealth.hidden() : true) ? 'hidden' : null;
  };
  const fromNest = (p: XZ): number => (nest ? Math.hypot(p.x - nest.x, p.z - nest.z) : 0);

  const serve = () => {
    const r = flight.requests;
    if (r.takeoff) ctx.fly(true);
    if (r.touchdown) {
      const f = ctx.feet();
      const at = r.touchdown.at ?? { x: f.x, z: f.z };
      ctx.fly(false, { x: at.x, y: nestAnchor && r.touchdown.reason === 'perch' ? nestAnchor.position.y : ctx.host.heightAt(at.x, at.z), z: at.z });
      if (r.touchdown.reason === 'fall' && !fallStun && ctx.brain.state !== 'dead' && !ctx.brain.finished) {
        // Grounded: the stagger (and its Calm window) starts at touchdown.
        ctx.brain.staggered(fallBy);
        ctx.playOneShot('Hit_B', ctx.def.breakStaggerSeconds ?? HAWK.groundedSeconds);
      }
      fallBy = null;
      fallStun = false;
    }
    flight.clearRequests();
  };

  const knockDown = (byId: ActorId | null): boolean => {
    if (!flight.knockDown()) return false;
    fallBy = byId;
    fallStun = false;
    // Held through the fall (no Calm window yet); the swing in progress is cancelled.
    ctx.brain.stunned(HAWK.fallSeconds + 0.1);
    return true;
  };

  const offHit = ctx.host.events.on('damage.dealt', (r) => {
    if (r.attackerId === ctx.actorId && r.outcome !== 'immune' && ctx.brain.currentMove?.id.endsWith('.stoop')) flight.stoopLanded();
    if (r.targetId !== ctx.actorId || r.killed || !flight.stooping) return;
    if (!r.attackerId || ctx.host.actors.get(r.attackerId)?.team !== 'player') return;
    if (isGroundingHit(r)) knockDown(r.attackerId);
  });

  VIEWS.set(ctx.actorId, () => ({ mode: flight.mode, altitude: flight.altitude, grounded: flight.grounded, stoops }));

  return {
    // A parent that broke off (or whose target is past the leash) does not notice Cael again until he comes back inside the
    // stoop radius: no re-aggro loop at the leash edge (the combat music and companions key on aggro).
    notices(noticed, senses) {
      if (!guard || !nest || !senses.targetPos) return noticed;
      const d = fromNest(senses.targetPos);
      if (brokeOff && d <= HAWK_PARENT.stoopRadius) brokeOff = false;
      if (brokeOff || d > HAWK_PARENT.leash) return false;
      return noticed;
    },

    intent(dt, intent, senses) {
      if (senses.targetPos) {
        target.x = senses.targetPos.x;
        target.z = senses.targetPos.z;
      }
      self.x = senses.self.x;
      self.z = senses.self.z;
      const state = ctx.brain.state;
      if (state === 'telegraph' && flight.stooping) {
        const why = shielded();
        if (why) {
          // The hover is called off: no dive, it climbs away. In water it keeps its target (no trip home to heal); hidden in a
          // stealth section it lets Cael go.
          flight.abortStoop();
          if (why === 'hidden') ctx.brain.standDown();
          else ctx.brain.abortSwing();
        }
      }
      if (guard && nest && senses.targetPos && state === 'notice' && (brokeOff || fromNest(target) > HAWK_PARENT.leash)) {
        // A packmate's alert would pull it back in: it lets the target go before it ever takes it up (no aggro ping-pong).
        ctx.brain.standDown();
      } else if (guard && nest && senses.targetPos && ctx.brain.target !== null && state !== 'telegraph' && state !== 'attack') {
        const d = fromNest(target);
        // A parent never chases far from the nest, and after a stoop it lets a target that backed away go.
        if (d > HAWK_PARENT.leash || (stoops > 0 && d > HAWK_PARENT.breakOffRadius && flight.mode !== 'stoop')) {
          ctx.brain.standDown();
          stoops = 0;
          brokeOff = true;
        }
      }
      const steer = flight.step(dt, {
        self,
        target: senses.targetPos ? target : null,
        engaged: ctx.brain.target !== null,
        swinging: state === 'telegraph' || state === 'attack',
        striking: state === 'attack',
        free: state === 'chase' || state === 'notice' || state === 'idle' || state === 'patrol' || state === 'return',
        returning: state === 'return',
      });
      serve();
      if (!steer) return;
      if (state === 'telegraph' || state === 'attack') return;
      intent.goal = steer.goal ? { x: steer.goal.x, z: steer.goal.z } : null;
      intent.speed = steer.speed;
      intent.face = steer.face ? { x: steer.face.x, z: steer.face.z } : null;
      intent.stopDistance = 0.3;
    },

    allowMove(move: MoveDef) {
      if (move.id.endsWith('.stoop')) {
        if (!flight.canStoop || shielded() !== null) return false;
        return !(guard && nest && fromNest(aim()) > HAWK_PARENT.stoopRadius);
      }
      if (move.id.endsWith('.rake')) return flight.canRake;
      return !flight.airborne;
    },

    animate(dt) {
      if (ctx.brain.state === 'dead') {
        // Shot dead in the air: it drops.
        if (deadAlt < 0) deadAlt = flight.altitude;
        deadAlt = Math.max(0, deadAlt - dt * 18);
        body.setAltitude?.(deadAlt);
        body.setFlash?.(0);
        return;
      }
      if (leaveT > 0) return; // the leave drives altitude itself
      body.setAltitude?.(flight.altitude);
      body.setFlash?.(flight.stooping && ctx.brain.state === 'telegraph' ? 1 : 0);
    },

    loco() {
      if (flight.mode === 'perched') return 'Rest';
      return null;
    },

    // Calm (Hawk Jerky) only grounded: knocked down and lying stunned, or perched on its nest and unstruck (ruling 14).
    mercyOpen(open) {
      if (flight.mode === 'grounded') return open && ctx.brain.state === 'stagger';
      if (flight.mode === 'perched') return open;
      return false;
    },
    calmOpen(open) {
      return open && flight.mode === 'perched';
    },
    warmHandOpen(open) {
      return open && flight.mode === 'grounded';
    },
    calmContext() {
      return { grounded: flight.grounded };
    },

    staggered(byId) {
      // A poise break in the air knocks it down at any height (no bird stays up with a broken wing).
      return knockDown(byId);
    },

    stunned(seconds) {
      if (!flight.airborne || flight.mode === 'falling') return false;
      flight.knockDown();
      // A stun is not a stagger: it lands stunned, with no Calm window (the status holds it down).
      fallStun = true;
      fallBy = null;
      ctx.brain.stunned(Math.max(seconds, HAWK.fallSeconds + 0.1));
      return true;
    },

    stateChanged(from) {
      // A calm revoked mid-leave (struck while it flew off): back on the ground at full opacity, hostile again; it takes off
      // from there. The next calm starts a fresh leave.
      if (from !== 'calmed' || leaveT === 0) return;
      leaveT = 0;
      body.setOpacity(1);
      flight.forceGround();
      serve();
      body.setAltitude?.(0);
    },

    telegraphed(move) {
      if (move.id.endsWith('.stoop')) {
        flight.stoopStarted();
        stoops++;
      }
    },

    // The dive's line is locked as the window opens (the end of the hover): a timed dodge on the shriek beats it.
    leapPoint(move) {
      if (!move.id.endsWith('.stoop')) return null;
      const p = aim();
      const f = ctx.feet();
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) return { x: p.x, z: p.z };
      return { x: p.x + (dx / len) * HAWK.diveOvershoot, z: p.z + (dz / len) * HAWK.diveOvershoot };
    },

    actorPosition(out: THREE.Vector3) {
      out.y += leaveT > 0 ? 0 : flight.altitude;
    },

    refusesPull() {
      return flight.airborne;
    },

    leave(dt, how) {
      // Calmed (or retired): up and away to its nest, else away from the player, fading out.
      if (leaveT === 0) {
        ctx.fly(true);
        body.setFlash?.(0);
      }
      leaveT += dt;
      const f = ctx.feet();
      const p = ctx.host.player.feet;
      let dx = nest ? nest.x - f.x : f.x - p.x;
      let dz = nest ? nest.z - f.z : f.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) {
        dx = 1;
        dz = 0;
      }
      const speed = nest && len < HAWK.perchRadius ? 0 : HAWK.flySpeed;
      const l = Math.hypot(dx, dz);
      ctx.move({ x: (dx / l) * speed, z: (dz / l) * speed }, dt);
      body.setAltitude?.(Math.max(flight.altitude, 1) + leaveT * HAWK.leaveClimb);
      const left = HAWK.leaveSeconds - leaveT;
      body.setOpacity(Math.max(0, Math.min(1, left / HAWK.fadeSeconds)));
      if (left <= 0) ctx.finish();
      void how;
      return true;
    },

    sleep() {
      if (!flight.airborne) return;
      flight.forceGround();
      serve();
      body.setAltitude?.(0);
    },

    dispose() {
      offHit();
      VIEWS.delete(ctx.actorId);
    },
  };
}
