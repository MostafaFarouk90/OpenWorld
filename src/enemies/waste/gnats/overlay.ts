import type * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import { GNATS } from '../tuning';

/** Class skills and items that strike all round, or a cone or circle: any of them scatters a swarm at once. */
export const GNAT_AREA_ATTACKS: ReadonlySet<string> = new Set([
  'knight.executionersArc',
  'warden.whirlingHew',
  'warden.skullsplitter',
  'warden.earthroot',
  'warden.voiceOfTheMountain',
  'ashblade.phoenixRoll',
  'ashblade.thousandSparks',
  'pathfinder.huntersWeb',
  'pathfinder.skyhawk',
  'pathfinder.cinderTrap',
  'emberwright.colossus',
  'emberwright.fireWall',
  'emberwright.cinderRain',
  'emberwright.sunfireNova',
  'emberwright.cinderRing',
  'emberwright.flameLash',
  'emberwright.anvilDrop',
  'emberwright.breath',
]);

export interface ScatterHit {
  outcome?: string;
  kind: string;
  attackId?: string;
  element?: string;
  statusKind?: string;
}

/**
 * A hit that scatters a Cinder Gnat swarm at once (coordinator ruling 2026-11-06: any fire or area effect): any spell, any
 * fire (a fire hit, a burning tick, a torch), a Pathfinder blast, or a class area skill from `GNAT_AREA_ATTACKS`. A plain
 * single-target blow only hurts it.
 */
export function scattersGnats(r: ScatterHit): boolean {
  if (r.outcome !== undefined && r.outcome !== 'hit') return false;
  if (r.kind === 'script') return false;
  if (r.element === 'fire') return true;
  if (r.kind === 'status') return r.statusKind === 'ignite';
  if (r.kind === 'spell') return true;
  const id = r.attackId ?? '';
  if (id.endsWith('.blast') || id.includes('torch')) return true;
  return GNAT_AREA_ATTACKS.has(id);
}

/**
 * The scatter rule as a damage modifier body (the waste plugin registers it): a scattering hit takes the swarm's whole health.
 */
export function gnatScatterRule(req: ScatterHit & { amount: number }, target: { health: number }): boolean {
  if (!scattersGnats(req) || !(target.health > 0)) return false;
  req.amount = Math.max(req.amount, target.health);
  return true;
}

/**
 * The `gnats` overlay (plans/act4-L5.md section 4): the cloud hovers `GNATS.hover` over its feet, so lock-on and aims point
 * at the cloud. The sting and the scatter are the body's and the plugin's.
 */
export function makeGnatsOverlay(_ctx: BehaviourContext): BehaviourOverlay {
  return {
    actorPosition(out: THREE.Vector3) {
      out.y += GNATS.hover;
    },
  };
}
