import * as THREE from 'three';
import type { EffectFactory, EffectInstance, FxContext } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';

/** Knight tier 4 presets (K11 PR 1, design 11.5). All sizes are in metres around `origin`; no noise is sampled from world position. */
export const KNIGHT_T4_EFFECT_IDS = ['bastion-wall', 'executioners-arc', 'hearthfire-motes'] as const;
export type KnightT4EffectId = (typeof KNIGHT_T4_EFFECT_IDS)[number];

/**
 * Peak live points per cast, against the 11.1 cap of 4,000: bastion-wall 0 (6 embers on each flicker, 0.4 s life),
 * executioners-arc 20 embers, hearthfire-motes 40 motes per pulse (1.4 s life, one pulse per 3 s) plus 6 embers for each healed
 * actor's heart (counted for 4 allies, 24). The cone, ground fan, half-disc and hearts are meshes, not points.
 */
export const KNIGHT_T4_PARTICLES: Record<KnightT4EffectId, number> = {
  'bastion-wall': 6,
  'executioners-arc': 20,
  'hearthfire-motes': 64,
};

const GOLD = 0xffc040;
const HEART_GREEN = 0xb8e870;
const SCORCH = 0x1c1008;
const NO_FX = { update: () => false, stop: () => {} };

const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A heart outline as a flat shape (about 0.4 m wide). */
function heartGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.2);
  s.bezierCurveTo(-0.3, 0.02, -0.2, 0.28, 0, 0.14);
  s.bezierCurveTo(0.2, 0.28, 0.3, 0.02, 0, -0.2);
  return new THREE.ShapeGeometry(s);
}

/**
 * Like `timedMesh` for a group. `timedMesh` disposes with `traverse`, and `disposeFx` detaches each mesh while the traversal is still
 * walking the child list, which skips children (and throws on the last); a group is therefore torn down child by child here.
 */
function timedGroup(ctx: FxContext, group: THREE.Group, seconds: number, step: (p: number) => void): EffectInstance {
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
      step(Math.max(0, p));
      return true;
    },
    stop: finish,
  };
}

export function knightT4Effects(h: Tier3Helpers): Record<KnightT4EffectId, EffectFactory> {
  const { timedMesh, origin, num } = h;
  const yawOf = (t: Parameters<EffectFactory>[1]): number => {
    if (t.attach) {
      const e = new THREE.Euler().setFromQuaternion(t.attach.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
      return e.y;
    }
    return t.yaw ?? 0;
  };

  return {
    // Bastion Wall: 8 vertical gold light cards across the 120 degree front cone at 1.6 m, a ground fan under them, riding the
    // player for `seconds`. With `flicker` the same cone flashes for 0.18 s (a covered hit).
    'bastion-wall': (ctx, t, p) => {
      const flicker = num(p, 'flicker', 0) > 0;
      const seconds = flicker ? 0.18 : Math.max(0.2, num(p, 'seconds', 8));
      const group = new THREE.Group();
      const cards: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) {
        const a = ((i / 7 - 0.5) * 120 * Math.PI) / 180;
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.2), additive(GOLD, 0.3));
        card.position.set(-Math.sin(a) * 1.6, 1.1, -Math.cos(a) * 1.6);
        card.rotation.y = a;
        cards.push(card);
        group.add(card);
      }
      // The fan lies flat; the circle's +x maps to -z after the rotation, so its 120 degrees are centred on the facing.
      const fan = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16, Math.PI / 2 - Math.PI / 3, (Math.PI * 2) / 3), additive(GOLD, 0.18));
      fan.rotation.x = -Math.PI / 2;
      fan.position.y = 0.04;
      group.add(fan);
      const place = () => {
        const o = origin(t);
        group.position.set(o.x, o.y, o.z);
        group.rotation.y = yawOf(t);
      };
      place();
      if (flicker) ctx.points.emit('ember', { x: group.position.x, y: group.position.y + 1, z: group.position.z }, 6, { color: GOLD, spread: 0.8, rise: 0.8, life: 0.4 }, ctx.now());
      return timedGroup(ctx, group, seconds, (q) => {
        place();
        const base = flicker ? 0.9 * (1 - q) : 0.3;
        // A slow shimmer (no world-space noise): each card is offset in phase.
        cards.forEach((c, i) => ((c.material as THREE.MeshBasicMaterial).opacity = base * (flicker ? 1 : 0.8 + 0.2 * Math.sin(q * 60 + i))));
        (fan.material as THREE.MeshBasicMaterial).opacity = flicker ? 0.5 * (1 - q) : 0.18;
      });
    },
    // Executioner's Arc: a 3 m half-disc swept across the front in 0.25 s, then faded, 20 embers and a scorch crescent on the ground.
    // The 0.15 s camera shake is the plugin's (vfx.shake); the effect has no camera access.
    'executioners-arc': (ctx, t) => {
      const o = origin(t);
      const yaw = t.yaw ?? 0;
      const segs = 24;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3, segs, 0, Math.PI), additive(0xff7a30, 0.55));
      disc.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(disc);
      holder.position.set(o.x, o.y, o.z);
      disc.position.set(0, 0.9, 0);
      holder.rotation.y = yaw;
      const total = disc.geometry.index?.count ?? segs * 3;
      const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      ctx.points.emit('ember', { x: o.x + f.x * 1.8, y: o.y + 0.9, z: o.z + f.z * 1.8 }, 20, { color: 0xff8030, spread: 1.4, rise: 0.8, life: 0.5 }, ctx.now());
      ctx.decals.place({ x: o.x + f.x * 1.5, y: o.y, z: o.z + f.z * 1.5 }, undefined, 2.2, SCORCH, ctx.now());
      ctx.lights.flash({ x: o.x + f.x * 1.5, y: o.y + 1, z: o.z + f.z * 1.5 }, 0xffa050, 7, 0.03, 0.25, ctx.now());
      return timedGroup(ctx, holder, 0.4, (q) => {
        const sweep = Math.min(1, q / 0.6);
        disc.geometry.setDrawRange(0, Math.min(total, Math.max(3, Math.floor(sweep * segs) * 3)));
        (disc.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - q);
      });
    },
    // Hearthfire Ward: 40 healing motes rise over the banner's aura on each pulse. With `heart` (a healed ally) a small heart
    // rises and fades over 0.9 s above the actor, with 6 embers.
    'hearthfire-motes': (ctx, t, p) => {
      const o = origin(t);
      if (num(p, 'heart', 0) > 0) {
        ctx.points.emit('ember', { x: o.x, y: o.y + 1.8, z: o.z }, 6, { color: HEART_GREEN, spread: 0.3, rise: 0.8, life: 0.8 }, ctx.now());
        const heart = new THREE.Mesh(heartGeometry(), additive(0xff7088, 0.9));
        heart.position.set(o.x, o.y + 2.1, o.z);
        return timedMesh(ctx, heart, 0.9, (q) => {
          heart.position.y = o.y + 2.1 + q * 0.7;
          heart.rotation.y = q * Math.PI * 2;
          (heart.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - q);
        });
      }
      ctx.points.emit('ember', { x: o.x, y: o.y + 0.2, z: o.z }, 40, { color: HEART_GREEN, spread: num(p, 'radius', 8) * 0.35, rise: 1.6, life: 1.4 }, ctx.now());
      ctx.lights.flash({ x: o.x, y: o.y + 1, z: o.z }, HEART_GREEN, 4, 0.1, 0.4, ctx.now());
      return NO_FX;
    },
  };
}
