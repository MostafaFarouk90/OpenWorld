import type { BehaviourContext, BehaviourOverlay } from '../behaviours';
import type { MoveDef } from '../types';
import type { WyrmHub } from './flightOverlay';
import type { Chain } from './tethers';
import { WYRMLING } from './tuning';
import type { WyrmBody } from './WyrmBody';

/** What the skittish overlay needs from the wyrm runtime beyond the hub (chains, the live wyrmling handles). */
export interface SkittishHub extends WyrmHub {
  chainFor?(spawnerId: string | null, slot: number | null): Readonly<Chain> | null;
  exitFor?(spawnerId: string | null): { x: number; y: number; z: number } | null;
  /** Called with a handle while the wyrmling lives; the returned function forgets it. */
  track?(actorId: string, handle: WyrmlingHandle): () => void;
}

/** Script control of one live wyrmling (the `wyrms` service). */
export interface WyrmlingHandle {
  readonly spawnerId: string | null;
  readonly slot: number | null;
  /** Leaves without a mercy: flies (or walks, indoors) off and despawns as 'retired'. False when it was not alive (already leaving, calmed, dead). */
  flyAway(): boolean;
}

/** The bread a wyrmling lets you come close for (any of them). */
export const WYRMLING_BREAD = ['hearth-bread', 'barley-cake'] as const;
/** Cornered: it may attack for this long after its last escape was blocked. */
const CORNERED_SECONDS = 3;
/** Coos are not played past this distance from the player. */
const COO_RANGE = 25;
/** Pulled back into its circle at most this fast (a spawn outside the circle eases in). */
const CHAIN_PULL_SPEED = 4;

type Body = Partial<Pick<WyrmBody, 'setAltitude' | 'setChain' | 'setOpacity'>>;

/**
 * The `skittish` overlay (the Wyrmling, plans/act2-A6a.md 1.4). Unstruck it keeps 3 to 5 m from the player and never
 * attacks; a player carrying bread who has not swung for 2 s may come within 1.5 m (it holds still, head low, so the
 * Calm prompt can open). Struck, or cornered (its escape blocked by a wall or its chain), it bites and puffs. A chained
 * wyrmling never leaves its circle; calmed while chained it stays put and coos until the chain goes, then flies off.
 */
export function makeSkittishOverlay(ctx: BehaviourContext, hub: SkittishHub = {}): BehaviourOverlay {
  const body = ctx.body as unknown as Body;
  let clock = 0;
  let lastSwing = Number.NEGATIVE_INFINITY;
  let corneredLeft = 0;
  let fleeing = false;
  let headLow = false;
  let chain: Readonly<Chain> | null = null;
  let chainShown: { x: number; y: number; z: number } | null = null;
  let lastCoo = 0;
  let flyOff: { t: number; dir: { x: number; z: number }; from: { x: number; z: number }; alt: number; indoors: boolean } | null = null;
  let restingInChain = false;

  const player = ctx.host.actors.player.id;
  const unsubscribe = ctx.host.events.on('attack.window', (p) => {
    if (p.actorId === player && p.phase === 'open') lastSwing = clock;
  });
  const untrack = hub.track?.(ctx.actorId, {
    spawnerId: ctx.spawnerId,
    slot: ctx.slot,
    flyAway: () => ctx.retire(),
  });

  const refreshChain = () => {
    chain = hub.chainFor?.(ctx.spawnerId, ctx.slot) ?? null;
    const post = chain?.post ?? null;
    if (post !== chainShown && (!post || !chainShown || post.x !== chainShown.x || post.z !== chainShown.z)) {
      chainShown = post ? { ...post } : null;
      body.setChain?.(chainShown);
    }
  };
  const hasBread = () => {
    const inv = ctx.host.services.get('inventory');
    if (!inv) return false;
    for (const id of WYRMLING_BREAD) if (inv.count(id) > 0) return true;
    return false;
  };
  const sfx = (key: string) => {
    const f = ctx.feet();
    if (key === 'coo') {
      const p = ctx.host.player.feet;
      if (Math.hypot(f.x - p.x, f.z - p.z) > COO_RANGE) return;
    }
    hub.sfx?.(key, { x: f.x, y: f.y, z: f.z });
  };
  const goal = { x: 0, z: 0 };
  const look = { x: 0, z: 0 };
  refreshChain();

  return {
    intent(dt, intent, senses) {
      clock += dt;
      if (corneredLeft > 0) corneredLeft = Math.max(0, corneredLeft - dt);
      refreshChain();
      fleeing = false;
      headLow = false;
      const state = ctx.brain.state;
      if (state !== 'chase' && state !== 'notice' && state !== 'idle' && state !== 'patrol') return;
      const p = senses.targetPos;
      if (!p || !ctx.brain.target) return;
      // Struck or cornered: the brain's own chase and swings.
      if (ctx.brain.struck || corneredLeft > 0) return;
      const self = senses.self;
      const dx = self.x - p.x;
      const dz = self.z - p.z;
      const d = Math.hypot(dx, dz);
      const breadOk = hasBread() && clock - lastSwing >= WYRMLING.breadCalmSeconds;
      const near = breadOk ? WYRMLING.breadApproach : WYRMLING.keepAway[0];
      if (senses.stuckGiveUp && d < near) corneredLeft = CORNERED_SECONDS;
      if (d < near) {
        const ux = d > 1e-6 ? dx / d : 1;
        const uz = d > 1e-6 ? dz / d : 0;
        goal.x = self.x + ux * 3;
        goal.z = self.z + uz * 3;
        intent.goal = goal;
        intent.speed = ctx.def.chaseSpeed;
        intent.face = null;
        intent.stopDistance = 0.2;
        fleeing = true;
      } else if (d > WYRMLING.keepAway[1] && !breadOk) {
        goal.x = look.x = p.x;
        goal.z = look.z = p.z;
        intent.goal = goal;
        intent.speed = ctx.def.walkSpeed;
        intent.face = look;
        intent.stopDistance = (WYRMLING.keepAway[0] + WYRMLING.keepAway[1]) / 2;
      } else {
        look.x = p.x;
        look.z = p.z;
        intent.goal = null;
        intent.speed = 0;
        intent.face = look;
        headLow = breadOk;
      }
    },

    allowMove(_move: MoveDef) {
      return ctx.brain.struck || corneredLeft > 0;
    },

    clampVelocity(v, dt) {
      if (!chain) return;
      const f = ctx.feet();
      const post = chain.post;
      // Outside the circle (a spawn off its ring): the pull-back below eases it in; nothing else to clamp yet.
    const nx = f.x + v.x * dt - post.x;
      const nz = f.z + v.z * dt - post.z;
      const r = Math.hypot(nx, nz);
      if (r <= chain.length) return;
      // At the chain's end: drop the outward part of the move (and pull back in if it started outside).
      const ux = nx / r;
      const uz = nz / r;
      const out = v.x * ux + v.z * uz;
      if (out > 0) {
        v.x -= out * ux;
        v.z -= out * uz;
        if (fleeing && out > 0.5 * Math.hypot(v.x + out * ux, v.z + out * uz)) corneredLeft = CORNERED_SECONDS;
      }
      const cx = f.x - post.x;
      const cz = f.z - post.z;
      const cr = Math.hypot(cx, cz);
      if (cr > chain.length && dt > 0) {
        const back = Math.min(CHAIN_PULL_SPEED, (cr - chain.length) / dt);
        v.x -= (cx / cr) * back;
        v.z -= (cz / cr) * back;
      }
    },

    animate() {
      if (!ctx.brain.struck && clock - lastCoo >= WYRMLING.cooEverySeconds && ctx.brain.state !== 'attack') {
        lastCoo = clock;
        sfx('coo');
      }
    },

    loco() {
      return headLow ? 'HeadLower' : null;
    },

    telegraphed(move) {
      if (move.id.endsWith('.puff')) sfx('chirp');
    },

    leave(dt, how) {
      if (how === 'spared') return false;
      clock += dt;
      if (how === 'retired' && ctx.spawnerId !== null && ctx.slot !== null) chain = null;
      else refreshChain();
      if (chain && !flyOff) {
        // Calmed on its chain: it settles inside the circle and stays until the chain goes.
        if (!restingInChain) {
          restingInChain = true;
          ctx.body.play('Rest', { loop: true });
        }
        if (clock - lastCoo >= WYRMLING.cooEverySeconds) {
          lastCoo = clock;
          sfx('coo');
        }
        return true;
      }
      if (!flyOff) {
        const f = ctx.feet();
        const pf = ctx.host.player.feet;
        const ax = f.x - pf.x;
        const az = f.z - pf.z;
        const l = Math.hypot(ax, az) || 1;
        const indoors = ctx.indoors();
        flyOff = { t: 0, dir: { x: ax / l, z: az / l }, from: { x: f.x, z: f.z }, alt: 0, indoors };
        restingInChain = false;
        ctx.body.play('Run', { loop: true });
        if (!indoors) ctx.fly(true);
      }
      const fo = flyOff;
      fo.t += dt;
      const f = ctx.feet();
      if (fo.indoors) {
        // Indoors: a short hop, then a walk to the exit door (when the chain names one) or straight away; then it fades.
        fo.alt = fo.t < 0.4 ? Math.sin((fo.t / 0.4) * Math.PI) * 0.6 : 0;
        body.setAltitude?.(fo.alt);
        const exit = hub.exitFor?.(ctx.spawnerId) ?? null;
        let vx = fo.dir.x;
        let vz = fo.dir.z;
        if (exit) {
          const ex = exit.x - f.x;
          const ez = exit.z - f.z;
          const el = Math.hypot(ex, ez);
          if (el < 1) return finishFade(ctx, body, fo, dt);
          vx = ex / el;
          vz = ez / el;
        } else if (Math.hypot(f.x - fo.from.x, f.z - fo.from.z) >= 6) return finishFade(ctx, body, fo, dt);
        if (fo.t > 12) return finishFade(ctx, body, fo, dt);
        ctx.move({ x: vx * ctx.def.chaseSpeed * 0.6, z: vz * ctx.def.chaseSpeed * 0.6 }, dt);
        return true;
      }
      // Outdoors: up to 12 m and away, fading out over its last 10 m before 40 m.
      fo.alt = Math.min(WYRMLING.flyAwayAltitude, fo.alt + dt * 4);
      body.setAltitude?.(fo.alt);
      ctx.move({ x: fo.dir.x * WYRMLING.flyAwaySpeed, z: fo.dir.z * WYRMLING.flyAwaySpeed }, dt);
      const gone = Math.hypot(f.x - fo.from.x, f.z - fo.from.z);
      body.setOpacity?.(Math.max(0, Math.min(1, (WYRMLING.flyAwayFadeMetres - gone) / 10)));
      if (gone >= WYRMLING.flyAwayFadeMetres) ctx.finish();
      return true;
    },

    dispose() {
      unsubscribe();
      untrack?.();
    },
  };
}

/** Fades over 0.5 s, then despawns. */
function finishFade(ctx: BehaviourContext, body: Body, fo: { t: number }, dt: number): boolean {
  const k = ((fo as { fade?: number }).fade = ((fo as { fade?: number }).fade ?? 0) + dt);
  body.setOpacity?.(Math.max(0, 1 - k / 0.5));
  if (k >= 0.5) ctx.finish();
  return true;
}
