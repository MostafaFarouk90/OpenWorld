import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId } from '../../ports';
import { ENEMY_CLIPS } from '../../clips';
import { OGRE } from '../tuning';

const WALK_CLIP = ENEMY_CLIPS.walk;

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
  VIEWS.set(ctx.actorId, () => phase);

  const walk = (to: { x: number; z: number }, speed: number, dt: number): number => {
    const f = ctx.feet();
    const dx = to.x - f.x;
    const dz = to.z - f.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) ctx.move({ x: (dx / d) * speed, z: (dz / d) * speed }, dt);
    return d;
  };

  return {
    intent(dt, _intent, senses) {
      if (ctx.brain.target === null) {
        engaged = 0;
        near = 0;
        return;
      }
      engaged += dt;
      const d = senses.targetPos ? Math.hypot(senses.targetPos.x - senses.self.x, senses.targetPos.z - senses.self.z) : Infinity;
      if (d <= OGRE.blusterReach) near += dt;
    },

    // The bluster: no swing or throw until the target has stood within reach for `blusterSeconds` (the Calm window, design 10
    // row 12), or it was struck, or a target that hangs back at range has had `blusterMaxSeconds`.
    allowMove() {
      return ctx.brain.struck || near >= OGRE.blusterSeconds || engaged >= OGRE.blusterMaxSeconds;
    },

    stateChanged(from) {
      // A calm revoked (struck on the way home or on the sit): hostile again, out of the sit; a later calm starts afresh.
      if (from !== 'calmed') return;
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
      VIEWS.delete(ctx.actorId);
    },
  };
}
