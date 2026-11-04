import * as THREE from 'three';
import { actorsInRadius } from '../../spells/areas';
import type { SurgeFormContext, SurgeFormImpl } from '../../spells/SurgeAndRally';
import type { BurnZone } from '../../spells/Burn';
import { SURGE } from '../../vfx/tuning';
import type { EmberwrightRuntime } from './runtime';
import { SURGE_FORM, spellDamage } from './tuning';

interface SpellsPort {
  maxEmber: number;
  restoreEmber(n: number): number;
}

/**
 * The Emberwright's Heartshard Surge (design 9.3 and 9.7): everything hostile in the zone's radius takes the Surge's damage
 * and poise, and 40% of the Ember pool comes back. Blaze (8 m) leaves burning ground; Cinder (10 m, the shared poise break)
 * is the plain burst. The shared handler draws the ring at the zone radius, heals and adds the Burn and the Scar, so this
 * form changes none of that and never touches Burn. There is no ignite on the plain burst (not in the design).
 */
export function emberwrightSurgeForm(zone: BurnZone, runtime: EmberwrightRuntime): SurgeFormImpl {
  return (c: SurgeFormContext) => {
    for (const hit of actorsInRadius(c.host.actors, c.feet, c.radius, { team: 'hostile', alive: true })) {
      const dx = hit.position.x - c.feet.x, dz = hit.position.z - c.feet.z;
      const len = Math.hypot(dx, dz);
      const dir = len < 1e-6 ? new THREE.Vector3(-Math.sin(c.facingYaw), 0, -Math.cos(c.facingYaw)) : new THREE.Vector3(dx / len, 0, dz / len);
      c.damage.apply({
        attackerId: c.casterId, targetId: hit.actor.id, amount: spellDamage(SURGE.damage), poise: c.poise, kind: 'spell',
        attackId: SURGE.spellId, point: new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z), direction: dir,
      });
    }
    const spells = c.services.get('spells') as SpellsPort | undefined;
    if (spells) spells.restoreEmber(spells.maxEmber * SURGE_FORM.emberRefill);
    if (zone === 'blaze') runtime.addGround(c.feet.x, c.feet.y, c.feet.z);
  };
}
