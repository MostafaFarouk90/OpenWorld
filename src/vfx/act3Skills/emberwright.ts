import * as THREE from 'three';
import type { EffectFactory, EffectInstance, FxContext } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';

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
