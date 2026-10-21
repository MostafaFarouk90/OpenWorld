import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { ASH_ON_THE_PASTURE, BARLEY_AND_BRAZIER, HAMMERS_BELOW, SEVEN_GATES_ONE_DRUM, type TrackDef } from './tracks';

// Act 2 tracks (A14) are pinned the same way; a later voice tweak must replace their hashes deliberately.
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
  [
    ASH_ON_THE_PASTURE,
    {
      kick: '9a4ee6a6ea640e441aa0b37973b6fd4dae9f6cb10b90fc81731405e53a85ac1c',
      snare: '664842fea77140efa5a1788c2f2754c8b041866382b68a02820f43db4f3794f6',
      hat: '015dede1a55c75412f77af9ad072d649f2f640758748adfb6bd2cb3f4847b754',
      bass: 'f5bdc7fe8872f5b118614ee27bf1dfa5e7fcd968e4e37aaa885074282ff59d83',
      vocal: 'a28b4783999129d0b5286c5c16825c1aae658e4d54c4daabe0e787fd99461153',
      melody: '1e26fd022775e6d742abb79637280ff70eb5c8977edcedc08cb26751b91f825f',
      boss: 'b6233810d8a14104986dd4989d1f0f2a6dc39a6cbd35af074c4e5d5e9aee7bd7',
    },
  ],
  [
    HAMMERS_BELOW,
    {
      kick: '5a202a2e9fbd677f4f9f6a8154b49824d5ac1b026efe7d1721edd9b0d957136d',
      snare: '58cdcf2489e154a6d4954239381d5d29d0e4b3386ea3a66a08e6292bfffa2117',
      hat: 'd8d3907fb395b28b24b892ab0d35c4dc74648be5020d61316d9aa29eada3eb21',
      bass: '9bcc15c817f02ee2b130734b8e718c64f4056123bda1c0586615a157ac159e7f',
      vocal: 'c92b6bbe6d9b4b189635353c120827413c8c93e5bd6451d7b1ce1df4e8afa28b',
      melody: '992111c5b1bd8299cf361618635b0da21749e639256cf46b5ea39acf38ea6eaf',
      boss: 'e5530d4cf951e79a6589fee3db1763eec6a366c6dc9ef0bea6351effbdcaf08f',
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
