import * as THREE from 'three';
import type { Vec3 } from '../ports';
import type { EffectId, EffectParams, EffectTransform } from '../types';
import type { SparkPool } from '../SparkPool';
import type { PointsPool } from '../PointsPool';
import type { DecalPool } from '../DecalPool';
import type { LightFlashPool } from '../LightFlashPool';
import type { Dissolver } from '../Dissolver';
import { createFresnelShell, createShockRing, disposeFx, setRingProgress, setShellProgress } from '../shaders/fresnelShell';

export interface FxContext {
  scene: THREE.Scene;
  sparks: SparkPool;
  points: PointsPool;
  decals: DecalPool;
  lights: LightFlashPool;
  dissolver: Dissolver;
  now(): number;
}

/** A running effect. `update` returns false when finished; `stop` ends it early. */
export interface EffectInstance {
  update(now: number): boolean;
  stop(): void;
}
export type EffectFactory = (ctx: FxContext, t: EffectTransform, p: EffectParams) => EffectInstance;

const ONE_SHOT: EffectInstance = { update: () => false, stop: () => {} };

const num = (p: EffectParams, k: string, d: number): number => {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
};
const origin = (t: EffectTransform): Vec3 => {
  if (t.attach) {
    const v = new THREE.Vector3();
    t.attach.getWorldPosition(v);
    return { x: v.x + t.position.x, y: v.y + t.position.y, z: v.z + t.position.z };
  }
  return t.position;
};

/** A timed mesh effect: calls `step(progress)` until `seconds` pass, then removes the mesh. */
function timedMesh(ctx: FxContext, mesh: THREE.Object3D, seconds: number, step: (p: number) => void): EffectInstance {
  const start = ctx.now();
  ctx.scene.add(mesh);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    ctx.scene.remove(mesh);
    mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) disposeFx(o as THREE.Mesh);
    });
  };
  return {
    update(now) {
      if (done) return false;
      const p = (now - start) / seconds;
      if (!(p < 1)) {
        finish();
        return false;
      }
      step(Math.max(0, p));
      return true;
    },
    stop: finish,
  };
}

function ring(ctx: FxContext, t: EffectTransform, radius: number, color: number, seconds: number): EffectInstance {
  const m = createShockRing({ inner: radius * 0.125, outer: radius * 0.2, color });
  const o = origin(t);
  m.position.set(o.x, o.y + 0.05, o.z);
  return timedMesh(ctx, m, seconds, (p) => setRingProgress(m, p));
}

const GOLD = 0xffc040;
const WHITE_HOT = 0xfff4d0;

export const EFFECTS: Record<EffectId, EffectFactory> = {
  'hit-spark': (ctx, t, p) => {
    const o = origin(t);
    ctx.sparks.burst(o, t.normal, num(p, 'count', 24), { color: GOLD }, ctx.now());
    ctx.lights.flash(o, 0xffb050, 6, 0.04, 0.16, ctx.now());
    return ONE_SHOT;
  },
  'hit-spark-heavy': (ctx, t, p) => {
    const o = origin(t);
    ctx.sparks.burst(o, t.normal, num(p, 'count', 48), { color: WHITE_HOT, speed: 9 }, ctx.now());
    ctx.lights.flash(o, 0xffe0a0, 8, 0.04, 0.2, ctx.now());
    return ONE_SHOT;
  },
  'block-spark': (ctx, t, p) => {
    const o = origin(t);
    ctx.sparks.burst(o, t.normal, num(p, 'count', 12), { color: 0xcfe0ff, lineSparks: true }, ctx.now());
    return ONE_SHOT;
  },
  'parry-flash': (ctx, t) => {
    const o = origin(t);
    ctx.lights.flash(o, GOLD, 8, 0.03, 0.2, ctx.now());
    ctx.sparks.burst(o, t.normal, 20, { color: GOLD, speed: 7 }, ctx.now());
    return ONE_SHOT;
  },
  'shockwave-ring': (ctx, t, p) => ring(ctx, t, (t.scale ?? 1) * num(p, 'radius', 1.2), num(p, 'color', GOLD), 0.4),
  'scorch-decal': (ctx, t, p) => {
    ctx.decals.place(origin(t), t.normal, num(p, 'radius', 0.6) * (t.scale ?? 1), 0x1a1208, ctx.now());
    return ONE_SHOT;
  },
  'ember-burst': (ctx, t, p) => {
    ctx.points.emit('ember', origin(t), num(p, 'count', 30), { rise: 1.5 }, ctx.now());
    return ONE_SHOT;
  },
  surge: (ctx, t, p) => {
    const zone = typeof p.zone === 'string' ? p.zone : 'warm';
    const scale = t.scale ?? 1;
    const radius = 6 * scale;
    const color = zone === 'cinder' ? WHITE_HOT : zone === 'blaze' ? 0xffa030 : GOLD;
    const o = origin(t);
    const shell = createFresnelShell({ radius: 1.2 * scale, color, intensity: 1.2 });
    shell.position.set(o.x, o.y + 1, o.z);
    ctx.points.emit('ember', { x: o.x, y: o.y + 1, z: o.z }, num(p, 'embers', 300), { spread: radius * 0.4, rise: 3, life: 1.4 }, ctx.now());
    ctx.lights.flash({ x: o.x, y: o.y + 1.2, z: o.z }, color, 8, 0.1, 0.6, ctx.now());
    const r = ring(ctx, t, radius, color, 0.7);
    const sh = timedMesh(ctx, shell, 0.8, (q) => setShellProgress(shell, q));
    return {
      update: (now) => {
        const a = r.update(now);
        const b = sh.update(now);
        return a || b;
      },
      stop: () => {
        r.stop();
        sh.stop();
      },
    };
  },
  'wraith-dissolve': (ctx, t, p) => {
    const o = origin(t);
    ctx.points.emit('ash', o, num(p, 'count', 40), { color: 0x8fa890, rise: 1 }, ctx.now());
    if (t.attach) {
      const d = ctx.dissolver.start(t.attach, num(p, 'seconds', 0.6), ctx.now(), { tint: 0x9fe8b0 });
      return { update: () => false, stop: () => d.cancel() };
    }
    return ONE_SHOT;
  },
  'waystone-rekindle': (ctx, t) => {
    const o = origin(t);
    ctx.points.emit('ember', o, 200, { rise: 4, spread: 0.5, life: 2 }, ctx.now());
    ctx.lights.flash({ x: o.x, y: o.y + 1.5, z: o.z }, GOLD, 7, 0.4, 1.6, ctx.now());
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 8, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.set(o.x, o.y + 4, o.z);
    const r = ring(ctx, t, 3, GOLD, 0.8);
    const b = timedMesh(ctx, beam, 2, (q) => ((beam.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - q)));
    return { update: (now) => [r.update(now), b.update(now)].some(Boolean), stop: () => (r.stop(), b.stop()) };
  },
  'skill-q': (ctx, t, p) => {
    const o = origin(t);
    ctx.points.emit('ember', o, 20, { color: GOLD, rise: 0.8, spread: 0.6, life: 1.2 }, ctx.now());
    return ring(ctx, t, (t.scale ?? 1) * num(p, 'radius', 8), num(p, 'color', GOLD), 0.6);
  },
  // Design 11.3 row 30: a 4 m ring at hand height, 80 rising embers, a 1.5 s chest light and the ash decal.
  'release-pulse': (ctx, t, p) => {
    const o = origin(t);
    const hand = { x: o.x, y: o.y + 1, z: o.z };
    ctx.points.emit('ember', hand, num(p, 'count', 80), { spread: 1.6, rise: 2.2, life: 1.5, color: WHITE_HOT }, ctx.now());
    ctx.lights.flash(hand, WHITE_HOT, 6, 0.1, 1.5, ctx.now());
    ctx.decals.place(o, t.normal, 4 * (t.scale ?? 1), 0x1a1208, ctx.now());
    const r = ring(ctx, { position: hand }, 4, GOLD, 0.8);
    return r;
  },
  // Section 3 Spare: a gold glyph above a yielding human for the 2 s window.
  'yield-glyph': (ctx, t, p) => {
    const o = origin(t);
    return ring(ctx, { position: { x: o.x, y: o.y + num(p, 'height', 2.4), z: o.z } }, 0.5, GOLD, num(p, 'seconds', 2));
  },
};
