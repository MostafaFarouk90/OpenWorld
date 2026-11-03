import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId } from '../../ports';
import { ENEMY_CLIPS } from '../../clips';
import { inWave, joinPack, packStamp, type PackMember } from '../pack';
import { OGRE } from '../tuning';

const WALK_CLIP = ENEMY_CLIPS.walk;
/** Brain states out of the fight (for the pack's `waveSize`). */
const LEFT = new Set(['return', 'released', 'spared', 'calmed', 'dead']);
/** A member past its wave that was hit this recently keeps its target (no stand-down loop with a companion's hits). */
const WAVE_HIT_HOLD_SECONDS = 6;

/** Where a calmed ogre is in its leave (tests and the plugin read it). */
export type OgreLeave = 'none' | 'walkHome' | 'sitting' | 'walkOff';
const VIEWS = new Map<ActorId, () => OgreLeave>();
export function ogreLeave(actorId: ActorId): OgreLeave | null {
  return VIEWS.get(actorId)?.() ?? null;
}

/**
 * The `ogre` overlay (the Crag Ogre, plans/act3-K6b-pr2.md section 3 and the coordinator's change): calmed, it walks back to
 * its spawn point (which the placement test keeps clear of quest props, patrol and trigger anchors, the environment prop-free
 * rule) and sits there, letting the party pass, until the player is `OGRE.sitUntilPlayerMetres` away or `OGRE.sitSeconds`
 * pass; then it walks off away from the player and fades. Retired, it walks off at once. On first sight of a target it
 * blusters for `OGRE.blusterSeconds` (no swing or throw unless struck) so the Calm window is reachable on foot. Everything else
 * is the shared stack.
 */
export function makeOgreOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const home = { ...ctx.feet() };
  let phase: OgreLeave = 'none';
  let t = 0;
  /** The walk home's time limit, set from the distance when the calm lands. */
  let homeBy = 0;
  let sitIdle = false;
  /** Seconds of this engagement, and of it with the target within reach: the bluster (see `allowMove`). */
  let engaged = 0;
  let near = 0;
  /** Player hits taken this engagement (the bluster's `blusterHits`). */
  let hits = 0;
  const blusterHits = Math.max(1, ctx.options.blusterHits ?? 1);
  const blusterSeconds = ctx.options.blusterSeconds ?? OGRE.blusterSeconds;
  VIEWS.set(ctx.actorId, () => phase);

  let since: number | null = null;
  const fighting = () => ctx.brain.target !== null && !LEFT.has(ctx.brain.state);
  const member: PackMember = {
    actorId: ctx.actorId,
    kind: 'ogre',
    engagedSince: () => {
      if (!fighting()) since = null;
      else if (since === null) since = packStamp();
      return since;
    },
    feet: () => ctx.feet(),
  };
  const leavePack = joinPack(ctx.host, ctx.spawnerId, member);
  const waveSize = ctx.options.waveSize;
  /** Past its wave and kept in the fight by a recent hit: it does not swing. */
  let held = false;
  let sinceHit = Infinity;
  /** Held back by the wave from this target: it takes it up when a place frees. */
  let reserved: ActorId | null = null;

  const walk = (to: { x: number; z: number }, speed: number, dt: number): number => {
    const f = ctx.feet();
    const dx = to.x - f.x;
    const dz = to.z - f.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) ctx.move({ x: (dx / d) * speed, z: (dz / d) * speed }, dt);
    return d;
  };

  return {
    notices(noticed) {
      return noticed && inWave(ctx.host, ctx.spawnerId, member, waveSize);
    },

    intent(dt, _intent, senses) {
      member.engagedSince();
      const st = ctx.brain.state;
      sinceHit += dt;
      held = (st === 'notice' || ctx.brain.target !== null) && !inWave(ctx.host, ctx.spawnerId, member, waveSize);
      if (held && st !== 'telegraph' && st !== 'attack' && (st === 'notice' || sinceHit > WAVE_HIT_HOLD_SECONDS)) {
        // Past its group's wave: it holds off until a pack-mate is out of the fight. Struck (a companion's or Cael's hit), it
        // keeps the fight but makes no swing (`allowMove`), so the wave holds without an aggro loop.
        reserved = ctx.brain.target ?? ctx.host.actors.player.id;
        ctx.brain.standDown();
        since = null;
        held = false;
      } else if (reserved && ctx.brain.target === null && !LEFT.has(ctx.brain.state) && inWave(ctx.host, ctx.spawnerId, member, waveSize)) {
        // A place in the wave is free: the reserve takes up the fight it was held from.
        const who = reserved;
        reserved = null;
        ctx.brain.alert(who);
      }
      if (ctx.brain.target === null) {
        engaged = 0;
        near = 0;
        hits = 0;
        return;
      }
      engaged += dt;
      const d = senses.targetPos ? Math.hypot(senses.targetPos.x - senses.self.x, senses.targetPos.z - senses.self.z) : Infinity;
      if (d <= OGRE.blusterReach) near += dt;
    },

    // The bluster: no swing or throw until the target has stood within reach for `blusterSeconds` (the Calm window, design 10
    // row 12), or it was struck, or a target that hangs back at range has had `blusterMaxSeconds`.
    allowMove() {
      if (held) return false;
      return hits >= blusterHits || near >= blusterSeconds || engaged >= OGRE.blusterMaxSeconds;
    },

    hit(attackerId) {
      sinceHit = 0;
      if (attackerId && ctx.host.actors.get(attackerId)?.team === 'player') hits++;
    },

    stateChanged(from) {
      // A calm revoked (struck on the way home or on the sit): hostile again, out of the sit; a later calm starts afresh.
      if (from !== 'calmed') return;
      // Up off the ground at once: the held sit clip would otherwise play on into the fight.
      if (phase === 'sitting') ctx.playOneShot(ENEMY_CLIPS.idle, 0.05);
      phase = 'none';
      t = 0;
      sitIdle = false;
    },

    leave(dt, how) {
      if (phase === 'none') {
        const f0 = ctx.feet();
        phase = how === 'calmed' ? 'walkHome' : 'walkOff';
        homeBy = Math.hypot(home.x - f0.x, home.z - f0.z) / Math.max(0.1, ctx.def.walkSpeed) + OGRE.homeMarginSeconds;
        ctx.playOneShot(WALK_CLIP, 600);
      }
      t += dt;
      const p = ctx.host.player.feet;
      if (phase === 'walkHome') {
        const d = walk(home, ctx.def.walkSpeed, dt);
        if (d <= 0.6) {
          phase = 'sitting';
          t = 0;
          ctx.playOneShot('Sit_Floor_Down', 1);
        } else if (t > homeBy) {
          // It cannot get home (blocked): it never sits away from its clear spot (the prop-free ruling); it just walks off.
          phase = 'walkOff';
          t = 0;
        }
        return true;
      }
      if (phase === 'sitting') {
        if (t > 1 && !sitIdle) {
          sitIdle = true;
          ctx.playOneShot('Sit_Floor_Idle', OGRE.sitSeconds + 5);
        }
        const f = ctx.feet();
        if (Math.hypot(p.x - f.x, p.z - f.z) >= OGRE.sitUntilPlayerMetres || t >= OGRE.sitSeconds) {
          phase = 'walkOff';
          t = 0;
          ctx.playOneShot(WALK_CLIP, 600);
        }
        return true;
      }
      // Walking off, away from the player, fading out.
      const f = ctx.feet();
      walk({ x: f.x * 2 - p.x, z: f.z * 2 - p.z }, ctx.def.walkSpeed, dt);
      const left = OGRE.walkOffSeconds - t;
      ctx.body.setOpacity(Math.max(0, Math.min(1, left / OGRE.fadeSeconds)));
      if (left <= 0) ctx.finish();
      return true;
    },

    loco() {
      return phase === 'sitting' ? 'Sit_Floor_Idle' : null;
    },

    dispose() {
      leavePack();
      VIEWS.delete(ctx.actorId);
    },
  };
}
