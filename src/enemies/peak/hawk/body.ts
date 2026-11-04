import type { DamageBus } from '../../../combat/DamageBus';
import type { EnemyBody } from '../../body';
import type { EnemyDef } from '../../types';
import { HawkBody } from './HawkBody';
import { HAWK } from './params';

/**
 * The body factory for `EnemyDef.body === 'bird'`: the procedural Rime Hawk (plumage colour from the def's model
 * recipe). Throws for a def that asks for another body.
 */
export function makeHawkBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void } = {}): EnemyBody {
  if ((def.body as string) !== 'bird') throw new Error(`makeHawkBody: ${def.kind} is not a bird def`);
  return new HawkBody({ ...HAWK, tint: def.model.tint }, opts);
}
