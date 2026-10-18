import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { BARLEY_AND_BRAZIER } from './tracks';

// Golden hashes of the exact Float32 bytes of Barley and Brazier's procedural stems at 8 kHz. The
// stems are data-driven since slice 2 phase B; this test proves moving the pattern and voicing into
// `TrackDef.synth` did not change a single sample. Never regenerate these in a refactor commit.
const SR = 8000;
const GOLDEN: Record<string, string> = {
  kick: '782c7a6f9501fec2ef7239c3ce675b009cc97ed3c812bf35bf586b3c1164088c',
  snare: 'ebafc87df4d60eb271766ca675e695ac8e9d96f106bea5628c6ae0c0095df9ec',
  hat: '62079a191fe893594ae1225595fa384663d521dd891eee64f6e8ed68e1f7dfaf',
  bass: '01a7f2056b4161e2fddbf3554cf70783cceff05669497c1b5417c67fd8d4edf3',
  vocal: '08312cf197e52bebb371f2752056bbd237a161f8326358fb60450fdd2d49b44f',
  melody: '7937f11b25eab0dec9681122d414c3c89f3015ee37401fe9a27701644b923d7f',
  boss: 'b8e1371769897462ba4f285d17af277ca7ff7b064c51a981af392a0b596d81f1',
};

const sha256 = (data: Float32Array): string =>
  createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');

describe('Barley and Brazier stems are byte-stable', () => {
  it.each(Object.keys(GOLDEN))('%s', (stem) => {
    expect(sha256(synthStem(BARLEY_AND_BRAZIER, stem, SR))).toBe(GOLDEN[stem]);
  });
});
