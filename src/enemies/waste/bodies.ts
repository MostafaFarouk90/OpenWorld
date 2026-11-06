import type { DamageBus } from '../../combat/DamageBus';
import type { EnemyBody } from '../body';
import type { EnemyDef } from '../types';
import { SwarmBody } from './gnats/SwarmBody';
import { StriderBody } from './strider/StriderBody';

export interface WasteBodyOptions {
  bus?: DamageBus;
  warn?: (m: string) => void;
  /** Ground height for the strider's feet. */
  groundAt?: (x: number, z: number) => number;
  lowQuality?: boolean;
}

/**
 * The body factories for `EnemyDef.body === 'strider'` and `'swarm'` (Act 4 L5): the procedural Waste Strider (hull colour
 * from the def's recipe) and the Cinder Gnat cloud. Throw for a def that asks for another body.
 */
export function makeStriderBody(def: EnemyDef, opts: WasteBodyOptions = {}): EnemyBody {
  if (def.body !== 'strider') throw new Error(`makeStriderBody: ${def.kind} is not a strider def`);
  return new StriderBody({ bus: opts.bus, warn: opts.warn, groundAt: opts.groundAt, tint: def.model.tint, emissive: def.model.emissive });
}

export function makeSwarmBody(def: EnemyDef, opts: WasteBodyOptions = {}): EnemyBody {
  if (def.body !== 'swarm') throw new Error(`makeSwarmBody: ${def.kind} is not a swarm def`);
  return new SwarmBody({ bus: opts.bus, warn: opts.warn, tint: def.model.tint, lowQuality: opts.lowQuality });
}
