import type * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId } from '../../ports';
import type { MoveDef } from '../../types';
import type { FlightPath, PathSample } from '../large/flightPath';
import { PathWalker } from '../large/flightPath';
import type { WyrmBody } from '../WyrmBody';
import { YSMERYTH } from './def';
import { landPath, landSpeed, leavePath, loopPath, loopSpeed, type XZ } from './flightPlan';

export type YsmerythFlight = 'loop' | 'kite' | 'land' | 'leave';

/** What the trial controller holds per spawned Ysmeryth (while the overlay lives). */
export interface YsmerythHandle {
  readonly actorId: ActorId;
  /** In the air (any flight). */
  readonly airborne: boolean;
  readonly flight: YsmerythFlight | null;
  /** The round-break loop (`trial.break`): false while already airborne or leaving. */
  flyLoop(): boolean;
  /** Down onto the mark now (the trial ended mid-flight); a no-op on the ground or while leaving. */
  landNow(): void;
  /** Up and away, then despawned (after the trial); false when not alive. */
  leave(): boolean;
  /**
   * Out of the fight (after the trial ended) or back in (a restart): passive she drops her swing and target, picks no
   * move and notices no one, so nothing lands on a yielded or floored side before she leaves.
   */
  setPassive(on: boolean): void;
}

/** The plugin's side (ysmeryth.plugin.ts). All optional: without them she fights on the ground and never flies. */
export interface YsmerythHub {
  /** The roost: the arena centre and her landing mark. Null until K4's anchors exist. */
  arena?(): { centre: XZ; land: XZ } | null;
  track?(actorId: ActorId, handle: YsmerythHandle): () => void;
  /** Took off (true) or touched down (false). */
  airborne?(actorId: ActorId, on: boolean): void;
  /** May the call be picked now (a trial runs, once per round, after `callAfter`, the player not staggered). */
  callAllowed?(actorId: ActorId): boolean;
  /** The call's window opened: the controller stuns both (or skips it when the player is staggered by then). */
  called?(actorId: ActorId): void;
  /** A move telegraphed (decals, sounds, `wyrm.ysmeryth` beats). */
  telegraphed?(actorId: ActorId, move: MoveDef): void;
}

/** Kite hysteresis: up beyond `kiteRange`, down again only inside `kiteRange - KITE_RETURN_MARGIN`, after this long on the ground. */
const KITE_RETURN_MARGIN = 5;
const KITE_GROUND_SECONDS = 2;

type Body = Partial<Pick<WyrmBody, 'setAltitude' | 'setOpacity' | 'resetSpine'>>;

/**
 * The `ysmeryth-trial` overlay: on the ground she steps (never runs) within `groundLeash` of her mark and uses the four
 * trial moves; the call only when the controller allows it, and its stun lands when its window opens. Between rounds
 * (`flyLoop`) and while the player kites beyond `kiteRange` she flies: no moves, no hits taken (the controller makes her
 * invulnerable), the altitude drawn on the body. The kite flight lands her within `landWithin` of the player's return.
 */
export function makeYsmerythOverlay(ctx: BehaviourContext, hub: YsmerythHub): BehaviourOverlay {
  const body = ctx.body as unknown as Body;
  let flight: YsmerythFlight | null = null;
  let walker: PathWalker | null = null;
  let altitude = 0;
  let callTimer = -1;
  let passive = false;
  let grounded = KITE_GROUND_SECONDS;
  const sample: PathSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };

  const arena = () => hub.arena?.() ?? null;
  const feet = () => ctx.feet();
  const playerDist = (land: XZ) => {
    const p = ctx.host.player.feet;
    return Math.hypot(p.x - land.x, p.z - land.z);
  };
  const playerFar = (land: XZ) => playerDist(land) > YSMERYTH.kiteRange;
  const playerBack = (land: XZ) => playerDist(land) < YSMERYTH.kiteRange - KITE_RETURN_MARGIN;

  const start = (kind: YsmerythFlight, path: FlightPath, speed: number) => {
    const wasAirborne = flight !== null;
    flight = kind;
    walker = new PathWalker(path, speed);
    callTimer = -1;
    if (!wasAirborne) {
      // Any swing still winding up stays on the ground (no breath jet from the take-off).
      ctx.brain.standDown();
      ctx.fly(true);
      hub.airborne?.(ctx.actorId, true);
    }
  };

  const takeOff = (kind: 'loop' | 'kite'): boolean => {
    const a = arena();
    if (!a) return false;
    const f = feet();
    const path = loopPath({ x: f.x, z: f.z }, altitude, a.centre);
    start(kind, path, loopSpeed(path));
    return true;
  };

  const land = () => {
    const a = arena();
    const f = feet();
    const to = a?.land ?? { x: f.x, z: f.z };
    const path = landPath({ x: f.x, z: f.z }, altitude, to);
    start('land', path, landSpeed(path));
  };

  const touchDown = (at?: XZ) => {
    const f = at ?? feet();
    flight = null;
    walker = null;
    altitude = 0;
    grounded = 0;
    ctx.fly(false, { x: f.x, y: ctx.host.heightAt(f.x, f.z), z: f.z });
    body.setAltitude?.(0);
    body.resetSpine?.();
    hub.airborne?.(ctx.actorId, false);
  };

  /** A flight leg ended: what comes next. */
  const legDone = () => {
    if (flight === 'leave') {
      ctx.finish();
      return;
    }
    if (flight === 'land') {
      touchDown();
      return;
    }
    // A loop (break or kite) ended: round again while the player is out of reach, else come down.
    const a = arena();
    if (a && !playerBack(a.land)) takeOff('kite');
    else land();
  };

  const handle: YsmerythHandle = {
    actorId: ctx.actorId,
    get airborne() {
      return flight !== null && flight !== 'leave';
    },
    get flight() {
      return flight;
    },
    flyLoop: () => (flight === null ? takeOff('loop') : false),
    landNow: () => {
      if (flight === null || flight === 'leave' || flight === 'land') return;
      land();
    },
    leave: () => {
      if (flight === 'leave') return false;
      if (!ctx.retire()) return false;
      return true;
    },
    setPassive: (on) => {
      if (passive === on) return;
      passive = on;
      if (on) {
        callTimer = -1;
        ctx.brain.standDown();
      }
    },
  };
  const untrack = hub.track?.(ctx.actorId, handle);

  return {
    notices() {
      return !passive;
    },

    intent(dt, intent) {
      if (flight) {
        intent.goal = null;
        intent.speed = 0;
        intent.face = null;
        // A kite loop gives way to the landing as soon as the player is back (down within `landWithin`).
        if (flight === 'kite') {
          const a = arena();
          if (a && playerBack(a.land)) land();
        }
        return;
      }
      // The call's stun when its window opens (the brain keeps the swing; a cancelled call never stuns).
      if (callTimer >= 0) {
        callTimer -= dt;
        if (callTimer < 0) hub.called?.(ctx.actorId);
      }
      grounded += dt;
      const a = arena();
      if (
        !passive &&
        a &&
        grounded >= KITE_GROUND_SECONDS &&
        playerFar(a.land) &&
        ctx.brain.state !== 'telegraph' &&
        ctx.brain.state !== 'attack'
      ) {
        takeOff('kite');
        intent.goal = null;
        intent.speed = 0;
        return;
      }
      intent.speed = Math.min(intent.speed, YSMERYTH.groundSpeed);
      if (intent.goal && a) {
        const dx = intent.goal.x - a.land.x;
        const dz = intent.goal.z - a.land.z;
        const r = Math.hypot(dx, dz);
        if (r > YSMERYTH.groundLeash) {
          intent.goal = { x: a.land.x + (dx / r) * YSMERYTH.groundLeash, z: a.land.z + (dz / r) * YSMERYTH.groundLeash };
        }
      }
    },

    allowMove(move) {
      if (flight || passive) return false;
      if (move.id === 'ysmeryth.call') return hub.callAllowed?.(ctx.actorId) ?? false;
      return true;
    },

    clampVelocity(velocity, dt) {
      if (!flight || !walker) return;
      walker.step(dt, sample);
      const f = feet();
      const k = dt > 0 ? 1 / dt : 0;
      velocity.x = (sample.x - f.x) * k;
      velocity.z = (sample.z - f.z) * k;
      altitude = sample.y;
      if (walker.done) legDone();
    },

    animate() {
      body.setAltitude?.(altitude);
      if (flight === 'leave' && walker) {
        const left = walker.path.length - walker.distance;
        body.setOpacity?.(Math.max(0, Math.min(1, left / 20)));
      }
    },

    telegraphed(move) {
      if (move.id === 'ysmeryth.call') callTimer = move.windup;
      hub.telegraphed?.(ctx.actorId, move);
    },

    stateChanged(from, to) {
      if (callTimer >= 0 && from === 'telegraph' && to !== 'attack') callTimer = -1;
    },

    actorPosition(out: THREE.Vector3) {
      out.y += altitude;
    },

    refusesPull() {
      return flight !== null;
    },

    staggered() {
      // Never knocked out of the air (she cannot be hit there anyway).
      return flight !== null;
    },

    stunned() {
      return flight !== null;
    },

    sleep() {
      // Put to sleep in the air (the player far beyond the arena, which also ends the trial by its 80 m rule; or the
      // awake cap or an unready ground patch, rare at the roost): down on her mark first, so `wake` never restores a
      // kinematic body mid-air. A break loop cut short this way simply starts the next round early.
      if (flight === null || flight === 'leave') return;
      const a = arena();
      touchDown(a?.land);
    },

    leave(dt, how) {
      if (how !== 'retired') return false;
      if (flight !== 'leave') {
        const f = feet();
        const p = ctx.host.player.feet;
        const path = leavePath({ x: f.x, z: f.z }, altitude, { x: p.x, z: p.z }, 80);
        const wasAirborne = flight !== null;
        flight = 'leave';
        walker = new PathWalker(path, YSMERYTH.flySpeed * 0.6);
        if (!wasAirborne) ctx.fly(true);
        // Leaving is not "over the roost": the trial's airborne state (and its beats) end here.
        else hub.airborne?.(ctx.actorId, false);
      }
      const v = { x: 0, z: 0 };
      walker!.step(dt, sample);
      const f = feet();
      if (dt > 0) {
        v.x = (sample.x - f.x) / dt;
        v.z = (sample.z - f.z) / dt;
      }
      altitude = sample.y;
      ctx.move(v, dt);
      if (walker!.done) ctx.finish();
      return true;
    },

    dispose() {
      untrack?.();
      if (flight !== null && flight !== 'leave') hub.airborne?.(ctx.actorId, false);
    },
  };
}
