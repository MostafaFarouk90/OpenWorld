import * as THREE from 'three';
import type { EffectFactory, EffectInstance, FxContext } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';
import { createFresnelShell, createShockRing, setRingProgress, setShellProgress } from '../shaders/fresnelShell';

/**
 * Emberwright tier 4 presets (K11 PR 2, design 11.5; ember orange, wind white-gold). All sizes in metres around `origin`; the
 * meshes are built from three.js primitives, no texture and no noise sampled from world position. The shards and motes are
 * `InstancedMesh`es (one draw call each) and so cost no points.
 *
 * Particle use per cast against the 11.1 cap of 4,000 live points (`EMBERWRIGHT_T4_PARTICLES` is the peak live table, checked by a
 * test against a real `VfxServiceImpl`):
 * - cinder-rain: 300 falling shards (instanced mesh), a ground ring, a scorch decal from the decal pool every 0.2 s (15 over the
 *   3 s, pooled, they fade by the pool's own clock) and 3 embers every 0.1 s with a 0.8 s life for the 3 s (peak 27 live), plus a
 *   10-ember puff on the first frame.
 * - temper-weapon: an emissive shell and a thin core on the weapon side of the actor (2 meshes), 2 embers every 0.08 s with a 0.7 s
 *   life for the 20 s (worst case 22 with the pool's life jitter; measured 20 to 21, table 24), one spark burst on application (the spark pool, not points). Looping until stopped.
 * - emberwright-updraft: a ground ring, a second faster ring, 120 swirling motes on helices (one instanced mesh) rising 1.5 m
 *   over 0.8 s, and a 12-point dust puff on the first frame (peak 12 live).
 * Nothing here holds a point after `stop()` beyond its own short life.
 */
export const EMBERWRIGHT_T4_EFFECT_IDS = ['cinder-rain', 'temper-weapon', 'emberwright-updraft'] as const;
export type EmberwrightT4EffectId = (typeof EMBERWRIGHT_T4_EFFECT_IDS)[number];

/** Peak live points per cast, for the budget test. */
export const EMBERWRIGHT_T4_PARTICLES: Record<EmberwrightT4EffectId, number> = {
  'cinder-rain': 40,
  'temper-weapon': 24,
  'emberwright-updraft': 12,
};

const ORANGE = 0xff7a20;
const EMBER = 0xffa040;
const SCORCH = 0x1a1208;
const WIND = 0xffe8b0;
const SHARDS = 300;
const MOTES = 120;
const SCRATCH = new THREE.Vector3();

const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A small deterministic generator, so a preset looks the same on every cast and a test is repeatable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Like `timedMesh` for a group (knight.ts has the same, kept local: `timedMesh` disposes with `traverse`, which skips children of a
 * group). `seconds` of Infinity runs until stopped. Each child is torn down on its own, instanced meshes included.
 */
function timedGroup(ctx: FxContext, group: THREE.Group, seconds: number, step: (age: number, p: number, now: number) => void, place?: () => void): EffectInstance {
  const start = ctx.now();
  group.frustumCulled = false;
  place?.();
  ctx.scene.add(group);
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    ctx.scene.remove(group);
    for (const c of [...group.children]) {
      group.remove(c);
      const m = c as THREE.Mesh | THREE.InstancedMesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
      (m as THREE.InstancedMesh).dispose?.();
    }
  };
  return {
    update(now) {
      if (done) return false;
      const age = now - start;
      const p = age / seconds;
      if (!(p < 1)) {
        finish();
        return false;
      }
      place?.();
      step(Math.max(0, age), Math.max(0, p), now);
      return true;
    },
    stop: finish,
  };
}

export function emberwrightT4Effects(h: Tier3Helpers): Record<EmberwrightT4EffectId, EffectFactory> {
  const { ring, origin, num } = h;
  const dummy = new THREE.Object3D();

  return {
    // Cinder Rain (effect 13): 300 shards fall onto a `radius` (5) field for `seconds` (3): a faint ground ring, a scorch decal
    // and a few embers where cinders land. The shards thin out over the last 0.4 s.
    'cinder-rain': (ctx, t, p) => {
      const seconds = Math.max(0.3, num(p, 'seconds', 3));
      const radius = Math.max(0.5, (t.scale ?? 1) * num(p, 'radius', 5));
      const o = origin(t);
      const top = 9;
      const rnd = lcg(0x51c3);
      const group = new THREE.Group();
      const geo = new THREE.ConeGeometry(0.05, 0.4, 4);
      geo.rotateX(Math.PI); // the tip points down
      const shards = new THREE.InstancedMesh(geo, additive(ORANGE, 0.9), SHARDS);
      shards.frustumCulled = false;
      const colour = new THREE.Color();
      const sx = new Float32Array(SHARDS);
      const sz = new Float32Array(SHARDS);
      const sSpeed = new Float32Array(SHARDS);
      const sPhase = new Float32Array(SHARDS);
      for (let i = 0; i < SHARDS; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * radius;
        sx[i] = Math.cos(a) * r;
        sz[i] = Math.sin(a) * r;
        sSpeed[i] = 11 + rnd() * 6;
        sPhase[i] = rnd() * top;
        shards.setColorAt(i, colour.setHex(rnd() < 0.35 ? EMBER : ORANGE));
      }
      group.add(shards);
      const floor = new THREE.Mesh(new THREE.RingGeometry(radius * 0.95, radius, 48), additive(ORANGE, 0.4));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.06;
      group.add(floor);
      ctx.lights.flash({ x: o.x, y: o.y + 1.5, z: o.z }, ORANGE, 6, 0.1, 0.6, ctx.now());
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.2, z: o.z }, 10, { color: EMBER, spread: radius * 0.5, rise: 1.2, life: 0.8 }, ctx.now());
      let lastEmber = -Infinity;
      let lastDecal = -Infinity;
      return timedGroup(
        ctx,
        group,
        seconds,
        (age, prog, now) => {
          const fadeOut = Math.min(1, (1 - prog) * seconds / 0.4);
          shards.count = Math.max(0, Math.round(SHARDS * fadeOut));
          for (let i = 0; i < shards.count; i++) {
            const y = top - ((age * sSpeed[i] + sPhase[i]) % top);
            dummy.position.set(sx[i], y, sz[i]);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            shards.setMatrixAt(i, dummy.matrix);
          }
          shards.instanceMatrix.needsUpdate = true;
          (floor.material as THREE.MeshBasicMaterial).opacity = 0.4 * (0.7 + 0.3 * Math.sin(age * 9)) * fadeOut;
          if (now - lastEmber >= 0.1) {
            lastEmber = now;
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * radius;
            ctx.points.emit('ember', { x: o.x + Math.cos(a) * r, y: o.y + 0.1, z: o.z + Math.sin(a) * r }, 3, { color: EMBER, spread: 0.3, rise: 1.6, life: 0.8 }, now);
          }
          if (now - lastDecal >= 0.2 && prog < 0.95) {
            lastDecal = now;
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * radius;
            ctx.decals.place({ x: o.x + Math.cos(a) * r, y: o.y + 0.02, z: o.z + Math.sin(a) * r }, undefined, 0.45, SCORCH, now);
          }
        },
        () => group.position.set(o.x, o.y, o.z),
      );
    },

    // Temper Weapon (Anvilcraft 4): on the actor's weapon side, an emissive shell around a bright core, a looping ember trail and
    // one spark burst when it is applied. It follows the attached root (position is an offset from it) and runs `seconds` (20)
    // or until stopped; the last second flickers.
    'temper-weapon': (ctx, t, p) => {
      const seconds = Math.max(0.5, num(p, 'seconds', 20));
      const group = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 1.1, 10, 1, true), additive(ORANGE, 0.55));
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 1.0, 6), additive(0xfff0c0, 0.9));
      shell.position.set(0.32, 1.0, 0.12);
      core.position.copy(shell.position);
      group.add(shell, core);
      const place = (): void => {
        if (t.attach) {
          t.attach.getWorldPosition(SCRATCH);
          group.position.set(SCRATCH.x + t.position.x, SCRATCH.y + t.position.y, SCRATCH.z + t.position.z);
          t.attach.getWorldQuaternion(group.quaternion);
        } else {
          group.position.set(t.position.x, t.position.y, t.position.z);
          group.rotation.y = t.yaw ?? 0;
        }
      };
      place();
      group.updateMatrixWorld(true);
      const tip = (): THREE.Vector3 => group.localToWorld(SCRATCH.set(shell.position.x, shell.position.y + 0.45, shell.position.z));
      const at = tip();
      ctx.sparks.burst({ x: at.x, y: at.y, z: at.z }, undefined, 18, { color: EMBER, speed: 3, life: 0.45, spread: 1 }, ctx.now());
      ctx.lights.flash({ x: at.x, y: at.y, z: at.z }, ORANGE, 4, 0.05, 0.35, ctx.now());
      let lastEmber = -Infinity;
      return timedGroup(
        ctx,
        group,
        seconds,
        (age, _prog, now) => {
          const fadeIn = Math.min(1, age / 0.3);
          const last = Math.max(0, seconds - age);
          const flicker = last < 1 ? 0.5 + 0.5 * Math.sin(age * 40) : 1;
          const pulse = 0.75 + 0.25 * Math.sin(age * 6);
          (shell.material as THREE.MeshBasicMaterial).opacity = 0.55 * fadeIn * pulse * flicker;
          (core.material as THREE.MeshBasicMaterial).opacity = 0.9 * fadeIn * flicker;
          if (now - lastEmber >= 0.08) {
            lastEmber = now;
            group.updateMatrixWorld(true);
            const v = tip();
            ctx.points.emit('ember', { x: v.x, y: v.y, z: v.z }, 2, { color: EMBER, spread: 0.12, rise: 0.8, life: 0.7 }, now);
          }
        },
        place,
      );
    },

    // Updraft (Bellowsbreath 4): a ground ring and a second, quicker one, a dust puff, and 120 motes on helices that rise 1.5 m
    // over 0.8 s with an ease-out, spiralling about the column. `radius` is the 4 m of the skill. The foes' own lift is this column's
    // (open point A): their bodies do not move.
    'emberwright-updraft': (ctx, t, p) => {
      const seconds = Math.max(0.2, num(p, 'seconds', 0.8));
      const radius = Math.max(0.5, (t.scale ?? 1) * num(p, 'radius', 4));
      const lift = num(p, 'lift', 1.5);
      const o = origin(t);
      const rnd = lcg(0x9d17);
      const flare = ring(ctx, { position: { x: o.x, y: o.y + 0.05, z: o.z } }, radius, WIND, seconds);
      const inner = ring(ctx, { position: { x: o.x, y: o.y + 0.05, z: o.z } }, radius * 0.55, ORANGE, seconds * 0.7);
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.1, z: o.z }, 12, { color: 0xc8b898, spread: radius * 0.5, rise: 0.8, life: 0.7 }, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 0.8, z: o.z }, WIND, 5, 0.05, 0.5, ctx.now());
      const group = new THREE.Group();
      const geo = new THREE.OctahedronGeometry(0.06, 0);
      const motes = new THREE.InstancedMesh(geo, additive(WIND, 0.85), MOTES);
      motes.frustumCulled = false;
      const colour = new THREE.Color();
      const mr = new Float32Array(MOTES);
      const ma = new Float32Array(MOTES);
      const mh = new Float32Array(MOTES);
      const mw = new Float32Array(MOTES);
      for (let i = 0; i < MOTES; i++) {
        mr[i] = (0.25 + Math.sqrt(rnd()) * 0.75) * radius;
        ma[i] = rnd() * Math.PI * 2;
        mh[i] = 0.5 + rnd() * 0.5; // each mote's share of the lift
        mw[i] = 3 + rnd() * 3; // turns per second, in radians
        motes.setColorAt(i, colour.setHex(rnd() < 0.4 ? ORANGE : WIND));
      }
      group.add(motes);
      const col = timedGroup(
        ctx,
        group,
        seconds,
        (age, prog) => {
          const ease = 1 - (1 - prog) * (1 - prog);
          const alive = prog < 0.8 ? 1 : (1 - prog) / 0.2;
          for (let i = 0; i < MOTES; i++) {
            // The motes draw in toward the column as they rise.
            const r = mr[i] * (1 - 0.5 * ease);
            const a = ma[i] + age * mw[i];
            dummy.position.set(Math.cos(a) * r, 0.1 + lift * mh[i] * ease, Math.sin(a) * r);
            dummy.scale.setScalar(alive);
            dummy.updateMatrix();
            motes.setMatrixAt(i, dummy.matrix);
          }
          motes.instanceMatrix.needsUpdate = true;
        },
        () => group.position.set(o.x, o.y, o.z),
      );
      return {
        update(now) {
          const a = flare.update(now);
          inner.update(now);
          const b = col.update(now);
          return a || b;
        },
        stop() {
          flare.stop();
          inner.stop();
          col.stop();
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tier 5 capstones (K11 PR 4, design 11.5)
// ---------------------------------------------------------------------------------------------------------------------

export const EMBERWRIGHT_T5_EFFECT_IDS = ['sunfire-charge', 'sunfire-nova', 'sunfire-ground', 'colossus-rise', 'colossus-slag', 'colossus-slam', 'keepers-breath', 'keepers-heal'] as const;
export type EmberwrightT5EffectId = (typeof EMBERWRIGHT_T5_EFFECT_IDS)[number];

/**
 * Particle use per cast against the 11.1 cap of 4,000 live points and the capstone budget of 220. `EMBERWRIGHT_T5_PARTICLES` is the
 * deterministic worst case, measured through a real `VfxServiceImpl` in emberwright.test.ts with Math.random pinned to its maximum
 * (every point then lives 1.25x its life). Per cast (the three capstones are exclusive, so one class uses one of them at a time):
 * - sunfire-charge: a glow shell and a white-hot core growing over the 0.6 s charge, 2 embers every 0.1 s (0.4 s life): peak 10.
 * - sunfire-nova: the 10 m ring (an expanding fresnel sphere, a ground shock ring, a scorch decal, a light flash) and 160 embers and
 *   ash at the instant of the ring (0.8 s life): peak 160. The 80 ms white flash and the 0.4 s shake are the plugin's.
 * - sunfire-ground: 6 m of burning ground for 6 s (a flickering disc, an edge ring and 8 flame cards on one instanced mesh), 4 embers
 *   every 0.25 s (0.9 s life): peak 20.
 * - colossus-rise: a slag mound pulling up over 1.5 s, a floor scorch decal, a ring and 200 points (120 embers and 80 ash) at the
 *   first frame: peak 200. The 0.4 s shake is the plugin's.
 * - colossus-slag: rides the golem for 30 s: a lava glow shell, 6 translucent haze cards drifting up (the heat haze stand-in: no
 *   refraction shader exists), 1 ember every 0.3 s (1 s life): peak 5.
 * - colossus-slam: a 4 m ring, a scorch decal, a flash and 40 dust points: peak 40.
 * - keepers-breath: a faint open cone of 8 m and 35 degrees, 6 gold or green motes every 0.05 s (0.5 s life) for 2 s: peak 72.
 * - keepers-heal: a green-gold ring and shell on an ally for 1 s, 8 motes: peak 8.
 * Nothing here holds a point after `stop()` beyond its own short life. Not built: a bloom boost on the Nova (no helper exists; the
 * plugin pulses the screen white instead) and a real heat-haze refraction on the golem.
 */
export const EMBERWRIGHT_T5_PARTICLES: Record<EmberwrightT5EffectId, number> = {
  'sunfire-charge': 10,
  'sunfire-nova': 160,
  'sunfire-ground': 20,
  'colossus-rise': 200,
  'colossus-slag': 5,
  'colossus-slam': 40,
  'keepers-breath': 72,
  'keepers-heal': 8,
};

const SUN = 0xffb040;
const WHITE_HOT = 0xfff2d0;
const SLAG = 0x6a2a10;
const LAVA = 0xff5a10;
const KEEPER_GOLD = 0xffd860;
const KEEPER_GREEN = 0x7ee07e;

export function emberwrightT5Effects(h: Tier3Helpers): Record<EmberwrightT5EffectId, EffectFactory> {
  const { ring, origin, num } = h;
  const dummy = new THREE.Object3D();
  /** The effect's position now: the attached root's world position plus the offset, else the offset itself. */
  const anchor = (t: Parameters<EffectFactory>[1]): { x: number; y: number; z: number } => {
    if (t.attach) {
      t.attach.getWorldPosition(SCRATCH);
      return { x: SCRATCH.x + t.position.x, y: SCRATCH.y + t.position.y, z: SCRATCH.z + t.position.z };
    }
    return { x: t.position.x, y: t.position.y, z: t.position.z };
  };

  return {
    // Sunfire Nova charge (0 to 0.6): a warm shell and a white-hot core that grow on the Emberwright's chest (rides `attach`), embers drawn in.
    'sunfire-charge': (ctx, t, p) => {
      const seconds = Math.max(0.1, num(p, 'seconds', 0.6));
      const group = new THREE.Group();
      const shell = createFresnelShell({ radius: 1, color: SUN, intensity: 1.4 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), additive(WHITE_HOT, 0.9));
      group.add(shell, core);
      let lastEmber = -Infinity;
      const place = (): void => {
        const a = anchor(t);
        group.position.set(a.x, a.y + 1.2, a.z);
      };
      return timedGroup(
        ctx,
        group,
        seconds,
        (_age, prog, now) => {
          shell.scale.setScalar(0.3 + 1.3 * prog);
          setShellProgress(shell, 0.1 * (1 - prog));
          core.scale.setScalar(0.3 + 2.2 * prog);
          if (now - lastEmber >= 0.1) {
            lastEmber = now;
            const a = anchor(t);
            ctx.points.emit('ember', { x: a.x, y: a.y + 1.2, z: a.z }, 2, { color: SUN, spread: 0.7 * (1 - prog) + 0.1, rise: 0.4, life: 0.4 }, now);
          }
        },
        place,
      );
    },

    // Sunfire Nova (effect 14): an emissive fresnel sphere growing to `radius` (10) over `seconds` (0.5) while it fades, a ground shock ring,
    // a scorch decal, a light flash and 160 embers and ash thrown out at the instant. The white flash and the shake are the plugin's.
    'sunfire-nova': (ctx, t, p) => {
      const seconds = Math.max(0.1, num(p, 'seconds', 0.5));
      const radius = Math.max(1, (t.scale ?? 1) * num(p, 'radius', 10));
      const o = origin(t);
      const group = new THREE.Group();
      const sphere = createFresnelShell({ radius: 1, color: SUN, intensity: 2.2 });
      sphere.position.set(0, 0.6, 0);
      const wave = createShockRing({ inner: radius * 0.125, outer: radius * 0.2, color: WHITE_HOT });
      wave.position.set(0, 0.06, 0);
      group.add(sphere, wave);
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.5, z: o.z }, 110, { color: SUN, spread: radius * 0.5, rise: 2.2, life: 0.8 }, ctx.now());
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.3, z: o.z }, 50, { color: 0xc8a878, spread: radius * 0.6, rise: 1.2, life: 0.8 }, ctx.now());
      ctx.decals.place({ x: o.x, y: o.y + 0.02, z: o.z }, undefined, 2.2, SCORCH, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 1.5, z: o.z }, SUN, 14, 0.05, 0.6, ctx.now());
      return timedGroup(
        ctx,
        group,
        seconds + 0.3,
        (age) => {
          const q = Math.min(1, age / seconds);
          sphere.scale.setScalar(Math.max(0.05, radius * q));
          setShellProgress(sphere, q);
          setRingProgress(wave, q);
        },
        () => group.position.set(o.x, o.y, o.z),
      );
    },

    // The burning ground of the Nova for `seconds` (6): a flickering disc and edge ring of `radius` (6), 8 flame cards (one instanced mesh)
    // licking up, and a few embers.
    'sunfire-ground': (ctx, t, p) => {
      const seconds = Math.max(0.5, num(p, 'seconds', 6));
      const radius = Math.max(0.5, (t.scale ?? 1) * num(p, 'radius', 6));
      const o = origin(t);
      const rnd = lcg(0x5f1e);
      const group = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), additive(LAVA, 0.18));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.05;
      const edge = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 48), additive(SUN, 0.5));
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.07;
      const CARDS = 8;
      const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.6), additive(SUN, 0.5), CARDS);
      cards.frustumCulled = false;
      const cx = new Float32Array(CARDS);
      const cz = new Float32Array(CARDS);
      const cph = new Float32Array(CARDS);
      for (let i = 0; i < CARDS; i++) {
        const a = (i / CARDS) * Math.PI * 2 + rnd() * 0.5;
        const r = (0.35 + rnd() * 0.55) * radius;
        cx[i] = Math.cos(a) * r;
        cz[i] = Math.sin(a) * r;
        cph[i] = rnd() * 6;
      }
      group.add(disc, edge, cards);
      let lastEmber = -Infinity;
      return timedGroup(
        ctx,
        group,
        seconds,
        (age, prog, now) => {
          const fade = Math.min(1, (1 - prog) * seconds / 0.6);
          (disc.material as THREE.MeshBasicMaterial).opacity = (0.14 + 0.06 * Math.sin(age * 7)) * fade;
          (edge.material as THREE.MeshBasicMaterial).opacity = (0.45 + 0.15 * Math.sin(age * 5)) * fade;
          (cards.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
          for (let i = 0; i < CARDS; i++) {
            const flick = 0.75 + 0.25 * Math.sin(age * 9 + cph[i]);
            dummy.position.set(cx[i], 0.8 * flick, cz[i]);
            dummy.rotation.set(0, age * 0.8 + cph[i], 0);
            dummy.scale.set(1, flick, 1);
            dummy.updateMatrix();
            cards.setMatrixAt(i, dummy.matrix);
          }
          cards.instanceMatrix.needsUpdate = true;
          if (now - lastEmber >= 0.25 && prog < 0.92) {
            lastEmber = now;
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd()) * radius;
            ctx.points.emit('ember', { x: o.x + Math.cos(a) * r, y: o.y + 0.1, z: o.z + Math.sin(a) * r }, 4, { color: SUN, spread: 0.5, rise: 1.5, life: 0.9 }, now);
          }
        },
        () => group.position.set(o.x, o.y, o.z),
      );
    },

    // Colossus rise (1.5 s): a slag mound pulls up out of a floor scorch decal, a ring spreads and 200 points (embers and ash) are thrown
    // up at the first frame. The golem itself rises with the rig; the 0.4 s shake is the plugin's.
    'colossus-rise': (ctx, t, p) => {
      const seconds = Math.max(0.2, num(p, 'seconds', 1.5));
      const radius = Math.max(0.5, (t.scale ?? 1) * num(p, 'radius', 4));
      const o = origin(t);
      const group = new THREE.Group();
      const mound = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.7, 2.4, 14, 1, true), new THREE.MeshBasicMaterial({ color: SLAG, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      mound.position.y = 0;
      const glow = new THREE.Mesh(new THREE.RingGeometry(radius * 0.5, radius * 0.9, 40), additive(LAVA, 0.6));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.06;
      group.add(mound, glow);
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.3, z: o.z }, 120, { color: LAVA, spread: radius * 0.6, rise: 3, life: 1.2 }, ctx.now());
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.2, z: o.z }, 80, { color: 0x6a5a48, spread: radius * 0.8, rise: 1.6, life: 1.2 }, ctx.now());
      ctx.decals.place({ x: o.x, y: o.y + 0.02, z: o.z }, undefined, radius * 0.9, SCORCH, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 1.2, z: o.z }, LAVA, 10, 0.2, seconds, ctx.now());
      const edge = ring(ctx, { position: { x: o.x, y: o.y + 0.05, z: o.z } }, radius, LAVA, 0.8);
      const body = timedGroup(
        ctx,
        group,
        seconds,
        (_age, prog) => {
          mound.scale.set(1, Math.max(0.05, 1 - 0.8 * prog), 1);
          mound.position.y = 1.2 * (1 - prog);
          (mound.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - prog);
          (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - prog * 0.6);
        },
        () => group.position.set(o.x, o.y, o.z),
      );
      return {
        update(now) {
          const a = edge.update(now);
          const b = body.update(now);
          return a || b;
        },
        stop() {
          edge.stop();
          body.stop();
        },
      };
    },

    // Colossus slag (rides the golem's root for `seconds`, 30): a pulsing lava shell about the golem (its veins glow through the rig's own
    // emissive; `scale` is the rig's 2), six translucent heat-haze cards drifting up above it, and an ember every 0.3 s.
    'colossus-slag': (ctx, t, p) => {
      const seconds = Math.max(0.5, num(p, 'seconds', 30));
      const scale = Math.max(0.5, num(p, 'scale', 2));
      const group = new THREE.Group();
      const shell = createFresnelShell({ radius: 1.5 * scale, color: LAVA, intensity: 0.9 });
      shell.position.y = 1.6 * scale;
      const HAZE = 6;
      const haze: THREE.Mesh[] = [];
      for (let i = 0; i < HAZE; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * scale, 1.8 * scale), additive(0xffc890, 0.05));
        haze.push(m);
        group.add(m);
      }
      group.add(shell);
      let lastEmber = -Infinity;
      return timedGroup(
        ctx,
        group,
        seconds,
        (age, prog, now) => {
          setShellProgress(shell, 0.35 + 0.15 * Math.sin(age * 3));
          const fade = Math.min(1, (1 - prog) * seconds / 1);
          haze.forEach((m, i) => {
            const ph = (age * 0.35 + i / HAZE) % 1;
            const a = (i / HAZE) * Math.PI * 2 + age * 0.3;
            m.position.set(Math.cos(a) * 0.9 * scale, 3.2 * scale + ph * 1.6 * scale, Math.sin(a) * 0.9 * scale);
            m.rotation.y = a;
            (m.material as THREE.MeshBasicMaterial).opacity = 0.06 * Math.sin(ph * Math.PI) * fade;
          });
          if (now - lastEmber >= 0.3) {
            lastEmber = now;
            const a = anchor(t);
            ctx.points.emit('ember', { x: a.x, y: a.y + 3 * scale, z: a.z }, 1, { color: LAVA, spread: 0.6 * scale, rise: 1.4, life: 1 }, now);
          }
        },
        () => {
          const a = anchor(t);
          group.position.set(a.x, a.y, a.z);
        },
      );
    },

    // One slam of the golem: a `radius` (4) ring, a scorch decal, a flash and 40 dust points. The small shake is the plugin's.
    'colossus-slam': (ctx, t, p) => {
      const radius = Math.max(0.5, (t.scale ?? 1) * num(p, 'radius', 4));
      const o = origin(t);
      ctx.points.emit('ash', { x: o.x, y: o.y + 0.2, z: o.z }, 40, { color: 0xb0a088, spread: radius * 0.6, rise: 1.2, life: 0.7 }, ctx.now());
      ctx.decals.place({ x: o.x, y: o.y + 0.02, z: o.z }, undefined, 1.2, SCORCH, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 0.8, z: o.z }, LAVA, 8, 0.03, 0.25, ctx.now());
      return ring(ctx, { position: { x: o.x, y: o.y + 0.05, z: o.z } }, radius, LAVA, 0.4);
    },

    // Breath of the Keepers (effect 21, gold-green): an open cone of `range` (8) and `halfAngle` (35 degrees) from the Emberwright's chest
    // along `yaw` for `seconds` (2), flickering, and gold and green motes thrown along it every 0.05 s.
    'keepers-breath': (ctx, t, p) => {
      const seconds = Math.max(0.2, num(p, 'seconds', 2));
      const range = Math.max(1, num(p, 'range', 8));
      const half = (Math.max(5, Math.min(80, num(p, 'halfAngle', 35))) * Math.PI) / 180;
      const yaw = t.yaw ?? 0;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const group = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(half) * range, range, 20, 1, true), additive(KEEPER_GREEN, 0.12));
      // The cone's axis is +Y with the apex up: lay it along the facing with the apex at the origin.
      cone.geometry.translate(0, -range / 2, 0);
      cone.rotation.x = Math.PI / 2; // apex at the origin, opening towards -Z (yaw 0)
      const pivot = new THREE.Group();
      pivot.add(cone);
      pivot.rotation.y = yaw;
      group.add(pivot);
      const rnd = lcg(0x6b1d);
      let lastMote = -Infinity;
      let flip = false;
      return timedGroup(
        ctx,
        group,
        seconds,
        (age, prog, now) => {
          const fade = Math.min(1, age / 0.15, (1 - prog) * seconds / 0.2);
          (cone.material as THREE.MeshBasicMaterial).opacity = (0.10 + 0.05 * Math.sin(age * 22)) * fade;
          if (now - lastMote >= 0.05) {
            lastMote = now;
            flip = !flip;
            const a = anchor(t);
            const d = 0.8 + rnd() * (range - 1.2);
            const side = (rnd() * 2 - 1) * Math.tan(half) * d * 0.8;
            ctx.points.emit(
              'ember',
              { x: a.x + fx * d - fz * side, y: a.y + 1.2 + (rnd() - 0.5) * 0.8, z: a.z + fz * d + fx * side },
              6,
              { color: flip ? KEEPER_GOLD : KEEPER_GREEN, spread: 0.25, rise: 0.5, life: 0.5 },
              now,
            );
          }
        },
        () => {
          const a = anchor(t);
          group.position.set(a.x, a.y + 1.2, a.z);
        },
      );
    },

    // A heal pulse on an ally (rides `attach`): a green-gold ring at its feet, a faint rising shell and 8 motes. One second.
    'keepers-heal': (ctx, t) => {
      const group = new THREE.Group();
      const shell = createFresnelShell({ radius: 0.9, color: KEEPER_GREEN, intensity: 1.2 });
      shell.position.y = 0.9;
      group.add(shell);
      const a0 = anchor(t);
      ctx.points.emit('ember', { x: a0.x, y: a0.y + 0.4, z: a0.z }, 8, { color: KEEPER_GOLD, spread: 0.4, rise: 1.2, life: 0.8 }, ctx.now());
      const foot = ring(ctx, { position: { x: a0.x, y: a0.y + 0.05, z: a0.z } }, 1.1, KEEPER_GREEN, 0.7);
      const body = timedGroup(
        ctx,
        group,
        1,
        (_age, prog) => setShellProgress(shell, prog),
        () => {
          const a = anchor(t);
          group.position.set(a.x, a.y, a.z);
        },
      );
      return {
        update(now) {
          const a = foot.update(now);
          const b = body.update(now);
          return a || b;
        },
        stop() {
          foot.stop();
          body.stop();
        },
      };
    },
  };
}
