import * as THREE from 'three';
import type { DamageBus } from '../combat/DamageBus';
import type { HitEvent } from '../combat/types';
import type { ActorRegistry } from './ActorRegistry';
import type { CombatRegistry } from './CombatRegistry';
import type { DamageResolver } from './DamageResolver';

const from = new THREE.Vector3();
const to = new THREE.Vector3();

/**
 * Turns the hit detection's per-bone HitEvents into damage requests (contracts/actors-and-damage.md
 * section 5). Hits whose attacker or target has no actor are ignored.
 */
export class DamageBridge {
  private readonly unsubscribe: () => void;

  constructor(
    bus: DamageBus,
    private readonly actors: ActorRegistry,
    private readonly damage: DamageResolver,
    private readonly combat: CombatRegistry,
  ) {
    this.unsubscribe = bus.subscribe((e) => this.onHit(e));
  }

  dispose(): void {
    this.unsubscribe();
  }

  private onHit(e: HitEvent): void {
    const attacker = this.actors.byOwner(e.attacker);
    const target = this.actors.byOwner(e.target);
    if (!attacker || !target) return;
    const attack = this.combat.attackOf(e.attacker);
    this.damage.apply({
      attackerId: attacker.id,
      targetId: target.id,
      amount: e.damage,
      poise: e.damage,
      kind: 'melee',
      bone: e.bone,
      point: e.point.clone(),
      normal: e.normal.clone(),
      attackId: attack?.attackId,
      swingId: attack?.swingId,
      direction: hitDirection(attacker.root, target.root, e.normal),
    });
  }
}

/** Horizontal unit vector from the attacker's root to the target's; the blade's motion when they coincide. */
export function hitDirection(
  attackerRoot: THREE.Object3D | null,
  targetRoot: THREE.Object3D | null,
  normal: THREE.Vector3,
): THREE.Vector3 {
  const dir = new THREE.Vector3();
  if (attackerRoot && targetRoot) {
    attackerRoot.getWorldPosition(from);
    targetRoot.getWorldPosition(to);
    dir.set(to.x - from.x, 0, to.z - from.z);
  }
  if (dir.lengthSq() < 1e-8) dir.set(-normal.x, 0, -normal.z); // the normal points against the blade
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
  return dir.normalize();
}
