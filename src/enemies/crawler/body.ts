import type { DamageBus } from '../../combat/DamageBus';
import type { EnemyBody } from '../body';
import type { EnemyDef } from '../types';
import { CrawlerBody } from './CrawlerBody';
import { CRAWLER } from './params';

/**
 * The body factory for `EnemyDef.body === 'crawler'`: the procedural Slag Crawler with the preset's proportions
 * (tint and emissive taken from the def's model recipe). Throws for a def that asks for another body.
 */
export function makeCrawlerBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void } = {}): EnemyBody {
  if (def.body !== 'crawler') throw new Error(`makeCrawlerBody: ${def.kind} is not a crawler def`);
  return new CrawlerBody(
    { ...CRAWLER, tint: def.model.tint, emissive: def.model.emissive ?? CRAWLER.emissive },
    opts,
  );
}
