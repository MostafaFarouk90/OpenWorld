import { describe, expect, it, vi } from 'vitest';
import { loadTrackStems } from './stemLoader';
import { synthStem } from './stemSynth';
import { BARLEY_AND_BRAZIER as TRACK, loopSamples } from './tracks';

const SR = 12000;
const stems = Object.fromEntries(TRACK.stems.map((id) => [id, synthStem(TRACK, id, SR)]));

describe('summed mixes', () => {
  for (const state of ['explore', 'discover', 'combat', 'boss', 'ending', 'talk'] as const) {
    it(`the ${state} mix never exceeds full scale`, () => {
      let peak = 0;
      for (let i = 0; i < loopSamples(TRACK, SR); i++) {
        let sum = 0;
        for (const id of TRACK.stems) sum += stems[id][i] * (TRACK.mixes[state][id] ?? 0);
        peak = Math.max(peak, Math.abs(sum));
      }
      expect(peak).toBeLessThanOrEqual(1);
    });
  }
});

describe('no clicks inside tonal stems', () => {
  for (const id of ['bass', 'vocal', 'melody', 'boss']) {
    it(`${id} has no step far above its normal sample-to-sample movement`, () => {
      const x = stems[id];
      const steps: number[] = [];
      for (let i = 1; i < x.length; i++) steps.push(Math.abs(x[i] - x[i - 1]));
      const sorted = [...steps].sort((a, b) => a - b);
      const p999 = sorted[Math.floor(sorted.length * 0.999)];
      expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(p999 * 2.5);
    });
  }
});

describe('loadTrackStems skipProcedural', () => {
  it('does not synthesise a skipped stem and does not report it failed', async () => {
    const buffers: number[] = [];
    const ctx = {
      sampleRate: SR,
      createBuffer: (_c: number, length: number) => {
        buffers.push(length);
        return { length, numberOfChannels: 1, sampleRate: SR, getChannelData: () => new Float32Array(length), copyToChannel: vi.fn() } as unknown as AudioBuffer;
      },
      decodeAudioData: vi.fn(),
    };
    const out = await loadTrackStems(ctx, TRACK, {
      fetchImpl: async () => new Response('', { status: 404 }),
      yieldToMain: async () => {},
      skipProcedural: ['boss'],
    });
    vi.restoreAllMocks();
    expect(out.buffers.has('boss')).toBe(false);
    expect(out.failed).toEqual([]);
    expect(out.buffers.size).toBe(TRACK.stems.length - 1);
  });
});
