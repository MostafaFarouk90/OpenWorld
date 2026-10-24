import * as THREE from 'three';
import type { EffectFactory, EffectInstance, FxContext } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';
import { disposeFx } from '../shaders/fresnelShell';
import type { EffectTransform } from '../types';

/**
 * Ashblade tier 4 presets (K11 PR 1, design 11.5; grey, violet and ember sparks). All sizes in metres around `origin`; the
 * meshes are built from three.js primitives, no texture and no noise sampled from world position.
 *
 * Particle use per cast against the 11.1 cap of 4,000 live points (`ASHBLADE_T4_PARTICLES` is the peak live table, checked
 * by a test against a real `VfxServiceImpl`):
 * - cinder-mark: one ember every 0.5 s with a 1 s life for the 10 s mark (peak 3 live). The glyph ring and the floating
 *   glyph are 7 meshes.
 * - decoy-footprints: 8 prints (16 verts of mesh each, no points) over 1 s, then one 12-point ash puff at the last print.
 *   Peak 12 live.
 * - phoenix-patch: 8 embers per 0.25 s with a 0.9 s life for the 4 s patch (peak 40 live), one orange 0.4 s ring on
 *   ignition, 8 flame cards and a ground ring (9 meshes).
 * Nothing here holds a point after `stop()` beyond its own short life.
 */
export const ASHBLADE_T4_EFFECT_IDS = ['cinder-mark', 'decoy-footprints', 'phoenix-patch'] as const;
export type AshbladeT4EffectId = (typeof ASHBLADE_T4_EFFECT_IDS)[number];

/** Peak live points per cast, for the budget test. */
export const ASHBLADE_T4_PARTICLES: Record<AshbladeT4EffectId, number> = {
  'cinder-mark': 3,
  'decoy-footprints': 12,
  'phoenix-patch': 40,
};

const ORANGE = 0xff7a20;
const EMBER = 0xffa040;
const ASH = 0x4a4452;
const SCRATCH = new THREE.Vector3();

const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A group that follows `t.attach` (when given) or stays at `t.position`, for `seconds`, until stopped. */
function followGroup(ctx: FxContext, t: EffectTransform, group: THREE.Group, seconds: number, step: (p: number, now: number) => void): EffectInstance {
  const place = (): void => {
    if (t.attach) {
      t.attach.getWorldPosition(SCRATCH);
      group.position.set(SCRATCH.x + t.position.x, SCRATCH.y + t.position.y, SCRATCH.z + t.position.z);
    } else group.position.set(t.position.x, t.position.y, t.position.z);
  };
  place();
  group.frustumCulled = false;
  const start = ctx.now();
  ctx.scene.add(group);
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    group.removeFromParent();
    // Collected first: `disposeFx` detaches each mesh, which must not happen while the tree is being walked.
    const meshes: THREE.Mesh[] = [];
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const m of meshes) disposeFx(m);
  };
  return {
    update(now) {
      if (done) return false;
      const p = (now - start) / seconds;
      if (!(p < 1)) {
        finish();
        return false;
      }
      place();
      step(Math.max(0, p), now);
      return true;
    },
    stop: finish,
  };
}

export function ashbladeT4Effects(h: Tier3Helpers): Record<AshbladeT4EffectId, EffectFactory> {
  const { ring, origin, num } = h;

  return {
    // Cinder Mark: a rotating orange glyph ring (six arcs) under the marked foe and a floating glyph over its head, both
    // riding its root; a rare ember rises from the ring.
    'cinder-mark': (ctx, t, p) => {
      const seconds = Math.max(0.2, num(p, 'seconds', 10));
      const radius = Math.max(0.4, (t.scale ?? 1) * num(p, 'radius', 0.9));
      const group = new THREE.Group();
      const glyphRing = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const arc = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 8, 1, (i * Math.PI) / 3, Math.PI / 4), additive(ORANGE, 0.85));
        arc.rotation.x = -Math.PI / 2;
        glyphRing.add(arc);
      }
      glyphRing.position.y = 0.06;
      group.add(glyphRing);
      // The floating glyph: a diamond over a small inner ring, turned to the camera by the spin of the group.
      const glyph = new THREE.Group();
      const diamond = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.17, 4), additive(EMBER, 0.95));
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), additive(0xfff0c0, 1));
      glyph.add(diamond, core);
      const height = num(p, 'height', 2.3);
      glyph.position.y = height;
      group.add(glyph);
      let last = -Infinity;
      return followGroup(ctx, t, group, seconds, (prog, now) => {
        glyphRing.rotation.y = prog * seconds * 1.6;
        glyph.rotation.y = prog * seconds * 2.4;
        glyph.position.y = height + Math.sin(prog * seconds * 3) * 0.06;
        // A soft pulse, so the mark reads while the foe moves.
        const pulse = 0.7 + 0.3 * Math.sin(prog * seconds * 5);
        glyphRing.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * pulse));
        if (now - last >= 0.5) {
          last = now;
          const g = group.position;
          ctx.points.emit('ember', { x: g.x, y: g.y + 0.1, z: g.z }, 1, { color: EMBER, spread: radius * 0.7, rise: 1, life: 1 }, now);
        }
      });
    },

    // Decoy Footprints: eight soft dark prints leading away behind the player (left and right alternating), appearing one
    // every 0.125 s, fading over `seconds` (6), and a small ash puff at the last print. `yaw` is the player's facing; the
    // trail runs the other way.
    'decoy-footprints': (ctx, t, p) => {
      const seconds = Math.max(0.5, num(p, 'seconds', 6));
      const prints = 8;
      const stride = 0.85;
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      // Backwards is (sin yaw, cos yaw); the right-hand side is (cos yaw, -sin yaw).
      const bx = Math.sin(yaw);
      const bz = Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const group = new THREE.Group();
      const meshes: THREE.Mesh[] = [];
      for (let i = 0; i < prints; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const d = 0.6 + i * stride;
        // A boot print: a long oval of two stacked circles (heel and ball).
        const print = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), new THREE.MeshBasicMaterial({ color: ASH, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
        const heel = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), new THREE.MeshBasicMaterial({ color: ASH, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
        ball.position.y = 0.12;
        heel.position.y = -0.1;
        print.add(ball, heel);
        print.rotation.set(-Math.PI / 2, 0, 0);
        print.rotation.order = 'YXZ';
        print.rotation.y = yaw + Math.PI;
        print.position.set(bx * d + rx * side * 0.14, 0.03, bz * d + rz * side * 0.14);
        group.add(print);
        meshes.push(ball, heel);
      }
      const lastD = 0.6 + (prints - 1) * stride;
      const appear = 0.125;
      let puffed = false;
      const base = new THREE.Vector3(o.x, o.y, o.z);
      return followGroup(ctx, { position: base }, group, seconds, (prog, now) => {
        const age = prog * seconds;
        for (let i = 0; i < prints; i++) {
          const shown = Math.max(0, Math.min(1, (age - i * appear) / appear));
          const fade = 1 - Math.max(0, (age - i * appear) / (seconds - i * appear));
          const op = 0.55 * shown * fade;
          (meshes[i * 2].material as THREE.MeshBasicMaterial).opacity = op;
          (meshes[i * 2 + 1].material as THREE.MeshBasicMaterial).opacity = op;
        }
        if (!puffed && age >= prints * appear) {
          puffed = true;
          ctx.points.emit('ash', { x: o.x + bx * lastD, y: o.y + 0.15, z: o.z + bz * lastD }, 12, { color: 0x6a6272, spread: 0.3, rise: 0.4, life: 1 }, now);
        }
      });
    },

    // Phoenix Roll: an orange ring on ignition, then for `seconds` (4) a 4 m patch: a ground ring, eight flame cards on a
    // 1.5 m circle that flicker in height and a rising ember spray every 0.25 s.
    'phoenix-patch': (ctx, t, p) => {
      const seconds = Math.max(0.5, num(p, 'seconds', 4));
      const radius = Math.max(0.5, num(p, 'radius', 2));
      const o = origin(t);
      const flare = ring(ctx, { position: { x: o.x, y: o.y, z: o.z } }, radius * 1.1, ORANGE, 0.4);
      ctx.lights.flash({ x: o.x, y: o.y + 0.8, z: o.z }, ORANGE, 6, 0.05, 0.3, ctx.now());
      const group = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.RingGeometry(radius * 0.93, radius, 48), additive(ORANGE, 0.7));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      group.add(floor);
      const cards: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1), additive(i % 2 ? 0xffb040 : ORANGE, 0.6));
        card.position.set(Math.cos(a) * radius * 0.75, 0.5, Math.sin(a) * radius * 0.75);
        card.rotation.y = -a + Math.PI / 2;
        group.add(card);
        cards.push(card);
      }
      let last = -Infinity;
      const patch = followGroup(ctx, { position: { x: o.x, y: o.y, z: o.z } }, group, seconds, (prog, now) => {
        flare.update(now);
        const age = prog * seconds;
        const settle = prog > 0.8 ? 1 - (prog - 0.8) / 0.2 : 1;
        cards.forEach((c, i) => {
          const f = 0.75 + 0.25 * Math.sin(age * 9 + i * 1.7);
          c.scale.set(1, f * settle, 1);
          c.position.y = 0.5 * f * settle;
        });
        (floor.material as THREE.MeshBasicMaterial).opacity = 0.7 * settle;
        if (prog < 0.9 && now - last >= 0.25) {
          last = now;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + age;
            ctx.points.emit('ember', { x: o.x + Math.cos(a) * radius * 0.6, y: o.y + 0.1, z: o.z + Math.sin(a) * radius * 0.6 }, 1, { color: EMBER, spread: 0.15, rise: 2, life: 0.9 }, now);
          }
        }
      });
      return {
        update: (now) => patch.update(now),
        stop() {
          flare.stop();
          patch.stop();
        },
      };
    },
  };
}
