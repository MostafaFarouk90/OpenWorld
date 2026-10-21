import type { DamageBus } from '../../combat/DamageBus';
import type { EnemyBody } from '../body';
import type { EnemyDef } from '../types';
import { GolemBody } from './GolemBody';
import { GOLEM } from './params';

/**
 * The body factory for `EnemyDef.body === 'golem'`: the procedural golem with tint and emissive taken from the
 * def's model recipe. Throws for a def that asks for another body.
 */
export function makeGolemBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void } = {}): EnemyBody {
  if (def.body !== 'golem') throw new Error(`makeGolemBody: ${def.kind} is not a golem def`);
  return new GolemBody({ tint: def.model.tint, emissive: def.model.emissive ?? GOLEM.emissive }, opts);
}
