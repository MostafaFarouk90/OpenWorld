import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { CREDITS, ENDING_LET_IT_DIE, ENDING_REKINDLE, HEART_OF_THE_ANVIL, type TrackDef } from './tracks';

// Act 5 tracks (N8) pinned like the Act 3 and 4 ones: SHA-256 of the exact Float32 bytes of every stem at 8 kHz (nine for
// Heart of the Anvil, four and three for the ending themes, eight for the credits ballad). A voice tweak replaces these on purpose.
const SR = 8000;
const GOLDEN: Array<[TrackDef, Record<string, string>]> = [
  [
    HEART_OF_THE_ANVIL,
    {
      kick: 'd6a1d92f6f36d2cb851c1a9220e54edaf887e94d561fb2a08c928ca9478e7562',
      snare: 'def6d271dcb485c6a2bed719e9fe903d9abf316db1379762cfd96d905af04e1f',
      hat: '8234a889042e3bf17d6a3675f36b50efc72de5d0c8d34ed9edea4cfe40bf2a02',
      bass: 'd4ace2f6e7d7aff60021604e5c398a768aaa54b63e25cd7854e3dc24ef3bcc75',
      vocal: '6508e757e76b9a0616a06f7058633cf6b36ab06e4734e284c6a450329c3d54c8',
      melody: 'ffb054345404c234a55b374dde9fc68ac845f256227639cab7660b5a3ad18ad3',
      boss: 'e12bcff45a6d6dae52a918baffbfa8bac8fac3502d49a6d69636e9d82ec94f81',
      medley: '452b4f1f3fee880fe5e8c2fdc1653f28413acfa62980cc89d60e3224e3902c67',
      heartbeat: '2a46452ff234ad888cc4a31feb7f53f9542aa722b0e90d606f064d9b835a146e',
    },
  ],
  [
    ENDING_REKINDLE,
    {
      kick: 'b820c07f04335e01d8b8b1b4fdba7fc6631ff321c0a7975a76ab947afe39b762',
      bass: '2102f37a9ee4a4d05306dd857d5ea8cc5039123588aafacd32b5b3c9e2d21343',
      vocal: '7dfefe67858300854638d2ae171f84dab4f02a97fc72f6185f26f77ebe502ba8',
      melody: 'f2b0ba31a7da82a2627de7e3725f79e4bb6fad86581bb21a28eef61a8300681b',
    },
  ],
  [
    ENDING_LET_IT_DIE,
    {
      bass: '4d6ac45fe019f19476686643fc5b0eea744aa307c4c8e349197ce93a7a1a8d2e',
      vocal: 'c53015c1ccbac88a634f33b644d0fb64a743f93692dc48ff1ae2d50245f67a17',
      melody: 'ea39617c25134dd6efc9926250a6ad8a393310ccc7f4382ed648e72ae85dd407',
    },
  ],
  [
    CREDITS,
    {
      bass: 'e95fe49a73a4b85ba49c2f1dbaca552ac0fd7cfed35749eeeb85ef3dc3825e09',
      pluck: '12ae7da6bc47936d08b2a1e7b60ba740796c067bad0eb969e1e7a12e111e6c1b',
      vocal: '4f28dbdcefb42f9f10025f4aee04d47daed3055f70301822684e952300e7528c',
      crew: '602fcdd279d60a87594c3ac2129657714ba02afbe447535403649c295e379b32',
      'verse-gaut': 'b333b822db03c6da4f38ea4b51f3266bf19a895202452d26905ff4534efce7f5',
      'verse-keepers': 'd219a256fef3f57d64111903444c38b4a4e3bcbf47112122b3b87892eead32f6',
      'verse-houses': 'd1110ad7c387a5ab3b02bd3486aea97682dfd3235d7430a44c61a22bd2325c45',
      'verse-walkers': '9c634572a2d7d5530381fd8f62aceb34eec4379f48511ffee40e58131bc7cb7f',
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
