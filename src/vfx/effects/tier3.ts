import * as THREE from 'three';
import type { Vec3 } from '../ports';
import type { EffectParams, EffectTransform } from '../types';
import { createFresnelShell, setShellProgress } from '../shaders/fresnelShell';
import type { EffectFactory, EffectInstance, FxContext } from './index';

/** The helpers of `effects/index.ts`, passed in so this file adds no import cycle. */
export interface Tier3Helpers {
  ring(ctx: FxContext, t: EffectTransform, radius: number, color: number, seconds: number): EffectInstance;
  timedMesh(ctx: FxContext, mesh: THREE.Object3D, seconds: number, step: (p: number) => void): EffectInstance;
  origin(t: EffectTransform): Vec3;
  num(p: EffectParams, k: string, d: number): number;
}

/** Tier 3 skill presets (Act 2, thread A11; design 11.5). All sizes are in metres around `origin`; no noise is sampled from world position. */
export const TIER3_EFFECT_IDS = [
  'oathward-bubble',
  'oathward-burst',
  'halvard-charge',
  'squire-resolve',
  'whirling-hew',
  'grit-teeth',
  'blood-rune',
  'twin-fangs',
  'soot-cloak',
  'wall-skitter',
  'fire-wall',
  'iron-familiar',
  'smoke-screen',
  'ember-quarrel',
  'net-launcher',
  'light-step',
] as const;
export type Tier3EffectId = (typeof TIER3_EFFECT_IDS)[number];

const GOLD = 0xffc040;
const SCRATCH = new THREE.Vector3();
const NO_FX: EffectInstance = { update: () => false, stop: () => {} };

/**
 * Particle use per cast against the 11.1 cap of 4,000 live points: oathward-bubble 0 (burst 60), halvard-charge 30,
 * squire-resolve 24, whirling-hew 40, grit-teeth 4 per second, blood-rune 6 per second over 20 s, twin-fangs 8 sparks,
 * soot-cloak 30, wall-skitter 12, fire-wall 12 cards x 2 embers per 0.25 s for 8 s (peak 150 live), iron-familiar 48,
 * smoke-screen 40 puffs then 8 per 0.25 s with a 3 s life (peak about 110), ember-quarrel 6 per 0.1 s for 0.6 s,
 * net-launcher 20 plus one 4 s decal, light-step 14.
 */
export function tier3Effects(h: Tier3Helpers): Record<Tier3EffectId, EffectFactory> {
  const { ring, timedMesh, origin, num } = h;

  /** A mesh shell that follows `attach` (or stays at `position`) for `seconds`, until stopped. */
  const followShell = (ctx: FxContext, t: EffectTransform, radius: number, color: number, seconds: number, opacityEnd = 1): EffectInstance => {
    const shell = createFresnelShell({ radius, color, intensity: 1.1 });
    const place = () => {
      if (t.attach) {
        t.attach.getWorldPosition(SCRATCH);
        shell.position.set(SCRATCH.x + t.position.x, SCRATCH.y + t.position.y + 1, SCRATCH.z + t.position.z);
      } else shell.position.set(t.position.x, t.position.y + 1, t.position.z);
    };
    place();
    const inner = timedMesh(ctx, shell, seconds, (p) => {
      place();
      setShellProgress(shell, Math.min(p, opacityEnd));
    });
    return inner;
  };

  return {
    // Oathward: a 1.4 m gold bubble that rides the player until it is stopped (empty) or `seconds` run out.
    'oathward-bubble': (ctx, t, p) => followShell(ctx, t, 1.4 * (t.scale ?? 1), num(p, 'color', GOLD), num(p, 'seconds', 20), 0.15),
    // The bubble bursts when empty: 60 embers and a ring.
    'oathward-burst': (ctx, t) => {
      const o = origin(t);
      ctx.points.emit('ember', { x: o.x, y: o.y + 1, z: o.z }, 60, { color: GOLD, spread: 1.2, rise: 1.4, life: 0.8 }, ctx.now());
      return ring(ctx, { position: { x: o.x, y: o.y + 0.1, z: o.z } }, 2, GOLD, 0.4);
    },
    // Charge of the Halvard: a dust line at the feet and a gold flash at the end of the lunge.
    'halvard-charge': (ctx, t) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      for (let i = 0; i < 5; i++) {
        const d = i * 1.1;
        ctx.points.emit('ash', { x: o.x - Math.sin(yaw) * d, y: o.y + 0.1, z: o.z - Math.cos(yaw) * d }, 6, { color: 0xc8b898, spread: 0.4, rise: 0.4, life: 0.6 }, ctx.now());
      }
      ctx.lights.flash({ x: o.x - Math.sin(yaw) * 5, y: o.y + 1, z: o.z - Math.cos(yaw) * 5 }, GOLD, 6, 0.03, 0.2, ctx.now());
      return NO_FX;
    },
    // Squire's Resolve: a gold flash and ring on the saved ally.
    'squire-resolve': (ctx, t) => {
      const o = origin(t);
      ctx.points.emit('ember', { x: o.x, y: o.y + 1, z: o.z }, 24, { color: GOLD, spread: 0.5, rise: 1.2, life: 0.7 }, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 1, z: o.z }, GOLD, 7, 0.03, 0.25, ctx.now());
      return ring(ctx, t, 2, GOLD, 0.5);
    },
    // Whirling Hew: a ring at the swing's reach and a spray of dust.
    'whirling-hew': (ctx, t, p) => {
      const o = origin(t);
      const reach = num(p, 'reach', 2.6);
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.2, z: o.z }, 40, { color: 0xc8b898, spread: reach * 0.7, rise: 0.5, life: 0.6 }, ctx.now());
      return ring(ctx, t, reach * 2.4, 0xd05030, 0.4);
    },
    // Grit Teeth: a grey outline for the window and a few stone chips each second.
    'grit-teeth': (ctx, t, p) => {
      const seconds = num(p, 'seconds', 4);
      const start = ctx.now();
      let last = -Infinity;
      let done = false;
      const shell = followShell(ctx, t, 1.05, 0x9a9a9a, seconds, 0.1);
      return {
        update(now) {
          if (done || now - start >= seconds) return shell.update(now) && false;
          if (now - last >= 0.25) {
            last = now;
            const o = origin(t);
            ctx.points.emit('ash', { x: o.x, y: o.y + 1, z: o.z }, 1, { color: 0x888888, spread: 0.3, rise: -0.5, life: 0.5 }, now);
          }
          return shell.update(now);
        },
        stop() {
          done = true;
          shell.stop();
        },
      };
    },
    // Blood Chant: a red rune ring at the feet for the whole buff, pulsing embers.
    'blood-rune': (ctx, t, p) => {
      const seconds = num(p, 'seconds', 20);
      const start = ctx.now();
      let last = -Infinity;
      let done = false;
      const o0 = origin(t);
      ctx.decals.place({ x: o0.x, y: o0.y, z: o0.z }, t.normal, 2.2, 0x601010, start);
      return {
        update(now) {
          if (done || now - start >= seconds) return false;
          if (now - last >= 1) {
            last = now;
            const o = origin(t);
            ctx.points.emit('ember', { x: o.x, y: o.y + 0.2, z: o.z }, 6, { color: 0xc02020, spread: 1.2, rise: 0.8, life: 1 }, now);
          }
          return true;
        },
        stop() {
          done = true;
        },
      };
    },
    // Twin Fangs: a crossing spark pair, 8 sparks in all.
    'twin-fangs': (ctx, t) => {
      const o = origin(t);
      ctx.sparks.burst({ x: o.x, y: o.y, z: o.z }, t.normal, 8, { color: 0xffe0a0, speed: 7 }, ctx.now());
      return NO_FX;
    },
    // Soot Cloak: soot puffs and a faint violet outline for `seconds`.
    'soot-cloak': (ctx, t, p) => {
      const o = origin(t);
      ctx.points.emit('smoke', { x: o.x, y: o.y + 1, z: o.z }, 30, { spread: 0.6, rise: 0.6, life: 1 }, ctx.now());
      return followShell(ctx, t, 1.05, 0x6a4a8a, num(p, 'seconds', 5), 0.1);
    },
    // Wall Skitter: dust kicked off the wall at the feet.
    'wall-skitter': (ctx, t) => {
      const o = origin(t);
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.5, z: o.z }, 12, { color: 0xc8b898, spread: 0.3, rise: 0.3, life: 0.4 }, ctx.now());
      return NO_FX;
    },
    // Fire Wall (effect 12): a line of `cards` flame columns across `length` metres facing `yaw`, kept alive for `seconds`.
    'fire-wall': (ctx, t, p) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const seconds = num(p, 'seconds', 8);
      const length = num(p, 'length', 6);
      const cards = 12;
      const start = ctx.now();
      let last = -Infinity;
      let done = false;
      // The wall runs perpendicular to the facing: (cos yaw, -sin yaw).
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      return {
        update(now) {
          if (done || now - start >= seconds) return false;
          if (now - last >= 0.25) {
            last = now;
            // A short repeating glow, so stopping the effect leaves no light behind.
            ctx.lights.flash({ x: o.x, y: o.y + 1, z: o.z }, 0xff7020, 6, 0.1, 0.4, now);
            for (let i = 0; i < cards; i++) {
              const d = (i / (cards - 1) - 0.5) * length;
              ctx.points.emit('ember', { x: o.x + rx * d, y: o.y + 0.2, z: o.z + rz * d }, 2, { color: 0xff7a20, spread: 0.15, rise: 2.2, life: 0.9 }, now);
            }
          }
          return true;
        },
        stop() {
          done = true;
        },
      };
    },
    // Iron Familiar: pieces fly in as embers and a blue-grey eye light, then a ring when the guard is whole.
    'iron-familiar': (ctx, t) => {
      const o = origin(t);
      ctx.points.emit('ember', { x: o.x, y: o.y + 1.2, z: o.z }, 48, { color: 0x8aa0c0, spread: 1.4, rise: -0.6, life: 0.7 }, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 1.2, z: o.z }, 0x80b0ff, 4, 0.3, 0.6, ctx.now());
      return ring(ctx, t, 1.6, 0x8aa0c0, 0.5);
    },
    // Smoke Screen (effect 16): a grey cloud of `radius` that keeps puffing for `seconds` (the sprites live 3 s, the cloud 8 s).
    'smoke-screen': (ctx, t, p) => {
      const o = origin(t);
      const radius = Math.max(0.5, t.scale ?? 5);
      const seconds = Math.max(0.5, num(p, 'seconds', 8));
      const start = ctx.now();
      let last = -Infinity;
      let done = false;
      ctx.points.emit('smoke', { x: o.x, y: o.y + 0.4, z: o.z }, 40, { spread: radius * 0.6, rise: 0.7, life: 3 }, start);
      return {
        update(now) {
          if (done || now - start >= seconds) return false;
          if (now - last >= 0.25) {
            last = now;
            ctx.points.emit('smoke', { x: o.x, y: o.y + 0.4, z: o.z }, 8, { spread: radius * 0.6, rise: 0.7, life: 3 }, now);
          }
          return true;
        },
        stop() {
          done = true;
        },
      };
    },
    // Ember Quarrel: a short ember trail behind the bolt, attached to the bolt when given.
    'ember-quarrel': (ctx, t) => {
      const start = ctx.now();
      let last = -Infinity;
      let done = false;
      return {
        update(now) {
          if (done || now - start >= 0.6) return false;
          if (now - last >= 0.1) {
            last = now;
            ctx.points.emit('ember', origin(t), 6, { color: 0xff8030, spread: 0.1, rise: 0.3, life: 0.4 }, now);
          }
          return true;
        },
        stop() {
          done = true;
        },
      };
    },
    // Net Launcher: rope sparks and a 4 s net decal under the target.
    'net-launcher': (ctx, t, p) => {
      const o = origin(t);
      ctx.sparks.burst({ x: o.x, y: o.y + 1, z: o.z }, t.normal, 20, { color: 0xc8b890, lineSparks: true }, ctx.now());
      ctx.decals.place({ x: o.x, y: o.y, z: o.z }, t.normal, num(p, 'radius', 1.2), 0x3a3020, ctx.now());
      return NO_FX;
    },
    // Light Step: a small puff and ring under the feet in the air.
    'light-step': (ctx, t) => {
      const o = origin(t);
      ctx.points.emit('ash', o, 14, { color: 0xe8e0d0, spread: 0.4, rise: 0.2, life: 0.4 }, ctx.now());
      return ring(ctx, t, 1.2, 0xe8e0d0, 0.3);
    },
  };
}
