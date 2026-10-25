import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { MoveDef } from '../../types';
import { FEN_TUNING } from '../tuning';

const T = FEN_TUNING.leech;

/** How the leech's body sits: under the surface (or burrowed in mud), coming up, up and fighting, or going under. */
export type LurkPhase = 'submerged' | 'surfacing' | 'up' | 'diving';

/** Seconds the surfacing and the going-under take (the Surface and Dive clips). */
export const SURFACE_SECONDS = 0.6;
/** The leech's back stays this far under the surface while it lurks. */
export const LURK_COVER = 0.15;
/** The body's height above its feet, lying flat. */
export const LEECH_BODY_HEIGHT = 0.25;
/** It burrows into the mud at most this deep when there is too little water to hide it (never deeper). */
export const MAX_BURROW = 0.4;

type XYZ = { x: number; y: number; z: number };

/** The water as the leech reads it: K7's `water` service when present (its `depthAt` and `volumeAt`), else nothing. */
export interface LurkWater {
  depthAt(x: number, z: number): number;
  volumeAt(p: XYZ): { kind: string } | null;
}

/**
 * How far below its feet the leech's visual lies while it lurks, so its back is `LURK_COVER` under the surface: 0 in water
 * deep enough to cover it (it lies on the bed), more in shallow or no water (it burrows), and never more than `MAX_BURROW`
 * (and never more than `T.sinkDepth`). Without a water service the depth is unknown and it burrows fully.
 */
export function lurkSink(waterDepth: number | null): number {
  const depth = waterDepth !== null && Number.isFinite(waterDepth) && waterDepth > 0 ? waterDepth : 0;
  const need = LEECH_BODY_HEIGHT + LURK_COVER - depth;
  return Math.min(MAX_BURROW, T.sinkDepth, Math.max(0, need));
}

/** A resurface point is legal in a `wade` or `dive` volume (D05's flooded corridors); without a water service any point is. */
export function legalWater(water: LurkWater | null, p: XYZ): boolean {
  if (!water) return true;
  const v = water.volumeAt({ x: p.x, y: p.y + 0.1, z: p.z });
  return !!v && (v.kind === 'wade' || v.kind === 'dive');
}

type Body = { setSubmerge?(depth: number): void; play(clip: string, opts?: { loop?: boolean }): string };
type Targetable = { untargetable?: boolean; invulnerable: boolean; health: number; maxHealth: number; restorePoise(n?: number): void };
type ServiceGetter = { get(name: string): unknown };

/**
 * The `lurk` overlay (the Fen Leech, plans/act3-K6b.md section 2 and 12): it waits submerged at its anchor (untargetable,
 * invulnerable, no attack token) and comes up when the player (never a companion, never a diving player) steps within
 * `T.surfaceRadius`, opening with its lunge. It never leaves `T.tether` around its anchor. A poise break, or health under
 * `T.diveBelowHealth` once its swing has ended, sends it under for `T.diveSeconds`: it slides up to `T.diveSlide` inside the
 * ring to a legal water point and comes up again; `T.maxDives` per fight. A lost or diving target lets it sink at home.
 */
export function makeLurkOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const body = ctx.body as unknown as Body;
  const services = ctx.host.services as unknown as ServiceGetter;
  const home = { x: ctx.feet().x, z: ctx.feet().z };
  const actor = (): Targetable | undefined => ctx.host.actors.get(ctx.actorId) as unknown as Targetable | undefined;
  const water = (): LurkWater | null => (services.get('water') as LurkWater | undefined) ?? null;
  const playerDiving = (): boolean => (services.get('movementMode') as { current?: string } | undefined)?.current === 'dive';

  let phase: LurkPhase = 'submerged';
  let phaseTime = 0;
  let dives = 0;
  let opened = false;
  let pendingDive = false;
  let lostFor = 0;
  const slideTo = { x: home.x, z: home.z };
  const look = { x: 0, z: 0 };

  const depthHere = (): number | null => {
    const w = water();
    if (!w) return null;
    const f = ctx.feet();
    return w.depthAt(f.x, f.z);
  };
  const hide = (on: boolean): void => {
    const a = actor();
    if (!a) return;
    a.untargetable = on;
    a.invulnerable = on;
  };
  const enter = (next: LurkPhase): void => {
    phase = next;
    phaseTime = 0;
    if (next === 'submerged' || next === 'diving') {
      hide(true);
      body.setSubmerge?.(lurkSink(depthHere()));
      if (next === 'diving') body.play('Dive');
    } else {
      body.setSubmerge?.(0);
      if (next === 'surfacing') {
        hide(true);
        body.play('Surface');
      } else {
        hide(false);
        // Up again after a dive: the dive took the stagger, so its poise comes back here (the brain's recovery never ran).
        actor()?.restorePoise();
      }
    }
  };

  /** The player is a valid trigger: alive, not diving, within the surface radius. */
  const playerNear = (): boolean => {
    const p = ctx.host.actors.player;
    if (p.dead || playerDiving()) return false;
    const pf = ctx.host.player.feet;
    const f = ctx.feet();
    return Math.hypot(pf.x - f.x, pf.z - f.z) <= T.surfaceRadius;
  };

  /** A point inside the ring, up to `T.diveSlide` from where it is, in legal water; its own spot when none is found. */
  const pickSlide = (): void => {
    const f = ctx.feet();
    const w = water();
    for (let i = 0; i < 6; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = T.diveSlide * (0.5 + 0.5 * ctx.rng());
      let x = f.x + Math.cos(a) * r;
      let z = f.z + Math.sin(a) * r;
      const hx = x - home.x;
      const hz = z - home.z;
      const hr = Math.hypot(hx, hz);
      if (hr > T.tether - 0.5) {
        x = home.x + (hx / hr) * (T.tether - 0.5);
        z = home.z + (hz / hr) * (T.tether - 0.5);
      }
      if (legalWater(w, { x, y: ctx.host.heightAt(x, z), z })) {
        slideTo.x = x;
        slideTo.z = z;
        return;
      }
    }
    slideTo.x = f.x;
    slideTo.z = f.z;
  };

  const startDive = (): void => {
    dives++;
    pendingDive = false;
    pickSlide();
    ctx.brain.stunned(T.diveSeconds + SURFACE_SECONDS);
    enter('diving');
  };

  const healthLow = (): boolean => {
    const a = actor();
    return !!a && a.maxHealth > 0 && a.health / a.maxHealth < T.diveBelowHealth;
  };

  enter('submerged');

  return {
    notices(noticed) {
      if (phase === 'submerged') return playerNear();
      if (phase === 'diving' || phase === 'surfacing') return false;
      // Up: a diving player is no target (no lunge, no drain).
      return noticed && !playerDiving();
    },

    intent(dt, intent, senses) {
      phaseTime += dt;
      switch (phase) {
        case 'submerged': {
          intent.goal = null;
          intent.speed = 0;
          if (playerNear()) enter('surfacing');
          return;
        }
        case 'surfacing': {
          intent.goal = null;
          intent.speed = 0;
          if (senses.targetPos) {
            look.x = senses.targetPos.x;
            look.z = senses.targetPos.z;
            intent.face = look;
          }
          if (phaseTime >= SURFACE_SECONDS) enter('up');
          return;
        }
        case 'diving': {
          const f = ctx.feet();
          const d = Math.hypot(slideTo.x - f.x, slideTo.z - f.z);
          intent.goal = d > 0.2 ? slideTo : null;
          intent.speed = d > 0.2 ? ctx.def.walkSpeed * 2 : 0;
          intent.stopDistance = 0.1;
          intent.face = null;
          if (phaseTime >= T.diveSeconds) {
            if (playerNear()) enter('surfacing');
            else enter('submerged');
          }
          return;
        }
        case 'up': {
          if (playerDiving()) {
            // Its target went under: it breaks off and sinks where it is.
            ctx.brain.standDown();
            dives = 0;
            opened = false;
            pendingDive = false;
            enter('submerged');
            return;
          }
          if (pendingDive && ctx.brain.state !== 'attack' && ctx.brain.state !== 'telegraph') startDive();
          const fighting = ctx.brain.target !== null && senses.targetAlive;
          lostFor = fighting ? 0 : lostFor + dt;
          if (lostFor >= T.resinkSeconds) {
            // The fight is over: the next one opens with a lunge again and has its own two dives.
            lostFor = 0;
            dives = 0;
            opened = false;
            pendingDive = false;
            enter('submerged');
          }
          return;
        }
      }
    },

    allowMove(move: MoveDef) {
      if (phase !== 'up') return false;
      if (opened) return true;
      // It opens with the lunge; the bite only when the player is already on top of it.
      if (move.id === 'leech.lunge') return true;
      const p = ctx.aim?.() ?? ctx.host.player.feet;
      const f = ctx.feet();
      return Math.hypot(p.x - f.x, p.z - f.z) < 1.5;
    },

    telegraphed() {
      opened = true;
    },

    clampVelocity(v, dt) {
      const f = ctx.feet();
      const nx = f.x + v.x * dt - home.x;
      const nz = f.z + v.z * dt - home.z;
      const r = Math.hypot(nx, nz);
      if (r <= T.tether) return;
      const ux = nx / r;
      const uz = nz / r;
      const out = v.x * ux + v.z * uz;
      if (out > 0) {
        v.x -= out * ux;
        v.z -= out * uz;
      }
    },

    staggered() {
      if (phase !== 'up' || dives >= T.maxDives) return false;
      startDive();
      return true;
    },

    hit() {
      if (phase === 'up' && dives < T.maxDives && healthLow()) pendingDive = true;
    },

    refusesPull() {
      return phase !== 'up';
    },

    dispose() {
      hide(false);
    },
  };
}

