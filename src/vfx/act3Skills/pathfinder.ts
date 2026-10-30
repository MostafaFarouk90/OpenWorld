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
