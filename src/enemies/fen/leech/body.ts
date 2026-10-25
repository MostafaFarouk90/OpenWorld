import type { DamageBus } from '../../../combat/DamageBus';
import type { EnemyBody } from '../../body';
import type { EnemyDef } from '../../types';
import { LeechBody } from './LeechBody';
import { LEECH } from './params';

/**
 * The body factory for `EnemyDef.body === 'leech'`: the procedural Fen Leech (back colour from the def's model
 * recipe). Throws for a def that asks for another body.
 */
export function makeLeechBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void } = {}): EnemyBody {
  if ((def.body as string) !== 'leech') throw new Error(`makeLeechBody: ${def.kind} is not a leech def`);
  return new LeechBody({ ...LEECH, tint: def.model.tint }, opts);
}
