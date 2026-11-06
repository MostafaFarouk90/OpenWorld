import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { PEAT_AND_PITCH, WING_OVER_RIME, type TrackDef } from './tracks';

// Act 3 tracks (K14) pinned the same way as stemSynth.golden.test.ts: SHA-256 of the exact Float32 bytes of every stem
// at 8 kHz, all 15 (seven for Peat and Pitch, eight for Wing over Rime including the trial chant). A later voice tweak
// must replace these hashes deliberately; a refactor must leave every sample alone. Act 4 L8 replaced all 15 on purpose:
// both tracks gained a whole-track `trimDb` (-4.5 and -3) to sit at the Acts 1 and 2 loudness.
const SR = 8000;
const GOLDEN: Array<[TrackDef, Record<string, string>]> = [
  [
    PEAT_AND_PITCH,
    {
      kick: 'c558fee0277b6320623c96972e9fcce97c0e0de2a5a699191da09e8cd2b04d3d',
      snare: '68e6c4de3b63ea299c685b8488206466d39d0cb8f2f08761cc848d7fc6dee8b8',
      hat: 'c9c3eb359a990bd0b33d74c18b8aa211b348dd9ea4f66aa4704105ce2923a887',
      bass: '98f6ad607db210770a2d30508571ecc16ab80d8c64993a055139da30ea6ddaea',
      vocal: '0969cfa0b1472e148e18e3b3c334e0f08a4c3e0b9383a8e3a1aeef12ae46eda7',
      melody: 'c01f3f5072a63c9e5fa62607fe9af59a3804b340350553cc801cbd11adb06e3f',
      boss: 'd9df27ff5af20c0a2495372042b2d53745174de7e5f544a8e9ba540c975dbcfc',
    },
  ],
  [
    WING_OVER_RIME,
    {
      kick: '07f222b40d56f7e891048d520ac61077fbb9150a4312c208678cc83ad206419a',
      snare: '99e1b9de0f20513fdeeb132f2a654ae8ce8d9018c8d1b1604d86bec7e7c13f48',
      hat: 'c3e8a546b651ae60977c8fdca6d0535556774f52295ee4df42a7a940480e8b3b',
      bass: 'a23ec67a2efc2128824a02537d58b7ac8e3851369c103989660a71e003e265b2',
      vocal: '145056f667bb238ce9e167346c7996729a38573565bb0cab48afafae444bffd4',
      melody: '281dcf122f9c9d0fe0ed82b04cee1e01ac1a4093176637f6e328b3cdc3364491',
      boss: 'eb85125ba0dc77f3e0ddb374d21c0f955442797cf387e8b3f211ed459424d113',
      chant: 'b8354a61d80b2b64966b7b414ff70799e943a6f1214972cf5d65cda9ac8e5d2d',
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
