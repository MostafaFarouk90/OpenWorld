// The pass road's anchors for M16 (A13): the hound ambush and the three search points, placed by arc length from Deepgate's end of
// A1's `oldsmoke-pass` polyline.
import { roadLength, roadPoint } from '../terrain/shape/roadPoint';
import type { LayoutData } from '../region/layoutTypes';
import { numbered } from './helpers';

const PASS_LENGTH = roadLength('oldsmoke-pass');
const fromEnd = (m: number, side = 0) => {
  const p = roadPoint('oldsmoke-pass', PASS_LENGTH - m, side);
  return [p.x, p.z] as const;
};

export function passLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  return {
    anchors: [
      ...numbered('oldsmoke.pass.ambush', [fromEnd(1500, -8), fromEnd(1500, 8), fromEnd(1460, -4), fromEnd(1460, 4)], ['spawn'], 0),
      ...numbered('oldsmoke.pass.search', [fromEnd(2000, 5), fromEnd(2700, -5), fromEnd(3400, 5)], ['objective'], 0),
    ],
    triggers: [],
    structures: [],
  };
}
