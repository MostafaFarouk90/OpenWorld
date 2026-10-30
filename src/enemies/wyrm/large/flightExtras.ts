import type { BehaviourContext } from '../../behaviours';
import type { Chain } from '../tethers';
import type { WyrmBody } from '../WyrmBody';

/**
 * K6a additions to the Ember Wyrm's `wyrm-flight` overlay, kept here so the Act 2 overlay gains only a few call lines:
 *
 * - **Chain** (Skarl's drake): a slot chained through `wyrms.tether` draws the rig's collar chain to its post, never moves
 *   further than the chain from the post, and reports each touchdown (`landed`).
 * - **Perch** (the lodge wyrms): a resting slot with a perch is pinned there at the perch's height (a lodge tower top)
 *   while it rests: lifted onto the kinematic path, no walking. Struck, it drops to the ground below and fights as usual.
 * - **Release**: a tracked flier released by a script retires (slot spent, no credit) and flies up and away, fading out.
 */
export interface Perch {
  /** Height of the perch above the ground under it (the facing is the spawn anchor's yaw). */
  altitude: number;
  /** Where it lands when struck off the perch (engine x, z); under the perch when absent. */
  drop?: { x: number; z: number };
}

export interface FlierHandle {
  readonly spawnerId: string | null;
  readonly slot: number | null;
  /** Retires and flies off; false when it was not alive. */
  release(): boolean;
  /** The chain's lowest point now (world), or null when unchained. */
  chainLow(): { x: number; y: number; z: number } | null;
  /** On the ground (not airborne) now. */
  landed(): boolean;
}

export interface FlightExtrasHub {
  chainFor?(spawnerId: string | null, slot: number | null): Readonly<Chain> | null;
  perchFor?(spawnerId: string | null, slot: number | null): Readonly<Perch> | null;
  /** A flier touched down (any reason). */
  landed?(actorId: string): void;
  /** Called with a handle while the flier lives; the returned function forgets it. */
  trackFlier?(actorId: string, handle: FlierHandle): () => void;
}

export const FLIGHT_EXTRAS = {
  /** Pulled back toward the post at most this fast. */
  chainPullSpeed: 6,
  /** Release fly-off: climb rate, speed, fade distance. */
  climbRate: 5,
  flyOffSpeed: 10,
  flyOffAltitude: 18,
  fadeMetres: 60,
} as const;

type Body = Partial<Pick<WyrmBody, 'setAltitude' | 'setChain' | 'setOpacity' | 'resetSpine'>>;

export interface FlightExtras {
  /** Per tick before steering: refreshes the chain. */
  refresh(): void;
  /** True while pinned on a perch (the overlay skips its own steering). */
  readonly perched: boolean;
  /** The perch height to draw and to add to the actor's position (0 off the perch). */
  readonly perchAltitude: number;
  /** Clamp a velocity to the chain circle (in place). */
  clampVelocity(v: { x: number; z: number }, dt: number): void;
  /** Clamp a flight goal to the chain circle (in place). */
  clampGoal(goal: { x: number; z: number } | null): void;
  /** A touchdown happened. */
  touchedDown(): void;
  /** Struck (or woken): leaves the perch. */
  unperch(): void;
  /** `leave` for `retired` after a release; false otherwise. */
  leave(dt: number, how: string): boolean;
  /** True while flying off after a release (the overlay leaves the altitude to `leave`). */
  readonly leaving: boolean;
  dispose(): void;
}

export function makeFlightExtras(ctx: BehaviourContext, hub: FlightExtrasHub, airborne: () => boolean): FlightExtras {
  const body = ctx.body as unknown as Body;
  let chain: Readonly<Chain> | null = null;
  let shown: { x: number; y: number; z: number } | null = null;
  const perch = ctx.options.peaceful ? (hub.perchFor?.(ctx.spawnerId, ctx.slot) ?? null) : null;
  let perched = !!perch;
  let lifted = false;
  let released = false;
  let off: { t: number; alt: number; dir: { x: number; z: number }; from: { x: number; z: number } } | null = null;

  const refreshChain = () => {
    // `WyrmTethers.chainFor` hands out one shared object: keep a copy, `chainLow` reads it later.
    const c = released ? null : (hub.chainFor?.(ctx.spawnerId, ctx.slot) ?? null);
    chain = c ? { ...c, post: { ...c.post } } : null;
    const post = chain?.post ?? null;
    if (post !== shown && (!post || !shown || post.x !== shown.x || post.z !== shown.z)) {
      shown = post ? { ...post } : null;
      body.setChain?.(shown);
    }
  };

  const untrack = hub.trackFlier?.(ctx.actorId, {
    spawnerId: ctx.spawnerId,
    slot: ctx.slot,
    release: () => {
      if (released) return false;
      if (!ctx.retire()) return false;
      released = true;
      perched = false;
      refreshChain();
      return true;
    },
    chainLow: () => {
      if (!chain) return null;
      const f = ctx.feet();
      // The chain sags lowest about midway between the collar and the post.
      return { x: (f.x + chain.post.x) / 2, y: Math.min(f.y, chain.post.y), z: (f.z + chain.post.z) / 2 };
    },
    landed: () => !airborne(),
  });

  return {
    refresh() {
      refreshChain();
      if (perched && !lifted) {
        lifted = true;
        ctx.fly(true);
      }
    },
    get perched() {
      return perched;
    },
    get perchAltitude() {
      return perched && perch ? perch.altitude : 0;
    },
    clampVelocity(v, dt) {
      if (perched) {
        v.x = 0;
        v.z = 0;
        return;
      }
      if (!chain) return;
      const f = ctx.feet();
      const px = chain.post.x;
      const pz = chain.post.z;
      const nx = f.x + v.x * dt - px;
      const nz = f.z + v.z * dt - pz;
      const r = Math.hypot(nx, nz);
      if (r <= chain.length) return;
      const cr = Math.hypot(f.x - px, f.z - pz);
      const ux = nx / r;
      const uz = nz / r;
      // Drop the outward part; pull back in if already past the end.
      const out = v.x * ux + v.z * uz;
      if (out > 0) {
        v.x -= out * ux;
        v.z -= out * uz;
      }
      if (cr > chain.length && dt > 0) {
        const back = Math.min(FLIGHT_EXTRAS.chainPullSpeed, (cr - chain.length) / dt);
        v.x -= ux * back;
        v.z -= uz * back;
      }
    },
    clampGoal(goal) {
      if (!goal || !chain) return;
      const dx = goal.x - chain.post.x;
      const dz = goal.z - chain.post.z;
      const r = Math.hypot(dx, dz);
      const max = chain.length * 0.9;
      if (r <= max || r < 1e-6) return;
      goal.x = chain.post.x + (dx / r) * max;
      goal.z = chain.post.z + (dz / r) * max;
    },
    touchedDown() {
      hub.landed?.(ctx.actorId);
    },
    unperch() {
      if (!perched) return;
      perched = false;
      if (lifted) {
        const f = perch?.drop ?? ctx.feet();
        ctx.fly(false, { x: f.x, y: ctx.host.heightAt(f.x, f.z), z: f.z });
        body.setAltitude?.(0);
        body.resetSpine?.();
      }
    },
    get leaving() {
      return off !== null;
    },
    leave(dt, how) {
      if (!released || how !== 'retired') return false;
      if (!off) {
        const f = ctx.feet();
        const pf = ctx.host.player.feet;
        const ax = f.x - pf.x;
        const az = f.z - pf.z;
        const l = Math.hypot(ax, az) || 1;
        off = { t: 0, alt: 0, dir: { x: ax / l, z: az / l }, from: { x: f.x, z: f.z } };
        ctx.fly(true);
      }
      off.t += dt;
      off.alt = Math.min(FLIGHT_EXTRAS.flyOffAltitude, off.alt + dt * FLIGHT_EXTRAS.climbRate);
      body.setAltitude?.(off.alt);
      ctx.move({ x: off.dir.x * FLIGHT_EXTRAS.flyOffSpeed, z: off.dir.z * FLIGHT_EXTRAS.flyOffSpeed }, dt);
      const f = ctx.feet();
      const gone = Math.hypot(f.x - off.from.x, f.z - off.from.z);
      body.setOpacity?.(Math.max(0, Math.min(1, (FLIGHT_EXTRAS.fadeMetres - gone) / 15)));
      if (gone >= FLIGHT_EXTRAS.fadeMetres || off.t > 20) ctx.finish();
      return true;
    },
    dispose() {
      untrack?.();
      if (shown) body.setChain?.(null);
    },
  };
}
