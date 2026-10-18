import * as THREE from 'three';
import { actorsInRadius } from '../../spells/areas';
import type { SurgeFormContext, SurgeFormImpl } from '../../spells/SurgeAndRally';
import { ASH_DRIFT } from './tuning';
import { SURGE } from '../../vfx/tuning';

type V3 = { x: number; y: number; z: number };

export interface DriftPorts {
  /** Interior id at a point, null outdoors or when interiors are absent. */
  interiorAt(p: V3): string | null;
  /** The interior the player is in (`interiors.current`), null outdoors. */
  currentInterior(): string | null;
  /** Closest solid hit along `dir` (unit) within `max` metres, ignoring the player's own collider. */
  raycast(origin: V3, dir: V3, max: number): { distance: number; point: V3 } | null;
  teleport(feet: V3, yaw: number): void;
  /** `combatVerbs.addInvulnerability('ash-drift', seconds)`; the release is idempotent. Null when the hook is absent. */
  invulnerable(seconds: number): (() => void) | null;
  /** Fades the avatar back in at the arrival (vfx.dissolve reverse). */
  arrive(): void;
  warn(message: string): void;
}

const fwd = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** The target's facing on the XZ plane (its root's -Z), or null when it has no root. */
function facingOf(root: THREE.Object3D | null): { x: number; z: number } | null {
  if (!root) return null;
  const v = new THREE.Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  const l = Math.hypot(v.x, v.z);
  return l < 1e-6 ? null : { x: v.x / l, z: v.z / l };
}

/** A safe standing point near `want`, or null: no wall between `from` and it, ground within tolerance of `refY`. */
function landing(p: DriftPorts, from: V3, want: { x: number; z: number }, refY: number, clear = 0): V3 | null {
  const chest = ASH_DRIFT.chestHeight;
  const dx = want.x - from.x;
  const dz = want.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len > clear + 1e-6) {
    // `clear` starts the ray outside a target's own capsule (radius 0.35), which a solid ray would hit at distance 0.
    const ux = dx / len;
    const uz = dz / len;
    const wall = p.raycast({ x: from.x + ux * clear, y: refY + chest, z: from.z + uz * clear }, { x: ux, y: 0, z: uz }, len - clear);
    if (wall) return null;
  }
  const down = p.raycast({ x: want.x, y: refY + ASH_DRIFT.groundProbeUp, z: want.z }, { x: 0, y: -1, z: 0 }, ASH_DRIFT.groundProbeUp + ASH_DRIFT.groundProbeDown);
  if (!down) return null;
  const y = down.point.y;
  if (Math.abs(y - refY) > ASH_DRIFT.groundTolerance) return null;
  return { x: want.x, y, z: want.z };
}

/**
 * The Ashblade's Surge forms (design 9.7). Warm: Ash-drift, 2 s invulnerable, teleport behind the nearest hostile and strike it
 * (no hostile: a 6 m drift). Blaze: the drift strikes two targets. Cinder: the shared 10 m Cinderburst. The hop happens only
 * to a target in the player's own space and height band, onto a landing with no wall in the way; with no safe landing the
 * player keeps the invulnerability without the hop. A form never throws: the shared Surge handler would skip heal and Burn.
 */
export function createAshbladeForms(p: DriftPorts): Record<'warm' | 'blaze' | 'cinder', SurgeFormImpl> {
  const strike = (c: SurgeFormContext, targetId: string, at: V3, from: V3): void => {
    const dx = at.x - from.x;
    const dz = at.z - from.z;
    const l = Math.hypot(dx, dz);
    const dir = l < 1e-6 ? new THREE.Vector3(-Math.sin(c.facingYaw), 0, -Math.cos(c.facingYaw)) : new THREE.Vector3(dx / l, 0, dz / l);
    c.damage.apply({
      attackerId: c.casterId,
      targetId,
      amount: ASH_DRIFT.damage,
      poise: c.poise,
      kind: 'spell',
      attackId: SURGE.spellId,
      point: new THREE.Vector3(at.x, at.y, at.z),
      direction: dir,
    });
  };

  /** Living hostiles the drift may jump to, nearest first, front half before back half. */
  const candidates = (c: SurgeFormContext, centre: V3, exclude: ReadonlySet<string>, rankFront = true) => {
    const inSpace = p.currentInterior();
    const f = fwd(c.facingYaw);
    const hits = actorsInRadius(c.host.actors, centre, c.radius, { team: 'hostile', alive: true }).filter(
      (h) => !exclude.has(h.actor.id) && Math.abs(h.position.y - c.feet.y) <= ASH_DRIFT.maxDy && p.interiorAt(h.position) === inSpace,
    );
    const front = (h: { position: V3; distance: number }) =>
      h.distance < 1e-6 || ((h.position.x - c.feet.x) * f.x + (h.position.z - c.feet.z) * f.z) / Math.max(h.distance, 1e-6) > 0;
    return hits.sort((a, b) => (rankFront ? Number(!front(a)) - Number(!front(b)) : 0) || a.distance - b.distance);
  };

  /** Picks a landing next to a target: behind it, else on the player's side of it. */
  const landNear = (from: V3, h: { actor: { root: THREE.Object3D | null }; position: V3 }): V3 | null => {
    const toTarget = { x: h.position.x - from.x, z: h.position.z - from.z };
    const tl = Math.hypot(toTarget.x, toTarget.z) || 1;
    const away = { x: toTarget.x / tl, z: toTarget.z / tl };
    const face = facingOf(h.actor.root);
    const behind = face ? { x: h.position.x - face.x * ASH_DRIFT.behind, z: h.position.z - face.z * ASH_DRIFT.behind } : { x: h.position.x + away.x * ASH_DRIFT.behind, z: h.position.z + away.z * ASH_DRIFT.behind };
    const near = { x: h.position.x - away.x * ASH_DRIFT.behind, z: h.position.z - away.z * ASH_DRIFT.behind };
    const targetFeet = { x: h.position.x, y: h.position.y, z: h.position.z };
    return landing(p, targetFeet, behind, h.position.y, ASH_DRIFT.clearOfTarget) ?? landing(p, targetFeet, near, h.position.y, ASH_DRIFT.clearOfTarget);
  };

  const hop = (to: V3, lookAt: V3): void => {
    p.teleport(to, Math.atan2(-(lookAt.x - to.x), -(lookAt.z - to.z)));
    p.arrive();
  };

  const drift = (targets: number): SurgeFormImpl => (c) => {
    let release: (() => void) | null = null;
    try {
      release = p.invulnerable(ASH_DRIFT.seconds);
      if (!release) p.warn('ashblade: combatVerbs.addInvulnerability is absent, the Ash-drift is not invulnerable');
      const hit = new Set<string>();
      let origin: V3 = c.feet;
      for (let i = 0; i < targets; i++) {
        let done = false;
        for (const cand of candidates(c, origin, hit, i === 0)) {
          hit.add(cand.actor.id);
          // No safe landing next to this one: the drift gives the invulnerability without the hop or the strike; try the next.
          const to = landNear(origin, cand);
          if (!to) continue;
          hop(to, cand.position);
          origin = to;
          strike(c, cand.actor.id, cand.position, origin);
          done = true;
          break;
        }
        if (!done) break;
      }
      if (hit.size === 0 && candidates(c, c.feet, hit).length === 0) {
        const f = fwd(c.facingYaw);
        let want = { x: c.feet.x + f.x * ASH_DRIFT.freeDistance, z: c.feet.z + f.z * ASH_DRIFT.freeDistance };
        const wall = p.raycast({ x: c.feet.x, y: c.feet.y + ASH_DRIFT.chestHeight, z: c.feet.z }, { x: f.x, y: 0, z: f.z }, ASH_DRIFT.freeDistance);
        if (wall) {
          const d = Math.max(0, wall.distance - 0.6);
          want = { x: c.feet.x + f.x * d, z: c.feet.z + f.z * d };
        }
        if (Math.hypot(want.x - c.feet.x, want.z - c.feet.z) > 0.5) {
          const to = landing(p, c.feet, want, c.feet.y);
          if (to) {
            p.teleport(to, c.facingYaw);
            p.arrive();
          }
        }
      }
    } catch (err) {
      release?.();
      p.warn(`ashblade: the Ash-drift failed (${err instanceof Error ? err.message : String(err)})`);
    }
  };

  const cinder: SurgeFormImpl = (c) => {
    try {
      for (const hit of actorsInRadius(c.host.actors, c.feet, c.radius, { team: 'hostile', alive: true })) {
        strike(c, hit.actor.id, hit.position, c.feet);
      }
    } catch (err) {
      p.warn(`ashblade: the Cinderburst failed (${err instanceof Error ? err.message : String(err)})`);
    }
  };

  return { warm: drift(1), blaze: drift(2), cinder };
}
