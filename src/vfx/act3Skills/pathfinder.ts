import * as THREE from 'three';
import type { EffectFactory, EffectInstance, FxContext } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';

/**
 * Pathfinder tier 4 presets (K11 PR 2, design 11.5; green-brown and ember). All sizes in metres around `origin`; the meshes are
 * three.js primitives, no texture and no noise sampled from world position.
 *
 * Particle use per cast against the 11.1 cap of 4,000 live points (`PATHFINDER_T4_PARTICLES` is the peak live table, measured
 * by a test against a real `VfxServiceImpl`):
 * - triple-shot: the two side tracer meshes (0.18 s) only; no points (the crossbow draws the centre tracer and the flare). Peak 0.
 * - caltrop-field: the field is one InstancedMesh of 60 spikes and a ground ring, with one pale glint ember every 0.25 s (0.5 s
 *   life, measured peak 3) for the 10 s. A foe newly slowed spawns the same id with `dust: 1`: 10 ash points (0.8 s life) and no mesh. The
 *   table counts the field plus six foes puffing at once (3 + 60 = 63), more than a field of 4 m ever holds.
 * - sure-foot: 6 sparks (0.3 s life) and a 0.25 s ring at the feet when a knockback is cancelled. Peak 6.
 * Nothing here holds a point after `stop()` beyond its own short life.
 */
export const PATHFINDER_T4_EFFECT_IDS = ['triple-shot', 'caltrop-field', 'sure-foot'] as const;
export type PathfinderT4EffectId = (typeof PATHFINDER_T4_EFFECT_IDS)[number];

/** Peak live points per cast (checked by budget.test.ts and pathfinder.test.ts). */
export const PATHFINDER_T4_PARTICLES: Record<PathfinderT4EffectId, number> = {
  'triple-shot': 0,
  'caltrop-field': 63,
  'sure-foot': 6,
};

const GOLD = 0xffc040;
const SPIKE = 0x8a8c80;
const GLINT = 0xfff0c0;
const DUST = 0xa89878;
const GRIP = 0xffd890;
const NO_FX = { update: () => false, stop: () => {} };
const SCRATCH = new THREE.Matrix4();
const POS = new THREE.Vector3();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();

const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/**
 * Like `timedMesh` for a group: `timedMesh` disposes with `traverse`, and `disposeFx` detaches each mesh while the traversal is
 * still walking the child list, which skips children (and throws on the last), so a group is torn down child by child here.
 */
function timedGroup(ctx: FxContext, group: THREE.Group, seconds: number, step: (p: number, now: number) => void): EffectInstance {
  const start = ctx.now();
  ctx.scene.add(group);
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    ctx.scene.remove(group);
    for (const c of [...group.children]) {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
      (c as THREE.InstancedMesh).dispose?.();
    }
  };
  return {
    update(now) {
      if (done) return false;
      const p = (now - start) / seconds;
      if (!(p < 1)) {
        finish();
        return false;
      }
      step(Math.max(0, p), now);
      return true;
    },
    stop: finish,
  };
}

export function pathfinderT4Effects(h: Tier3Helpers): Record<PathfinderT4EffectId, EffectFactory> {
  const { ring, origin, num } = h;

  return {
    // Triple Shot: the two SIDE tracers only (the crossbow draws the centre tracer and the muzzle flare), from the muzzle at plus and
    // minus `degrees` (default 7.5) off the aim (`yaw` and `pitch`), `length` long (the launch range, default 14), fading over
    // 0.18 s. `plus` and `minus` (default 1) say which side bolts actually launched. No points, no light.
    'triple-shot': (ctx, t, p) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const pitch = num(p, 'pitch', 0);
      const spread = (Math.max(0, num(p, 'degrees', 7.5)) * Math.PI) / 180;
      const length = Math.max(1, num(p, 'length', 14));
      const group = new THREE.Group();
      const tracers: THREE.Mesh[] = [];
      for (const [flag, off] of [['minus', -spread], ['plus', spread]] as const) {
        if (num(p, flag, 1) <= 0) continue;
        const a = yaw + off;
        // Forward is (-sin yaw, -cos yaw) on the ground, tilted by the pitch.
        const dir = new THREE.Vector3(-Math.sin(a) * Math.cos(pitch), Math.sin(pitch), -Math.cos(a) * Math.cos(pitch));
        const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, length), additive(GOLD, 0.9));
        tracer.position.set(o.x + dir.x * (length / 2), o.y + dir.y * (length / 2), o.z + dir.z * (length / 2));
        tracer.lookAt(o.x + dir.x * length, o.y + dir.y * length, o.z + dir.z * length);
        group.add(tracer);
        tracers.push(tracer);
      }
      return timedGroup(ctx, group, 0.18, (prog) => {
        for (const m of tracers) (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - prog);
      });
    },

    // Caltrop Field: a faint ground ring and 60 grey spikes (one InstancedMesh of 4-sided cones, placed on a golden-angle
    // spiral over the disc) that glint in turn, for `seconds` (10), shrinking away over the last half second. With `dust: 1`
    // only a short puff of 10 dust points at the position (a foe was just slowed).
    'caltrop-field': (ctx, t, p) => {
      const o = origin(t);
      if (num(p, 'dust', 0) > 0) {
        ctx.points.emit('ash', { x: o.x, y: o.y + 0.1, z: o.z }, 10, { color: DUST, spread: 0.45, rise: 0.5, life: 0.8 }, ctx.now());
        return NO_FX;
      }
      const seconds = Math.max(0.5, num(p, 'seconds', 10));
      const radius = Math.max(0.5, num(p, 'radius', 4));
      const group = new THREE.Group();
      group.position.set(o.x, o.y, o.z);
      const floor = new THREE.Mesh(new THREE.RingGeometry(radius * 0.97, radius, 48), additive(GLINT, 0.18));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.03;
      group.add(floor);
      const count = 60;
      const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.2, 4), new THREE.MeshBasicMaterial({ color: SPIKE }), count);
      spikes.frustumCulled = false;
      const base: Array<{ x: number; z: number; yaw: number }> = [];
      for (let i = 0; i < count; i++) {
        const r = Math.sqrt((i + 0.5) / count) * radius * 0.96;
        const a = i * 2.399963;
        base.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: a * 3 });
      }
      const place = (scale: number, glint: number): void => {
        for (let i = 0; i < count; i++) {
          const b = base[i];
          // A spike glints for a short while in its turn: it swells and brightens by size only.
          const pulse = Math.max(0, Math.sin(glint * 2.2 - i * 0.55));
          const s = scale * (1 + 0.5 * pulse * pulse * pulse);
          QUAT.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, b.yaw);
          POS.set(b.x, 0.09 * s, b.z);
          SCALE.set(s, s, s);
          spikes.setMatrixAt(i, SCRATCH.compose(POS, QUAT, SCALE));
        }
        spikes.instanceMatrix.needsUpdate = true;
      };
      place(1, 0);
      group.add(spikes);
      let last = -Infinity;
      return timedGroup(ctx, group, seconds, (prog, now) => {
        const age = prog * seconds;
        const fade = Math.min(1, (seconds - age) / 0.5);
        place(fade, age);
        (floor.material as THREE.MeshBasicMaterial).opacity = 0.18 * fade;
        if (fade >= 1 && now - last >= 0.25) {
          last = now;
          const i = Math.floor(age * 4) % count;
          ctx.points.emit('ember', { x: o.x + base[i].x, y: o.y + 0.2, z: o.z + base[i].z }, 1, { color: GLINT, spread: 0.05, rise: 0.3, life: 0.5 }, now);
        }
      });
    },

    // Sure Foot: a small grip spark at the feet when a knockback is cancelled: a 0.4 m ring and 6 sparks, 0.3 s.
    'sure-foot': (ctx, t) => {
      const o = origin(t);
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.05, z: o.z }, 6, { color: GRIP, spread: 0.6, rise: 0.4, life: 0.3 }, ctx.now());
      return ring(ctx, { position: { x: o.x, y: o.y + 0.04, z: o.z } }, 0.4, GRIP, 0.25);
    },
  };
}

// ---- Tier 5 capstones (K11 PR 4) -------------------------------------------------------------------------------------------

/**
 * Pathfinder tier 5 presets (design 11.5, effect 19 and the Snare and Trail capstone rows). Particle use against the 11.1 cap of
 * 4,000 live points; `PATHFINDER_T5_PARTICLES` is the peak live table, measured by a test against a real `VfxServiceImpl`:
 * - dragonbane-bolt: with `flare: 1` the muzzle flare (two crossed quads, a core and a light flash) and 10 embers (0.3 s life, up
 *   to 0.375 s with the pool's jitter); otherwise the ribbon along `length` (a bright additive box, fading in 0.35 s) strung with 12
 *   embers. A cast spawns the flare and then the ribbon when the bolt ends (0.3 s later in the worst case a bolt reaches a foe 27 m
 *   away), so the two can overlap: peak 22.
 * - dragonbane-impact: a shockwave ring of 4 m, a light flash and 30 sparks (embers, 0.5 s).
 * - hunters-web: the armed ring for `seconds` (1): a floor ring, a wire net disc and 12 runes that light in turn, 30 embers dropped
 *   from the runes (0.5 s). Peak 30.
 * - hunters-web-pop: an S ring of the web's radius, 8 net cones that open from 0.2 to 2 m in 0.2 s and fade out by 1 s, and 120
 *   embers (0.8 s); 150 with the arming ring's tail. Peak 120.
 * - skyhawk-dive: the Kestrel's stoop trail, a bright box fading with the dive; no points.
 * - skyhawk-impact: a white flash, an S ring of 2.2 m and 12 white points (0.5 s). Peak 12.
 * - skyhawk-carry: a feather trail on the player for `seconds`: 2 feathers every 0.1 s with a 0.7 s life (peak 20). Nothing is drawn
 *   as a mesh.
 * Nothing here holds a point after `stop()` beyond its own short life. Not built (no helper exists): the bloom boost of the Web and
 * the radial blur of the Bolt's shockwave; the Kestrel itself is a mesh the class draws (SceneFx `KestrelDive`).
 */
export const PATHFINDER_T5_EFFECT_IDS = [
  'dragonbane-bolt',
  'dragonbane-impact',
  'hunters-web',
  'hunters-web-pop',
  'skyhawk-dive',
  'skyhawk-impact',
  'skyhawk-carry',
] as const;
export type PathfinderT5EffectId = (typeof PATHFINDER_T5_EFFECT_IDS)[number];

/** Peak live points per cast, for the budget test. */
export const PATHFINDER_T5_PARTICLES: Record<PathfinderT5EffectId, number> = {
  'dragonbane-bolt': 22,
  'dragonbane-impact': 30,
  'hunters-web': 30,
  'hunters-web-pop': 120,
  'skyhawk-dive': 0,
  'skyhawk-impact': 12,
  'skyhawk-carry': 20,
};

const BOLT_CORE = 0xfff0c8;
const BOLT_FLAME = 0xff9a30;
const WEB = 0xb8d890;
const RUNE = 0xffd070;
const FEATHER = 0xf0e8d0;
const WHITE = 0xffffff;

export function pathfinderT5Effects(h: Tier3Helpers): Record<PathfinderT5EffectId, EffectFactory> {
  const { ring, origin, num } = h;

  /** Runs two instances as one. */
  const both = (a: EffectInstance, b: EffectInstance): EffectInstance => ({
    update: (now) => {
      const x = a.update(now);
      const y = b.update(now);
      return x || y;
    },
    stop() {
      a.stop();
      b.stop();
    },
  });

  return {
    // Dragonbane Bolt. `flare: 1`: the muzzle flare at `position` (two crossed quads, a core, a 0.15 s flash, 10 embers). Otherwise the ribbon
    // from `position` along (`yaw`, `pitch`) for `length` (default 20), fading over 0.35 s, with 12 embers along it.
    'dragonbane-bolt': (ctx, t, p) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const pitch = num(p, 'pitch', 0);
      if (num(p, 'flare', 0) > 0) {
        const group = new THREE.Group();
        group.position.set(o.x, o.y, o.z);
        const quads: THREE.Mesh[] = [];
        for (const rot of [0, Math.PI / 2]) {
          const q = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.35), additive(BOLT_FLAME, 0.9));
          q.rotation.z = rot;
          group.add(q);
          quads.push(q);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), additive(BOLT_CORE, 0.95));
        group.add(core);
        // Face along the shot, so the star stands across it.
        group.rotation.set(0, yaw, 0);
        ctx.lights.flash({ x: o.x, y: o.y, z: o.z }, BOLT_FLAME, 8, 0.02, 0.15, ctx.now());
        ctx.points.emit('ember', { x: o.x, y: o.y, z: o.z }, 10, { color: BOLT_FLAME, spread: 0.5, rise: 0.5, life: 0.3 }, ctx.now());
        return timedGroup(ctx, group, 0.15, (prog) => {
          for (const q of quads) (q.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - prog);
          (core.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - prog);
          group.scale.setScalar(1 + prog * 0.6);
        });
      }
      const length = Math.max(1, num(p, 'length', 20));
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, length), additive(BOLT_CORE, 0.95));
      ribbon.position.set(o.x + dir.x * (length / 2), o.y + dir.y * (length / 2), o.z + dir.z * (length / 2));
      ribbon.lookAt(o.x + dir.x * length, o.y + dir.y * length, o.z + dir.z * length);
      const group = new THREE.Group();
      group.add(ribbon);
      for (let i = 0; i < 12; i++) {
        const d = (i + 0.5) * (length / 12);
        ctx.points.emit('ember', { x: o.x + dir.x * d, y: o.y + dir.y * d, z: o.z + dir.z * d }, 1, { color: BOLT_FLAME, spread: 0.12, rise: 0.3, life: 0.4 }, ctx.now());
      }
      return timedGroup(ctx, group, 0.35, (prog) => {
        (ribbon.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - prog);
        ribbon.scale.set(1 - prog * 0.7, 1 - prog * 0.7, 1);
      });
    },

    // Where the bolt ended: a 4 m shockwave ring, a light flash and 30 sparks.
    'dragonbane-impact': (ctx, t) => {
      const o = origin(t);
      ctx.lights.flash({ x: o.x, y: o.y + 0.5, z: o.z }, BOLT_CORE, 9, 0.02, 0.2, ctx.now());
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.5, z: o.z }, 30, { color: BOLT_FLAME, spread: 0.9, rise: 0.8, life: 0.5 }, ctx.now());
      return ring(ctx, { position: { x: o.x, y: o.y, z: o.z } }, 4, BOLT_FLAME, 0.45);
    },

    // Hunter's Web, armed: a floor ring of `radius` (12), a faint wire net disc and 12 runes that light in turn over `seconds` (1);
    // 30 embers fall from the runes as they light.
    'hunters-web': (ctx, t, p) => {
      const o = origin(t);
      const seconds = Math.max(0.2, num(p, 'seconds', 1));
      const radius = Math.max(1, num(p, 'radius', 12));
      const group = new THREE.Group();
      group.position.set(o.x, o.y, o.z);
      const floor = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.1, radius - 0.4), radius, 64), additive(WEB, 0.2));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      group.add(floor);
      const net = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.97, 24), new THREE.MeshBasicMaterial({ color: WEB, wireframe: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
      net.rotation.x = -Math.PI / 2;
      net.position.y = 0.04;
      group.add(net);
      const runes: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.4, 6), additive(RUNE, 0.15));
        r.rotation.x = -Math.PI / 2;
        r.position.set(Math.cos(a) * radius * 0.92, 0.07, Math.sin(a) * radius * 0.92);
        group.add(r);
        runes.push(r);
      }
      let emitted = 0;
      return timedGroup(ctx, group, seconds, (prog, now) => {
        (floor.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.4 * prog;
        (net.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.2 * prog;
        runes.forEach((r, i) => ((r.material as THREE.MeshBasicMaterial).opacity = prog * 12 >= i ? 0.85 : 0.15));
        // A rune lights: 2.5 embers (30 over the 12 runes, so alternate 3 and 2) from it.
        const lit = Math.min(12, Math.floor(prog * 12) + 1);
        while (emitted < lit) {
          const a = (emitted / 12) * Math.PI * 2;
          ctx.points.emit('ember', { x: o.x + Math.cos(a) * radius * 0.92, y: o.y + 0.2, z: o.z + Math.sin(a) * radius * 0.92 }, emitted % 2 === 0 ? 3 : 2, { color: RUNE, spread: 0.25, rise: 0.6, life: 0.5 }, now);
          emitted++;
        }
      });
    },

    // Hunter's Web, sprung: an S ring of `radius`, 8 net cones around it opening from 0.2 to 2 m in 0.2 s and gone by 1 s, and 120 embers.
    'hunters-web-pop': (ctx, t, p) => {
      const o = origin(t);
      const radius = Math.max(1, num(p, 'radius', 12));
      const group = new THREE.Group();
      group.position.set(o.x, o.y, o.z);
      const cones: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 8, 1, true), new THREE.MeshBasicMaterial({ color: WEB, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        c.position.set(Math.cos(a) * radius * 0.6, 0.35, Math.sin(a) * radius * 0.6);
        c.scale.setScalar(0.4);
        group.add(c);
        cones.push(c);
        // 15 embers per cone.
        ctx.points.emit('ember', { x: o.x + c.position.x, y: o.y + 0.5, z: o.z + c.position.z }, 15, { color: WEB, spread: 1.2, rise: 1.2, life: 0.8 }, ctx.now());
      }
      const body = timedGroup(ctx, group, 1, (prog) => {
        const open = Math.min(1, prog / 0.2);
        const fade = prog < 0.5 ? 1 : 1 - (prog - 0.5) / 0.5;
        for (const c of cones) {
          c.scale.setScalar(0.4 + 3.6 * open);
          (c.material as THREE.MeshBasicMaterial).opacity = 0.8 * fade;
        }
      });
      return both(body, ring(ctx, { position: { x: o.x, y: o.y, z: o.z } }, radius, WEB, 0.5));
    },

    // Skyhawk Strike, the stoop: a bright trail from `position` along (`yaw`, `pitch`) for `length`, there for `seconds` (the dive) and
    // fading over 0.25 s more.
    'skyhawk-dive': (ctx, t, p) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const pitch = num(p, 'pitch', 0);
      const length = Math.max(1, num(p, 'length', 10));
      const seconds = Math.max(0.05, num(p, 'seconds', 0.3));
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const trail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, length), additive(WHITE, 0.7));
      trail.position.set(o.x + dir.x * (length / 2), o.y + dir.y * (length / 2), o.z + dir.z * (length / 2));
      trail.lookAt(o.x + dir.x * length, o.y + dir.y * length, o.z + dir.z * length);
      const group = new THREE.Group();
      group.add(trail);
      return timedGroup(ctx, group, seconds + 0.25, (prog, now) => {
        const age = prog * (seconds + 0.25);
        (trail.material as THREE.MeshBasicMaterial).opacity = 0.7 * (age < seconds ? 1 : Math.max(0, 1 - (age - seconds) / 0.25));
        void now;
      });
    },

    // The stoop lands: a white flash, an S ring of 2.2 m and 12 white points.
    'skyhawk-impact': (ctx, t) => {
      const o = origin(t);
      ctx.lights.flash({ x: o.x, y: o.y + 1, z: o.z }, WHITE, 9, 0.02, 0.2, ctx.now());
      ctx.points.emit('ash', { x: o.x, y: o.y + 1, z: o.z }, 12, { color: FEATHER, spread: 0.6, rise: 0.6, life: 0.5 }, ctx.now());
      return ring(ctx, { position: { x: o.x, y: o.y, z: o.z } }, 2.2, WHITE, 0.35);
    },

    // The carry: a feather trail on the player (rides `attach`) for `seconds`: 2 feathers every 0.1 s, 0.7 s life.
    'skyhawk-carry': (ctx, t, p) => {
      const seconds = Math.max(0.1, num(p, 'seconds', 1));
      const start = ctx.now();
      let next = start;
      let done = false;
      return {
        update(now) {
          if (done) return false;
          if (now - start >= seconds) {
            done = true;
            return false;
          }
          while (next <= now + 1e-9) {
            const o = origin(t);
            ctx.points.emit('ash', { x: o.x, y: o.y + 1, z: o.z }, 2, { color: FEATHER, spread: 0.3, rise: 0.3, life: 0.7 }, now);
            next += 0.1;
          }
          return true;
        },
        stop() {
          done = true;
        },
      };
    },
  };
}
