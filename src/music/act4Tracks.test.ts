import { describe, expect, it } from 'vitest';
import {
  ACT4_BOSS_MIX_TRACK,
  ACT4_TRACK_SLOTS,
  CHIME_PITCHES_HZ,
  EBBA_PHRASES,
  EBBA_TUNE,
  M38_BETRAYAL_MIX,
  M38_COUNCIL_MIX,
} from './act4Tracks';
import { createAct4Voices } from './act4Voices';
import { stemPeak, synthStem } from './stemSynth';
import { regionTrackNow } from '../region/regions';
import { DUST_CHANT, RESERVED_TRACK_IDS, SEVEN_GATES_ASH, SEVEN_GATES_ONE_DRUM, TRACKS_BY_ID, loopSamples, validateTrack, type TrackDef } from './tracks';

const SR = 8000;

describe('Act 4 tracks', () => {
  it('both are registered under the reserved ids with the design BPM', () => {
    for (const slot of ACT4_TRACK_SLOTS) {
      const track = TRACKS_BY_ID[slot.id];
      expect(track, slot.id).toBeDefined();
      expect(track.bpm).toBe(slot.bpm);
      expect(track.bars).toBe(16);
    }
    expect(DUST_CHANT.bpm).toBe(91);
    expect(SEVEN_GATES_ASH.bpm).toBe(SEVEN_GATES_ONE_DRUM.bpm);
  });

  it.each([DUST_CHANT, SEVEN_GATES_ASH])('$id validates and every stem renders exactly one loop, finite, at its peak', (track: TrackDef) => {
    expect(() => validateTrack(track)).not.toThrow();
    for (const id of track.stems) {
      const x = synthStem(track, id, SR);
      expect(x.length, id).toBe(loopSamples(track, SR));
      let peak = 0;
      let finite = true;
      for (const v of x) {
        finite &&= Number.isFinite(v);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(finite, id).toBe(true);
      expect(peak, id).toBeCloseTo(stemPeak(track, id), 5);
    }
  });

  it('Dust Chant uses the design core pattern verbatim', () => {
    expect(DUST_CHANT.synth?.pattern).toEqual(['B - - - K - t - B - - t K - t -', 'B - t - K - - t B - B - K - ts t']);
  });

  it('Dust Chant mixes follow design 6.3 (explore hat .15 bass .70 vocal .50; combat melody .3) and keep the toll out of them', () => {
    expect(DUST_CHANT.mixes.explore).toMatchObject({ hat: 0.15, bass: 0.7, vocal: 0.5, melody: 0, kick: 0 });
    expect(DUST_CHANT.mixes.discover.melody).toBe(0.9);
    expect(DUST_CHANT.mixes.combat).toMatchObject({ kick: 1, snare: 1, hat: 0.9, bass: 1, vocal: 1, melody: 0.3 });
    for (const [state, m] of Object.entries(DUST_CHANT.mixes)) expect(m.toll, state).toBe(0);
  });

  it('the ash variant holds the drum back against Seven Gates', () => {
    expect(SEVEN_GATES_ASH.mixes.explore.kick).toBe(0);
    expect(SEVEN_GATES_ASH.mixes.combat.kick).toBeLessThan(SEVEN_GATES_ONE_DRUM.mixes.combat.kick);
    const hits = (t: TrackDef) => t.synth!.pattern.join(' ').split(/\s+/).filter((x) => x === 'B' || x === 'K').length;
    expect(hits(SEVEN_GATES_ASH)).toBeLessThan(hits(SEVEN_GATES_ONE_DRUM));
  });
});

describe('Act 4 boss mixes', () => {
  it('every key is on the track that plays where it is fought (fails when an id is missing)', () => {
    for (const [key, trackId] of Object.entries(ACT4_BOSS_MIX_TRACK)) {
      expect(TRACKS_BY_ID[trackId]?.bossMixes?.[key], `${key} on ${trackId}`).toBeDefined();
    }
    expect(Object.keys(ACT4_BOSS_MIX_TRACK)).toEqual(expect.arrayContaining(['bellows-engine', 'eormen']));
  });

  it('Eormen: the walker chant leads, the gong joins in phase 2 and is full in phase 3; the hush drops the drums', () => {
    const def = DUST_CHANT.bossMixes!.eormen;
    expect(def.phases).toHaveLength(3);
    expect(def.phases[0].boss).toBe(1);
    expect(def.phases[0].toll).toBe(0);
    expect(def.phases[1].toll).toBeGreaterThan(0);
    expect(def.phases[2].toll).toBe(1);
    expect(def.hush).toMatchObject({ kick: 0, snare: 0, toll: 1 });
  });

  it('the Bellows-Engine has three phases and no hush (no mercy)', () => {
    const def = SEVEN_GATES_ASH.bossMixes!['bellows-engine'];
    expect(def.phases).toHaveLength(3);
    expect(def.hush).toBeUndefined();
    for (const m of def.phases) expect(m.boss).toBeGreaterThan(0);
  });

  it('M38: at the betrayal the melody goes out and nothing else gets quieter', () => {
    const council = SEVEN_GATES_ASH.bossMixes![M38_COUNCIL_MIX].phases[0];
    const betrayal = SEVEN_GATES_ASH.bossMixes![M38_BETRAYAL_MIX].phases[0];
    expect(council.melody).toBeGreaterThan(0);
    expect(betrayal.melody).toBe(0);
    for (const stem of SEVEN_GATES_ASH.stems) if (stem !== 'melody') expect(betrayal[stem], stem).toBeGreaterThanOrEqual(council[stem]);
  });
});

describe('Ebba tune and the glass pillars', () => {
  it('six strictly rising pitches, B4 to G5', () => {
    expect(CHIME_PITCHES_HZ).toHaveLength(6);
    for (let i = 1; i < 6; i++) expect(CHIME_PITCHES_HZ[i]).toBeGreaterThan(CHIME_PITCHES_HZ[i - 1]);
    expect(CHIME_PITCHES_HZ[0]).toBeCloseTo(493.88, 1);
    expect(CHIME_PITCHES_HZ[5]).toBeCloseTo(783.99, 1);
  });

  it('the pillars are Dust Chant scale degrees 1 to 6 two octaves above its tonic', () => {
    const syn = DUST_CHANT.synth!;
    CHIME_PITCHES_HZ.forEach((hz, i) => expect(hz).toBeCloseTo(syn.tonic * 4 * 2 ** (syn.scale[i] / 12), 0));
  });

  it('the tune is four bars of 4/4 on the six pillars', () => {
    expect(EBBA_TUNE.reduce((s, n) => s + n.beats, 0)).toBe(16);
    for (const n of EBBA_TUNE) {
      expect(Number.isInteger(n.pillar) && n.pillar >= 0 && n.pillar < 6).toBe(true);
      expect(n.beats).toBeGreaterThan(0);
    }
  });

  it('the three phrases cover the tune in order with no gap or overlap, each on bar lines', () => {
    expect(EBBA_PHRASES).toHaveLength(3);
    expect(EBBA_PHRASES[0][0]).toBe(0);
    expect(EBBA_PHRASES[2][1]).toBe(EBBA_TUNE.length);
    for (let i = 1; i < 3; i++) expect(EBBA_PHRASES[i][0]).toBe(EBBA_PHRASES[i - 1][1]);
    for (const [a, b] of EBBA_PHRASES) {
      expect(b).toBeGreaterThan(a);
      expect(EBBA_TUNE.slice(a, b).reduce((s, n) => s + n.beats, 0) % 4).toBe(0);
    }
  });
});

describe('Act 4 voice table', () => {
  const table = createAct4Voices({ tokens: () => [], arc: () => 1, Feel: class {} as never });
  it('has a voice for every Act 4 voice name the two tracks use that no earlier act provides', () => {
    const shipped = new Set(['rimshot', 'throat-chant', 'trumpet']);
    for (const track of [DUST_CHANT, SEVEN_GATES_ASH]) {
      for (const name of Object.values(track.synth!.voices)) if (!shipped.has(name!)) expect(table[name!], name).toBeTypeOf('function');
    }
  });
});

describe('region tracks (L0 v0.8 slots)', () => {
  const flags = (set: readonly string[]) => ({ getFlag: (k: string) => set.includes(k) });
  it('the Waste plays Dust Chant; Harrowmark plays Seven Gates before story.gate.a4 and the ash variant after', () => {
    expect(regionTrackNow('ashen-waste', flags([]))).toBe('dust-chant');
    expect(regionTrackNow('harrowmark', flags([]))).toBe('seven-gates-one-drum');
    expect(regionTrackNow('harrowmark', null)).toBe('seven-gates-one-drum');
    expect(regionTrackNow('harrowmark', flags(['story.gate.a4']))).toBe('seven-gates-ash');
    for (const id of ['dust-chant', 'seven-gates-ash']) expect(TRACKS_BY_ID[id], id).toBeDefined();
  });

  it('the two Act 4 ids are no longer reserved (they are built)', () => {
    for (const slot of ACT4_TRACK_SLOTS) expect(RESERVED_TRACK_IDS).not.toContain(slot.id);
  });
});
