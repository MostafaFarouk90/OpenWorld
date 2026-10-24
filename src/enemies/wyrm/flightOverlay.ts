import type * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../behaviours';
import type { ActorId } from '../ports';
import type { MoveDef } from '../types';
import { WyrmFlight } from './flight';
import { findLandingSpot } from './landing';
import type { WyrmBody } from './WyrmBody';

/** What the wyrm overlays tell the rest of the wyrm module (the plugin: decals, sounds, events). All optional. */
export interface WyrmHub {
  /** The dive telegraphed: it will land exactly at `at` when its window ends. */
  diveLocked?(actorId: ActorId, at: { x: number; y: number; z: number }, seconds: number): void;
  /** The dive ended or was cancelled. */
  diveEnded?(actorId: ActorId): void;
  /** Brought down by a broken wing (touchdown after the fall). */
  grounded?(actorId: ActorId, byId: ActorId | null): void;
  /** A sound at a world point (`sfx.wyrm.<key>`). */
  sfx?(key: string, at: { x: number; y: number; z: number }): void;
}

/** Duck-typed altitude control of a `WyrmBody`. */
type Flier = Pick<WyrmBody, 'setAltitude'>;

/**
 * The `wyrm-flight` overlay (the Ember Wyrm): drives `WyrmFlight` from the brain, steers the circle and strafe, takes
 * off and lands the mover, turns a poise break or stun in the air into the fall, gates Calm to the grounded stagger
 * after a broken wing, and locks the dive's landing point at its telegraph.
 */
export function makeFlightOverlay(ctx: BehaviourContext, hub: WyrmHub = {}): BehaviourOverlay {
  const indoors = ctx.indoors();
  const flight = new WyrmFlight({ canFly: !indoors && !ctx.options.peaceful, startEngaged: !!ctx.options.aggro && !indoors, rng: ctx.rng });
  const body = ctx.body as unknown as Partial<Flier>;
  let fallBy: ActorId | null = null;
  let diveAt: { x: number; y: number; z: number } | null = null;
  let resting = !!ctx.options.peaceful;
  let lastBeat = 0;
  const target = { x: 0, z: 0 };
  const self = { x: 0, z: 0 };
  const ports = {
    heightAt: (x: number, z: number) => ctx.host.heightAt(x, z),
    raycast: (o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, l: number) => ctx.raycast(o, d, l),
  };
  const sfx = (key: string) => {
    const f = ctx.feet();
    hub.sfx?.(key, { x: f.x, y: f.y + flight.altitude, z: f.z });
  };

  /** Acts on the flight's requests (take off, find a landing spot, touch down). */
  const serve = () => {
    const r = flight.requests;
    if (r.takeoff) {
      ctx.fly(true);
      resting = false;
    }
    if (r.findLanding) {
      const spot = findLandingSpot(r.findLanding, ports);
      if (spot) flight.landAt(spot);
      else flight.landingBlocked();
    }
    if (r.touchdown) {
      const f = ctx.feet();
      let at: { x: number; y: number; z: number } | null = null;
      if (r.touchdown.at) at = { x: r.touchdown.at.x, y: ctx.host.heightAt(r.touchdown.at.x, r.touchdown.at.z), z: r.touchdown.at.z };
      else at = findLandingSpot({ x: f.x, z: f.z }, ports) ?? { x: f.x, y: ctx.host.heightAt(f.x, f.z), z: f.z };
      const moved = Math.hypot(at.x - f.x, at.z - f.z);
      ctx.fly(false, at);
      // A landing spot away from the trail: lay the body out there instead of streaming it across the gap.
      if (moved > 1) (ctx.body as Partial<Pick<WyrmBody, 'resetSpine'>>).resetSpine?.();
      if (r.touchdown.reason === 'dive') {
        diveAt = null;
        hub.diveEnded?.(ctx.actorId);
      }
      if (r.touchdown.reason === 'fall') {
        if (flight.downed) {
          // The 3 s break stagger (and its mercy window) starts at touchdown, with its clip held as long.
          ctx.brain.staggered(fallBy);
          ctx.playOneShot('Hit_B', ctx.def.breakStaggerSeconds ?? 3);
          hub.grounded?.(ctx.actorId, fallBy);
        }
        fallBy = null;
      }
    }
    flight.clearRequests();
  };

  return {
    notices(noticed) {
      return resting ? false : noticed;
    },

    intent(dt, intent, senses) {
      if (senses.targetPos) {
        target.x = senses.targetPos.x;
        target.z = senses.targetPos.z;
      }
      self.x = senses.self.x;
      self.z = senses.self.z;
      const state = ctx.brain.state;
      const steer = flight.step(dt, {
        self,
        target: senses.targetPos ? target : null,
        engaged: ctx.brain.target !== null,
        swinging: state === 'telegraph' || state === 'attack',
        striking: state === 'attack',
        free: state === 'chase' || state === 'notice' || state === 'idle' || state === 'patrol',
      });
      serve();
      if (!steer) return;
      // In the air the flight steers; the brain's own swing states (the dive's telegraph and window) are left alone.
      if (state === 'telegraph' || state === 'attack') return;
      intent.goal = steer.goal ? { x: steer.goal.x, z: steer.goal.z } : null;
      intent.speed = steer.speed;
      intent.face = steer.face ? { x: steer.face.x, z: steer.face.z } : null;
      intent.stopDistance = 0.3;
    },

    allowMove(move: MoveDef) {
      return flight.allows(move.flight);
    },

    animate() {
      body.setAltitude?.(flight.altitude);
      // A wingbeat at each flap peak while flying (every 0.8 s), the Grimtooth-style positional sound.
      if (flight.flying) {
        lastBeat += 1 / 60;
        if (lastBeat >= 0.8) {
          lastBeat = 0;
          sfx('wingbeat');
        }
      } else lastBeat = 0;
    },

    loco() {
      return resting ? 'Rest' : null;
    },

    // Calm (an offering) and the Warm Hand only in the grounded stagger after a broken wing (ruling 6).
    mercyOpen(open) {
      return open && flight.downed && !flight.airborne && ctx.brain.state === 'stagger';
    },
    calmOpen() {
      return false;
    },
    warmHandOpen(open) {
      return open && flight.downed && !flight.airborne;
    },

    staggered(byId) {
      resting = false;
      if (!flight.fall('wing')) return false;
      // Falling: a status stun holds it (no mercy window) until touchdown; the swing in progress is cancelled.
      fallBy = byId;
      ctx.brain.stunned(0.6);
      return true;
    },

    stunned(seconds) {
      if (!flight.flying) return false;
      flight.fall('stun');
      ctx.brain.stunned(Math.max(seconds, 0.6));
      return true;
    },

    telegraphed(move) {
      if (move.id.endsWith('.dive')) {
        flight.diveStarted();
        const p = ctx.aim?.() ?? ctx.host.player.feet;
        diveAt = { x: p.x, y: ctx.host.heightAt(p.x, p.z), z: p.z };
        hub.diveLocked?.(ctx.actorId, diveAt, move.windup + (move.activeEnd - move.activeStart) * (ctx.body.clipDuration(move.clip) ?? 1.6));
        sfx('screech');
      } else if (move.id.endsWith('.spit')) sfx('inhale');
    },

    leapPoint(move) {
      return move.id.endsWith('.dive') && diveAt ? { x: diveAt.x, z: diveAt.z } : null;
    },

    actorPosition(out: THREE.Vector3) {
      out.y += flight.altitude;
    },

    refusesPull() {
      return flight.airborne;
    },

    hit() {
      resting = false;
    },

    stateChanged(from, to) {
      // A dive cancelled before its window (a light hit in the telegraph) clears the decal.
      if (diveAt && from === 'telegraph' && to !== 'attack') {
        diveAt = null;
        hub.diveEnded?.(ctx.actorId);
      }
    },

    sleep() {
      if (!flight.airborne) return;
      // Put to sleep in the air: on the ground first, so `wake` never restores a kinematic body mid-air.
      flight.forceGround();
      serve();
      body.setAltitude?.(0);
    },

    dispose() {
      if (diveAt) hub.diveEnded?.(ctx.actorId);
      diveAt = null;
    },
  };
}
