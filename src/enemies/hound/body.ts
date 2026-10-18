import type { DamageBus } from '../../combat/DamageBus';
import type { EnemyBody } from '../body';
import { HOUND as HOUND_PARAMS } from '../quadruped/params';
import { QuadrupedBody } from '../quadruped/QuadrupedBody';
import type { EnemyDef } from '../types';

/**
 * The body factory for `EnemyDef.body === 'quadruped'`: the procedural rig with the hound preset (tint and
 * emissive taken from the def's model recipe, so a variant def can recolour it). Throws for a def that asks
 * for another body.
 */
export function makeQuadrupedBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void } = {}): EnemyBody {
  if (def.body !== 'quadruped') throw new Error(`makeQuadrupedBody: ${def.kind} is not a quadruped def`);
  return new QuadrupedBody(
    { ...HOUND_PARAMS, tint: def.model.tint, emissive: def.model.emissive ?? HOUND_PARAMS.emissive },
    opts,
  );
}
