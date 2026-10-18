import * as THREE from 'three';
import { ProjectileSystem, type ProjectileHit } from '../../spells/Projectile';
import type { SurgeFormContext, SurgeFormImpl } from '../../spells/SurgeAndRally';
import { actorsInRadius } from '../../spells/areas';
import type { Vec3 } from '../../vfx/ports';
import { SURGE } from '../../vfx/tuning';
import { PF } from './tuning';

export interface SurgeFormPorts {
  projectiles: ProjectileSystem;
  muzzle(out: THREE.Vector3): THREE.Vector3;
  aim(from: Vec3): Vec3;
  tracer(from: Vec3, to: Vec3): void;
  burst(at: Vec3, radius: number): void;
  isDisposed(): boolean;
}

/**
 * The Pathfinder's Heartshard Surge (design 9.7): the flaming quarrel. It flies on the projectile system, so the blast
 * comes where it lands (a wall, the ground, the end of its range or an enemy). Warm bursts in the zone radius; Blaze also
 * passes through two enemies and chains arcs onward; Cinder keeps the 10 m burst and the poise break of the shared numbers.
 * It spends no bolt (a deviation from "charges one bolt": the Surge must work with an empty quiver).
 */
export function createPathfinderSurge(ports: SurgeFormPorts): SurgeFormImpl {
  return (c: SurgeFormContext) => {
    const from = ports.muzzle(new THREE.Vector3());
    const origin = { x: from.x, y: from.y, z: from.z };
    const dir = ports.aim(origin);
    const hit = new Set<string>();
    const strike = (id: string, at: Vec3, scale: number): void => {
      hit.add(id);
      const away = new THREE.Vector3(at.x - c.feet.x, 0, at.z - c.feet.z);
      if (away.lengthSq() < 1e-6) away.set(-Math.sin(c.facingYaw), 0, -Math.cos(c.facingYaw));
      c.damage.apply({
        attackerId: c.casterId,
        targetId: id,
        amount: SURGE.damage * scale,
        poise: c.poise,
        kind: 'spell',
        attackId: SURGE.spellId,
        point: new THREE.Vector3(at.x, at.y, at.z),
        direction: away.normalize(),
      });
    };
    ports.projectiles.launch({
      casterId: c.casterId,
      origin,
      direction: dir,
      speed: PF.surge.speed,
      lifetime: PF.surge.range / PF.surge.speed,
      radius: PF.surge.radius,
      pierce: c.zone === 'blaze' ? PF.surge.pierce : 0,
      onPass: (h) => strike(h.actorId, h.point, 1),
      onHit: (r: ProjectileHit) => {
        if (ports.isDisposed()) return;
        ports.tracer(origin, r.point);
        if (r.kind === 'actor') strike(r.actorId, r.point, 1);
        ports.burst(r.point, c.radius);
        for (const h of actorsInRadius(c.host.actors, r.point, c.radius, { team: 'hostile', alive: true })) {
          if (!hit.has(h.actor.id)) strike(h.actor.id, h.position, 1);
        }
        if (c.zone === 'blaze') chain(c, r.point, hit, strike, ports);
      },
    });
  };
}

/**
 * Blaze: up to three arcs at 70%. The first reaches `chainRadius` beyond the burst's edge (inside the burst everyone is hit
 * already); each next arc goes to the nearest unhit hostile within `chainRadius` of the last one.
 */
function chain(c: SurgeFormContext, start: Vec3, hit: Set<string>, strike: (id: string, at: Vec3, scale: number) => void, ports: SurgeFormPorts): void {
  let at = start;
  for (let arc = 0; arc < PF.surge.chainArcs; arc++) {
    const reach = PF.surge.chainRadius + (arc === 0 ? c.radius : 0);
    const next = actorsInRadius(c.host.actors, at, reach, { team: 'hostile', alive: true }).find((h) => !hit.has(h.actor.id));
    if (!next) return;
    ports.tracer(at, next.position);
    strike(next.actor.id, next.position, PF.surge.chainScale);
    at = next.position;
  }
}
