import * as THREE from 'three';
import type { EffectFactory, EffectInstance, FxContext } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';
import { createFresnelShell, createShockRing, setRingProgress, setShellProgress } from '../shaders/fresnelShell';

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

// ---- Tier 5 capstones (K11 PR 3, design 11.5) -------------------------------------------------------------------------------------

export const WARDEN_T5_EFFECT_IDS = ['wyrmbreaker-charge', 'wyrmbreaker', 'mountain-unmoved', 'voice-of-the-mountain', 'voice-stun'] as const;
export type WardenT5EffectId = (typeof WARDEN_T5_EFFECT_IDS)[number];

/**
 * Peak live points per cast against the 11.1 cap of 4,000 (measured through a real VfxServiceImpl in warden.test.ts):
 * wyrmbreaker-charge 2 embers per 0.2 s with a 0.5 s life (measured peak 6; the shell and the core are meshes);
 * wyrmbreaker 36 ash and 30 embers at the feet plus 12 ash at the far end of the fissure (measured peak 78; the 10 crack cards and the ring
 * are meshes, the scorch is one decal);
 * mountain-unmoved 24 ash on casting and 8 per 0.5 s with a 1.0 s life (worst-case peak 40 with every life at its x1.25 jitter maximum, tests pin Math.random to it; the shell is a mesh);
 * voice-of-the-mountain 150 ash (design count) and no other points (measured peak 150; two rings are meshes);
 * voice-stun 0 (three orbiting stars are meshes).
 */
export const WARDEN_T5_PARTICLES: Record<WardenT5EffectId, number> = {
  'wyrmbreaker-charge': 6,
  wyrmbreaker: 78,
  'mountain-unmoved': 40,
  'voice-of-the-mountain': 150,
  'voice-stun': 0,
};

const HOT = 0xff5a20;
const WHITE_HOT = 0xffe0b0;
const MOUNTAIN_GREY = 0x8c8478;

const additiveMat = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/**
 * Like `timedMesh` for a group (`timedMesh` crashes on a group with children: `disposeFx` detaches each mesh while the traversal is
 * still walking the child list). `step` gets progress 0..1; `stop` removes everything at once.
 */
function timedGroup(ctx: FxContext, group: THREE.Group, seconds: number, step: (p: number, now: number) => void): EffectInstance {
  const start = ctx.now();
  ctx.scene.add(group);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    ctx.scene.remove(group);
    for (const c of [...group.children]) {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
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

export function wardenT5Effects(h: Tier3Helpers): Record<WardenT5EffectId, EffectFactory> {
  const { origin, num } = h;
  const scratch = new THREE.Vector3();
  /** The effect's position now: the attached root's world position plus the offset (the preset adds them), else the offset itself. */
  const anchor = (t: Parameters<EffectFactory>[1]) => {
    if (t.attach) {
      t.attach.getWorldPosition(scratch);
      return { x: scratch.x + t.position.x, y: scratch.y + t.position.y, z: scratch.z + t.position.z };
    }
    return { x: t.position.x, y: t.position.y, z: t.position.z };
  };

  return {
    // Wyrmbreaker charge: a red-orange shell on the Warden with a white-hot core that grows over `seconds`, and a few embers.
    'wyrmbreaker-charge': (ctx, t, p) => {
      const seconds = num(p, 'seconds', 0.8);
      const group = new THREE.Group();
      const shell = createFresnelShell({ radius: 0.9, color: HOT, intensity: 1.2 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), additiveMat(WHITE_HOT, 0.9));
      group.add(shell, core);
      let lastEmit = -Infinity;
      const place = () => {
        const a = anchor(t);
        group.position.set(a.x, a.y + 1.3, a.z);
      };
      place();
      return timedGroup(ctx, group, seconds, (q, now) => {
        place();
        setShellProgress(shell, 0.1 + 0.5 * q);
        core.scale.setScalar(0.25 + 1.4 * q);
        if (now - lastEmit >= 0.2) {
          lastEmit = now;
          const a = anchor(t);
          ctx.points.emit('ember', { x: a.x, y: a.y + 1.3, z: a.z }, 2, { color: HOT, spread: 0.4, rise: 0.8, life: 0.5 }, now);
        }
      });
    },
    // Wyrmbreaker fissure: 10 emissive crack cards race out along the line (param `length`, 12 m), a ring at the feet, dust and
    // embers, a scorch decal and a flash. The 0.3 s shake and the 100 ms hit-stop are the plugin's.
    wyrmbreaker: (ctx, t, p) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const length = num(p, 'length', 12);
      const width = num(p, 'width', 4);
      const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const group = new THREE.Group();
      const CARDS = 10;
      const cards: THREE.Mesh[] = [];
      for (let i = 0; i < CARDS; i++) {
        const seg = length / CARDS;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35 + 0.1 * (i % 3), seg * 1.3), additiveMat(i % 2 ? HOT : 0xff8a30, 0.85));
        m.rotation.x = -Math.PI / 2;
        // Slightly off the line, alternating sides, within the half width.
        const side = ((i % 2) * 2 - 1) * Math.min(width / 2, 0.5) * ((i % 3) / 3);
        m.position.set(o.x + f.x * (seg * (i + 0.5)) - f.z * side, o.y + 0.06, o.z + f.z * (seg * (i + 0.5)) + f.x * side);
        m.rotation.z = yaw + (i % 2 ? 0.12 : -0.12);
        m.visible = false;
        cards.push(m);
        group.add(m);
      }
      const ringMesh = createShockRing({ inner: 0.4, outer: 0.7, color: HOT });
      ringMesh.position.set(o.x, o.y + 0.05, o.z);
      group.add(ringMesh);
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.2, z: o.z }, 36, { color: 0xc8b898, spread: 1.6, rise: 0.7, life: 0.7 }, ctx.now());
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.4, z: o.z }, 30, { color: HOT, spread: 1.0, rise: 1.4, life: 0.7 }, ctx.now());
      ctx.points.emit('ash', { x: o.x + f.x * length, y: o.y + 0.2, z: o.z + f.z * length }, 12, { color: 0xc8b898, spread: 1.0, rise: 0.6, life: 0.7 }, ctx.now());
      ctx.decals.place({ x: o.x, y: o.y, z: o.z }, t.normal, 1.1, 0x120c06, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 0.8, z: o.z }, HOT, 8, 0.03, 0.25, ctx.now());
      return timedGroup(ctx, group, 1.4, (q) => {
        // The cards appear one after another over the first 0.35 s (the race), then glow down.
        const race = Math.min(1, q / 0.25);
        cards.forEach((c, i) => {
          c.visible = race >= (i + 1) / CARDS;
          (c.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - q);
        });
        setRingProgress(ringMesh, Math.min(1, q / 0.5));
      });
    },
    // Mountain Unmoved: a grey stone shell on the Warden for `seconds` (stoppable) and dust columns rising at four points around it.
    'mountain-unmoved': (ctx, t, p) => {
      const seconds = num(p, 'seconds', 10);
      const group = new THREE.Group();
      const shell = createFresnelShell({ radius: 1.15, color: MOUNTAIN_GREY, intensity: 1.0 });
      group.add(shell);
      const place = () => {
        const a = anchor(t);
        group.position.set(a.x, a.y + 1, a.z);
      };
      place();
      const a0 = anchor(t);
      ctx.points.emit('ash', { x: a0.x, y: a0.y + 0.2, z: a0.z }, 24, { color: 0x8a7a60, spread: 1.0, rise: 0.8, life: 1.0 }, ctx.now());
      let last = ctx.now();
      return timedGroup(ctx, group, seconds, (q, now) => {
        place();
        setShellProgress(shell, q > 0.9 ? 0.2 + (q - 0.9) * 6 : 0.2);
        if (now - last >= 0.5) {
          last = now;
          const a = anchor(t);
          for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + now;
            ctx.points.emit('ash', { x: a.x + Math.cos(ang) * 0.8, y: a.y + 0.1, z: a.z + Math.sin(ang) * 0.8 }, 2, { color: 0x8a7a60, spread: 0.15, rise: 1.6, life: 1.0 }, now);
          }
        }
      });
    },
    // Voice of the Mountain: a 12 m ring with a second, fainter ring behind it (the distortion refraction is not built: no refraction
    // shader exists) and 150 dust points knocked out of the ground. The 0.4 s shake is the plugin's.
    'voice-of-the-mountain': (ctx, t, p) => {
      const o = origin(t);
      const radius = num(p, 'radius', 12);
      const group = new THREE.Group();
      const outer = createShockRing({ inner: radius * 0.125, outer: radius * 0.2, color: 0xd8c8a0 });
      const inner = createShockRing({ inner: radius * 0.08, outer: radius * 0.14, color: 0x9a8f80 });
      for (const r of [outer, inner]) {
        r.position.set(o.x, o.y + 0.05, o.z);
        group.add(r);
      }
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.2, z: o.z }, 150, { color: 0xb0a088, spread: radius * 0.7, rise: 1.4, life: 0.9 }, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 1, z: o.z }, 0xffd8a0, 9, 0.03, 0.3, ctx.now());
      return timedGroup(ctx, group, 0.7, (q) => {
        setRingProgress(outer, q);
        setRingProgress(inner, Math.max(0, q - 0.15) / 0.85);
      });
    },
    // Voice stun swirl: three small stars circling over the stunned foe's head (attach) for `seconds`.
    'voice-stun': (ctx, t, p) => {
      const seconds = num(p, 'seconds', 3);
      const group = new THREE.Group();
      const stars: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), additiveMat(0xffe070, 0.9));
        stars.push(m);
        group.add(m);
      }
      const place = () => {
        const a = anchor(t);
        group.position.set(a.x, a.y + 2.1, a.z);
      };
      place();
      return timedGroup(ctx, group, seconds, (_q, now) => {
        place();
        stars.forEach((m, i) => {
          const ang = now * 5 + (i / 3) * Math.PI * 2;
          m.position.set(Math.cos(ang) * 0.4, 0, Math.sin(ang) * 0.4);
          m.rotation.y = ang;
        });
      });
    },
  };
}
