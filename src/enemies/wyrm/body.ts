import type { DamageBus } from '../../combat/DamageBus';
import type { EnemyBody } from '../body';
import type { EnemyDef } from '../types';
import type { WyrmParams } from './builder/params';
import { SKARL_DRAKE } from './drake/def';
import { YSMERYTH } from './ysmeryth/def';
import { YSMERYTH_PARAMS } from './ysmeryth/scene';
import { EMBER_WYRM, WYRMLING } from './tuning';
import { WyrmBody } from './WyrmBody';

/** Builder params per wyrm kind (the Ember Wyrm is the default build). */
export function wyrmParamsFor(def: EnemyDef): Partial<WyrmParams> {
  if (def.kind === 'wyrmling') return { scale: WYRMLING.scale, segments: WYRMLING.segments, palette: 'wyrmling', legs: 'small', spikes: false };
  if (def.kind === 'skarl-drake') return { scale: SKARL_DRAKE.scale, palette: 'ember', seed: 22, collar: true };
  if (def.kind === 'ysmeryth') return { ...YSMERYTH_PARAMS };
  return { palette: 'ember' };
}

/** The `EnemyBody` for a `body: 'wyrm'` def (EnemyManager.makeBody). */
export function makeWyrmBody(def: EnemyDef, opts: { bus?: DamageBus; warn?: (m: string) => void; lowQuality?: boolean } = {}): EnemyBody {
  if (def.body !== 'wyrm') throw new Error(`makeWyrmBody: ${def.kind} is not a wyrm def`);
  const jets =
    def.kind === 'wyrmling'
      ? { Puff: WYRMLING.puffJet }
      : def.kind === 'ysmeryth'
        ? { Spit: YSMERYTH.breathJet, Puff: WYRMLING.puffJet }
        : { Spit: EMBER_WYRM.spitJet, Puff: WYRMLING.puffJet };
  return new WyrmBody(wyrmParamsFor(def), { bus: opts.bus, warn: opts.warn, jets, lowQuality: opts.lowQuality });
}
