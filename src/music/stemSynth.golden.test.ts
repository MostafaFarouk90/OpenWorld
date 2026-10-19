import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { BARLEY_AND_BRAZIER, SEVEN_GATES_ONE_DRUM, type TrackDef } from './tracks';

// Golden hashes of the exact Float32 bytes of each track's procedural stems at 8 kHz.
//
// The music-quality change (new drum, bass, pad, lute and flute voices, accents, timing looseness
// and fills) replaced the hashes pinned during the slice 2 data refactor, in the one commit that
// says so. Do not regenerate these in a refactor commit: a refactor must leave every sample alone,
// and only a deliberate change of sound may replace them. The boss stems are untouched by that
// change, so Barley's boss hash is the one the refactor pinned.
const SR = 8000;
const GOLDEN: Array<[TrackDef, Record<string, string>]> = [
  [
    BARLEY_AND_BRAZIER,
    {
      kick: '74f5515cecb8b95464afdc608772252b9165a59131825c1444fc7fa0296f9688',
      snare: '3204d26362e7818ad9de5cc6e3e2b2f77819d8f7529543b183362a0514f03480',
      hat: 'c5dd5a3ab0c01c6f7f7c54cf0b11c2acf0a958b738e4e493846deb4423316bb9',
      bass: '49c0c045bae962da4a828e2b84764a0de8513edfaffe79729d82bb33af0502b4',
      vocal: '36578d050a1a48abb9c2d8c59b6670305da6b241ef3c9160476aefa44d1f380c',
      melody: '89296b10d7b9c1b9e3577a5805c1bf49d7f851604901a0fa15373c3f37ed63ef',
      boss: 'b8e1371769897462ba4f285d17af277ca7ff7b064c51a981af392a0b596d81f1',
    },
  ],
  [
    SEVEN_GATES_ONE_DRUM,
    {
      kick: '5a396104e8e3fddbe12ffc2735f6f38c1bb643efc1abec23882c6593cea5070d',
      snare: 'fceebca074acc77ed081876e465db40e110e1b2f5c4a355478e75a432c30052f',
      hat: 'f01a21994afeb75293a64151a9bf4335808a8ab50513da2ba012aa8225d13a60',
      bass: '9c91b5661a01d186f5d0811e70defa8bb641b716f881f62723ee4b161b083111',
      vocal: 'ad5702a80f0a77bd00182d0805f823e583360dd67e3af35f988b8a1ae415e3fc',
      melody: '27de03a981351a93e2b913d812746e17af45fef44f009baeb0a42451e5ad6d2e',
      boss: 'f5094090230575e8339393906ecf041a8643d9f17a1442f3c964d96ed36854c2',
    },
  ],
];

async function sha256(data: Float32Array): Promise<string> {
  const bytes = new Uint8Array(new ArrayBuffer(data.byteLength));
  bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe.each(GOLDEN.map(([track, hashes]) => ({ track, hashes })))('$track.id stems are byte-stable', ({ track, hashes }) => {
  it.each(Object.keys(hashes))('%s', async (stem) => {
    expect(await sha256(synthStem(track, stem, SR))).toBe(hashes[stem]);
  });
});
