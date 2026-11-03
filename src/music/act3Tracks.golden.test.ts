import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { PEAT_AND_PITCH, WING_OVER_RIME, type TrackDef } from './tracks';

// Act 3 tracks (K14) pinned the same way as stemSynth.golden.test.ts: SHA-256 of the exact Float32 bytes of every stem
// at 8 kHz, all 15 (seven for Peat and Pitch, eight for Wing over Rime including the trial chant). A later voice tweak
// must replace these hashes deliberately; a refactor must leave every sample alone.
const SR = 8000;
const GOLDEN: Array<[TrackDef, Record<string, string>]> = [
  [
    PEAT_AND_PITCH,
    {
      kick: '08385d3d2025a880d852feb070a4db4a5383328bdbcd9d91f1d25d63fbd4342e',
      snare: '4d81a217e841935bea7b464c69f4d010b7ea106f2e97109b84249769c7ddecaa',
      hat: 'c19baf788187cbe67f4258adbb1152bb55b9519cb52a6c5b437343aceb2aaa3b',
      bass: '58f80b9e8fd660074b2c95531af99a7180533bb74d81aa94b146ccadea074f39',
      vocal: '33aa46c2b135f4561067f746cf72664290194b2d68a5c91aaa0f047a3e02526f',
      melody: '8a2fad5d7eb05fd5e4e2663b96e003ef0bd98c4baaf7142c5d9bc8403c285be6',
      boss: '8594e9fac7ff71920b9279c4b642167ae5c397fb6c0e41f4c855e508a5165cc6',
    },
  ],
  [
    WING_OVER_RIME,
    {
      kick: '6d02f281a28440bffab59ab753b23fe8d0f40fe620d926ebad72354c031e430a',
      snare: 'c35533de0743f3af18527e8295b8f5a29fe98ace48aa702700e53f21399dd20a',
      hat: 'a88643491e42b2c11358e0bb406bd053c3b3ffd6b77696fe0e9009f295c324a0',
      bass: '95f1179a714682241daafb96818982634b6c5ddefb67368d684ee057eff85dfb',
      vocal: '4f317cc8a55cad5f9618dd865f12734701a131631c06417ea085e5c07d2c1060',
      melody: '2445ace47cbeb606d19d0c8bd2c825f2ebf2677701015b7a4ae951e21ff8f4c6',
      boss: '25e1793bc84cef2558bec8c0d0eebdb201fde83cf0c10c737f8005d9d95c3e8c',
      chant: '73e724cd64c2f63fe555c89792058ed8e84b0dbb6d99fbfdc98df36121fbedc1',
    },
  ],
]

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
