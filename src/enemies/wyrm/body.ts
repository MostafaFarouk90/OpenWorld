import type { DamageBus } from '../../combat/DamageBus';
import type { EnemyBody } from '../body';
import type { EnemyDef } from '../types';
import type { WyrmParams } from './builder/params';
import { EMBER_WYRM, WYRMLING } from './tuning';
import { WyrmBody } from './WyrmBody';

/** Builder params per wyrm kind (the Ember Wyrm is the default build). */
export function wyrmParamsFor(def: EnemyDef): Partial<WyrmParams> {
  if (def.kind === 'wyrmling') return { scale: WYRMLING.scale, segments: WYRMLING.segments, palette: 'wyrmling', legs: 'small', spikes: false };
  return { palette: 'ember' };
}

/** The `EnemyBody` for a `body: 'wyrm'` def (EnemyManager.makeBody). */
export function makeWyrmBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void; lowQuality?: boolean } = {}): EnemyBody {
  if (def.body !== 'wyrm') throw new Error(`makeWyrmBody: ${def.kind} is not a wyrm def`);
  const jets = def.kind === 'wyrmling' ? { Puff: WYRMLING.puffJet } : { Spit: EMBER_WYRM.spitJet, Puff: WYRMLING.puffJet };
  return new WyrmBody(wyrmParamsFor(def), { bus: opts.bus, warn: opts.warn, jets, lowQuality: opts.lowQuality });
}
