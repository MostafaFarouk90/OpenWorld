// M46's three cairn holds on the shipped wave director (one set a cairn: a completed set never starts again). Each is one wave
// of four husk wraiths up the road, two lanes, onto a barricade line at the cairn's clearing (L1's anchor; the barricade is the
// cairn itself and nothing rams it, so the only failure is Cael's death, and the wave restarts). The wave director has no skin
// field, so the wraiths wear the base look (as L10's M39 Footmen).
import type { WaveSetDef } from '../../../../waves/types';
import type { EnemyKind } from '../../../../enemies/types';
import { W } from './ids';
import { M46_CAIRNS, M46_WAVE } from './m46.quest';

const WRAITH: EnemyKind = 'ash-wraith';

export const m46WaveSet = (n: number): WaveSetDef => ({
  id: M46_WAVE(n),
  barricadeId: `${M46_WAVE(n)}.cairn`,
  barricadeHealth: 600,
  barricadeAnchors: [`${W}.m46.wave.${n}.barricade`],
  lanes: { '1': `${W}.m46.wave.${n}.lane.1`, '2': `${W}.m46.wave.${n}.lane.2` },
  waves: [{
    spawns: [
      { lane: '1', kind: WRAITH, count: 2, delay: 0, stagger: 2 },
      { lane: '2', kind: WRAITH, count: 2, delay: 3, stagger: 2 },
    ],
    carts: [],
  }],
  defenders: [],
  band: 'ashen-waste',
  spawnTag: M46_WAVE(n),
  radius: 60,
});

export const M46_WAVE_SETS: readonly WaveSetDef[] = M46_CAIRNS.map(m46WaveSet);
