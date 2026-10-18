import * as THREE from 'three';
import type { Actor } from '../../actors/Actor';
import type { DamageModifier, DamageResult } from '../../actors/DamageResolver';
import type { StatusService } from '../../actors/status';
import { AGGROED_STATES, BACK_SLIT, BLEEDING_EMBER, SPARK_DODGE } from './tuning';

/** Modifier order inside the attacker band (-200..-101): after weapon damage, before the defender's verbs. */
export const BACK_SLIT_ORDER = -150;

const FORWARD = new THREE.Vector3();
const QUAT = new THREE.Quaternion();

/**
 * Back-Slit: a player melee hit from the target's rear 120 degrees deals double damage. The target's forward is its root's
 * -Z (an enemy root faces along -Z), compared with the request's `direction` (attacker root to target root, unit,
 * horizontal). Only `amount` changes, never the poise. Actors without a root, requests without a direction, status and
 * spell damage are left alone.
 */
export function backSlitModifier(ports: { playerId(): string; active(): boolean; triggered?(): void }): DamageModifier {
  return (req, target: Actor) => {
    if (req.kind !== 'melee' || req.attackerId !== ports.playerId() || !ports.active()) return;
    const root = target.root;
    const dir = req.direction;
    if (!root || !dir) return;
    root.getWorldQuaternion(QUAT);
    FORWARD.set(0, 0, -1).applyQuaternion(QUAT);
    FORWARD.y = 0;
    const len = FORWARD.length();
    const dlen = Math.hypot(dir.x, dir.z);
    if (len < 1e-6 || dlen < 1e-6) return;
    const dot = (FORWARD.x * dir.x + FORWARD.z * dir.z) / (len * dlen);
    if (dot >= BACK_SLIT.minDot) {
      req.amount *= BACK_SLIT.multiplier;
      ports.triggered?.();
    }
  };
}

export interface StatusPort {
  /** Looked up at hit time: `status` is PR #45's service and is absent on main. */
  status(): Pick<StatusService, 'apply'> | undefined;
  warn(message: string): void;
}

function makeStatusApplier(p: StatusPort): Pick<StatusService, 'apply'> {
  let warned = false;
  return {
    apply(actorId, spec) {
      const svc = p.status();
      if (!svc) {
        if (!warned) {
          warned = true;
          p.warn('ashblade: the status service is absent, ignite effects are skipped');
        }
        return false;
      }
      return svc.apply(actorId, spec);
    },
  };
}

/**
 * Bleeding Ember: a player melee hit that lands (`outcome` 'hit', health dealt) ignites the target. The status id is fixed,
 * so a repeat hit refreshes the time and never stacks. Status ticks (`kind: 'status'`) and blocked or immune hits do not.
 */
export function bleedingEmberHandler(ports: StatusPort & { playerId(): string; active(): boolean; triggered?(): void }): (r: DamageResult) => void {
  const status = makeStatusApplier(ports);
  return (r) => {
    if (r.kind !== 'melee' || r.attackerId !== ports.playerId() || r.outcome !== 'hit' || !(r.dealt > 0) || r.killed) return;
    if (!ports.active()) return;
    const ok = status.apply(r.targetId, {
      id: BLEEDING_EMBER.statusId,
      kind: 'ignite',
      dps: BLEEDING_EMBER.dps,
      seconds: BLEEDING_EMBER.seconds,
      sourceId: ports.playerId(),
    });
    if (ok) ports.triggered?.();
  };
}

export interface SparkDodgePorts extends StatusPort {
  playerId(): string;
  active(): boolean;
  /** Fixed ticks since the start of the game. */
  tick(): number;
  feet(): { x: number; y: number; z: number };
  /** Live hostile actors within `radius` metres (XZ) of the point, with the AI state of each when it has one. */
  hostilesNear(point: { x: number; z: number }, radius: number): { id: string; state: string | undefined }[];
  spark(at: { x: number; y: number; z: number }): void;
  triggered?(): void;
}

/**
 * Spark Dodge: a dodge that avoids a hit (`player.dodged`) throws fire sparks at the feet: hostiles within 2.5 m that are
 * already on the player (noticing or fighting) catch `ignite` under their own status id. One burst per 1.5 s.
 */
export function sparkDodgeHandler(ports: SparkDodgePorts): (attackerId?: string) => void {
  const status = makeStatusApplier(ports);
  let readyAt = -Infinity;
  return (attackerId) => {
    if (!ports.active()) return;
    const now = ports.tick();
    if (now < readyAt) return;
    readyAt = now + Math.round(SPARK_DODGE.cooldownSeconds * 60);
    const feet = ports.feet();
    ports.spark(feet);
    ports.triggered?.();
    for (const h of ports.hostilesNear(feet, SPARK_DODGE.radius)) {
      // The attacker whose swing was dodged is on the player by definition, even a boss or foe with no enemy view.
      if (h.id !== attackerId && (h.state === undefined || !AGGROED_STATES.has(h.state))) continue;
      status.apply(h.id, {
        id: SPARK_DODGE.statusId,
        kind: 'ignite',
        dps: SPARK_DODGE.dps,
        seconds: SPARK_DODGE.seconds,
        sourceId: ports.playerId(),
      });
    }
  };
}
