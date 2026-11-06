import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { DUST_CHANT, SEVEN_GATES_ASH, type TrackDef } from './tracks';

// Act 4 tracks (L8) pinned like the Act 3 ones: SHA-256 of the exact Float32 bytes of every stem at 8 kHz (eight for
// Dust Chant including Eormen's `toll`, seven for the Seven Gates ash variant). A voice tweak replaces these on purpose.
const SR = 8000;
const GOLDEN: Array<[TrackDef, Record<string, string>]> = [
  [
    DUST_CHANT,
    {
      kick: 'a9753beff2e345c5ad5dce05d30bcc755ec62e70392ea454f47108c310f15665',
      snare: '06363366d8019677890802824fe0910feddd81362effdf750c3f538d77e8e38e',
      hat: 'ea4e0c02766aabfc26b03529a4455934a221281d26836cadf93a1728c0a5c0e2',
      bass: '0eb1ee85f65ef47d65e5a5f9dc2a95d3a72879a02aeb3fde7f031fe130644c8d',
      vocal: '6ea2978ad756c1cc9b91d7695e5f072d4d49dc8df30f8785cd6dc6f625f6b317',
      melody: 'c51e0614d28c038d17b4f5721e6955a057f3746da739493a85d9fc82ab34aa20',
      boss: 'fc8409c65bffff90e432e8ecc47eb651ce847a665c8009b604d67b51883a1f53',
      toll: '1b2f46d09905ab794f1f823d5237ab5f9dcfdfa093ffbbd7d8e3866cb68703fb',
    },
  ],
  [
    SEVEN_GATES_ASH,
    {
      kick: 'a30f9f1aa7c488bd18ab0a2d920bbfafa86d9827152b9cf1ae01ff36a6dd8873',
      snare: '4c985c588d4b81bbee24cf0e4807f5a9328b12f603553e72d6a02e160ea79619',
      hat: '4a2061080e8581825f3c0093f77f4b2dd99b562f2a1c2af758a7435679fd0445',
      bass: 'd7e55622566d3a9b02b9fccdc70ee8414fe93763473b280c066c7982726867eb',
      vocal: '1c0487fffe89f7029fd2f802c774068bd3d5ac80b735e7dc05738224dd67d227',
      melody: 'ecd4d394869dd401f825022ef032365f2be622873e29adef031513d29dc6f3fd',
      boss: 'b7a64ec495f9c67c12201db2a16eeb073d73b1bd2a24286b2885b2e1c37375b1',
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
  it('pins every stem the track has', () => {
    expect(Object.keys(hashes)).toEqual([...track.stems]);
  });
  it.each(Object.keys(hashes))('%s', async (stem) => {
    expect(await sha256(synthStem(track, stem, SR))).toBe(hashes[stem]);
  });
});
