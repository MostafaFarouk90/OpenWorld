import * as THREE from 'three';
import type { EffectFactory } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';

/** Warden tier 4 presets (K11 PR 1, design 11.5). All sizes are in metres around `origin`; no noise is sampled from world position. */
export const WARDEN_T4_EFFECT_IDS = ['skullsplitter', 'earthroot', 'earthroot-shock', 'frenzied-hearth'] as const;
export type WardenT4EffectId = (typeof WARDEN_T4_EFFECT_IDS)[number];

/**
 * Peak live points per cast against the 11.1 cap of 4,000 (decals, lights, meshes and sparks are pooled separately):
 * skullsplitter 30 ash + 12 embers, plus 10 ash when the target was staggered (peak 52; the crack fan is 5 decals);
 * earthroot 24 dust on planting and 2 per 0.5 s with a 0.8 s life (peak 28; the 8 root strips are meshes);
 * earthroot-shock 16 dust; frenzied-hearth 2 steam puffs per shoulder per 0.3 s with a 0.8 s life (peak 12).
 */
export const WARDEN_T4_PARTICLES: Record<WardenT4EffectId, number> = {
  skullsplitter: 52,
  earthroot: 28,
  'earthroot-shock': 16,
  'frenzied-hearth': 12,
};

const ROOT_BROWN = 0x5a3e24;
const STONE = 0x9a8f80;
const STEAM = 0xd8d0c8;
const ROOT_CARDS = 8;

export function wardenT4Effects(h: Tier3Helpers): Record<WardenT4EffectId, EffectFactory> {
  const { ring, origin, num } = h;
  return {
    // Skullsplitter: the heavy chop, a wide ring at the target, scorch and a crack fan on a staggered target (param `staggered`).
    skullsplitter: (ctx, t, p) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const staggered = p.staggered === true;
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.2, z: o.z }, 30, { color: 0xc8b898, spread: 1.4, rise: 0.6, life: 0.6 }, ctx.now());
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.4, z: o.z }, 12, { color: 0xff8a30, spread: 0.8, rise: 1.2, life: 0.6 }, ctx.now());
      ctx.decals.place({ x: o.x, y: o.y, z: o.z }, t.normal, 0.9, 0x1a1208, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 0.8, z: o.z }, 0xffa050, 7, 0.03, 0.2, ctx.now());
      if (staggered) {
        // Five cracks fanned across the chop, out to 1.6 m.
        for (let i = 0; i < 5; i++) {
          const a = yaw + (i - 2) * 0.35;
          ctx.decals.place({ x: o.x - Math.sin(a) * 0.8, y: o.y, z: o.z - Math.cos(a) * 0.8 }, t.normal, 0.45, 0x120c06, ctx.now());
        }
        ctx.points.emit('ash', { x: o.x, y: o.y + 0.3, z: o.z }, 10, { color: 0xe0d0b0, spread: 1.6, rise: 0.8, life: 0.5 }, ctx.now());
      }
      return ring(ctx, t, num(p, 'reach', 2.6) * 1.6, 0xd05030, 0.45);
    },
    // Earthroot: 8 brown strips spread under the feet for `seconds` (the call's handle stops them early), dust at the planting.
    earthroot: (ctx, t, p) => {
      const o = origin(t);
      const seconds = num(p, 'seconds', 5);
      const group = new THREE.Group();
      group.position.set(o.x, o.y, o.z);
      for (let i = 0; i < ROOT_CARDS; i++) {
        const a = (i / ROOT_CARDS) * Math.PI * 2;
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.09, 1.1, 5),
          new THREE.MeshBasicMaterial({ color: ROOT_BROWN, transparent: true, opacity: 0.9 }),
        );
        // Lying outward from the feet, tilted slightly into the ground.
        m.position.set(Math.cos(a) * 0.6, 0.05, Math.sin(a) * 0.6);
        m.rotation.set(0, -a, Math.PI / 2 - 0.12);
        group.add(m);
      }
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.1, z: o.z }, 24, { color: 0x8a7a60, spread: 0.9, rise: 0.4, life: 0.7 }, ctx.now());
      // Not timedMesh: its finish() disposes while traversing, which skips children of a Group (disposeFx unparents each one).
      const start = ctx.now();
      let last = start;
      let done = false;
      ctx.scene.add(group);
      const finish = () => {
        if (done) return;
        done = true;
        ctx.scene.remove(group);
        for (const m of [...group.children] as THREE.Mesh[]) {
          group.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      };
      return {
        update(now) {
          if (done) return false;
          const age = now - start;
          if (!(age < seconds)) {
            finish();
            return false;
          }
          // The strips spread over the first 0.3 s, then hold.
          const k = Math.min(1, age / 0.3);
          group.scale.set(0.4 + 0.6 * k, 1, 0.4 + 0.6 * k);
          if (now - last >= 0.5) {
            last = now;
            ctx.points.emit('ash', { x: o.x, y: o.y + 0.1, z: o.z }, 2, { color: 0x8a7a60, spread: 0.8, rise: 0.3, life: 0.8 }, now);
          }
          return true;
        },
        stop: finish,
      };
    },
    // Earthroot shockwave: a stone ring at the feet and a burst of grit.
    'earthroot-shock': (ctx, t, p) => {
      const o = origin(t);
      const radius = num(p, 'radius', 3);
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.1, z: o.z }, 16, { color: STONE, spread: radius * 0.5, rise: 0.7, life: 0.5 }, ctx.now());
      return ring(ctx, t, radius * 1.4, STONE, 0.4);
    },
    // Frenzied Hearth: steam from both shoulders while below 30% health; runs until stopped.
    'frenzied-hearth': (ctx, t) => {
      let last = -Infinity;
      let done = false;
      return {
        update(now) {
          if (done) return false;
          if (now - last >= 0.3) {
            last = now;
            const o = origin(t);
            for (const side of [-0.35, 0.35]) {
              ctx.points.emit('smoke', { x: o.x + side, y: o.y + 1.5, z: o.z }, 2, { color: STEAM, spread: 0.1, rise: 1.1, life: 0.8 }, now);
            }
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
