import * as THREE from 'three';
import { actorsInRadius } from '../../spells/areas';
import type { BurnZone } from '../../spells/Burn';
import type { SurgeFormContext, SurgeFormImpl } from '../../spells/SurgeAndRally';
import { SURGE } from '../../vfx/tuning';
import type { Vec3 } from '../../vfx/ports';
import { FISSURE } from './tuning';

/** The Surge form context as thread 2's #45 extends it; the extra members are optional so older cores still work. */
type Ctx = SurgeFormContext & { suppressRing?: () => void };

export interface WardenSurgePorts {
  /** Sets the axe alight for 8 s. */
  igniteAxe(): void;
  /** Optional visuals: the crack racing along the ground, as points from the player outwards. */
  fissureFx?(points: Vec3[], forward: { x: number; z: number }): void;
}

const hit = (c: SurgeFormContext, id: string, at: Vec3, dir: { x: number; z: number }): void => {
  c.damage.apply({
    attackerId: c.casterId,
    targetId: id,
    amount: SURGE.damage,
    poise: c.poise,
    kind: 'spell',
    attackId: SURGE.spellId,
    point: new THREE.Vector3(at.x, at.y, at.z),
    direction: new THREE.Vector3(dir.x, 0, dir.z),
  });
};

function away(from: Vec3, to: Vec3, fallback: { x: number; z: number }): { x: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  return len < 1e-6 ? fallback : { x: dx / len, z: dz / len };
}

/** Everything inside the zone's radius: the stomp (Warm) and, at poise 999, the Cinderburst. */
function ring(c: SurgeFormContext): void {
  const fwd = { x: -Math.sin(c.facingYaw), z: -Math.cos(c.facingYaw) };
  for (const h of actorsInRadius(c.host.actors, c.feet, c.radius, { team: 'hostile', alive: true })) {
    hit(c, h.actor.id, h.position, away(c.feet, h.position, fwd));
  }
}

/** The Blaze fissure: a line `FISSURE.length` long and `FISSURE.width` wide in front of the player. */
export function inFissure(feet: Vec3, yaw: number, p: Vec3): boolean {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const dx = p.x - feet.x;
  const dz = p.z - feet.z;
  const along = dx * fx + dz * fz;
  const across = dx * fz - dz * fx;
  return along >= 0 && along <= FISSURE.length && Math.abs(across) <= FISSURE.width / 2;
}

/**
 * Warm: the stomp ring and a burning axe (design 9.2). Blaze: the stomp becomes a fissure line, also with the axe alight (9.7).
 * Cinder: the shared 10 m Cinderburst, poise broken; the design gives it no ignite.
 */
export function wardenSurgeForm(zone: BurnZone, ports: WardenSurgePorts): SurgeFormImpl {
  return (raw) => {
    const c = raw as Ctx;
    if (zone === 'cinder') return ring(c);
    ports.igniteAxe();
    if (zone === 'warm') return ring(c);
    // Blaze: the shared ring would be drawn over the line, so ask for it to be left out (when the core supports it).
    c.suppressRing?.();
    const fwd = { x: -Math.sin(c.facingYaw), z: -Math.cos(c.facingYaw) };
    for (const a of c.host.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.hittable) continue;
      const pos = a.worldPosition(new THREE.Vector3());
      if (inFissure(c.feet, c.facingYaw, pos)) hit(c, a.id, pos, fwd);
    }
    ports.fissureFx?.(
      Array.from({ length: 5 }, (_, i) => ({ x: c.feet.x + fwd.x * ((i + 1) * FISSURE.length) / 5, y: c.feet.y, z: c.feet.z + fwd.z * ((i + 1) * FISSURE.length) / 5 })),
      fwd,
    );
  };
}
