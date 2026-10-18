import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPlaceholderSfx, SfxPlayer } from './SfxPlayer';
import { SFX, SFX_IDS, type SfxId } from './sfxLayers';
import { sfxSeconds, SFX_VARIANTS } from './sfxSynth';

const POS = { x: 1, y: 2, z: 3 };

function setup(opts: { maxVoices?: number; minGapSeconds?: number } = {}) {
  let t = 10;
  const audio = { isUnlocked: true, playAt: vi.fn<(k: string, p: typeof POS) => number | null>(() => 1) };
  const player = new SfxPlayer({ audio, now: () => t, ...opts });
  return { audio, player, setT: (v: number) => void (t = v) };
}

describe('SfxPlayer', () => {
  it('plays all layers and returns the count, passing position', () => {
    const { audio, player } = setup();
    expect(player.play([SFX.impactMetal, SFX.thump, SFX.armourRing], POS)).toBe(3);
    expect(audio.playAt).toHaveBeenCalledTimes(3);
    expect(audio.playAt).toHaveBeenNthCalledWith(1, 'sfx.impact.metal#0', POS);
    expect(audio.playAt).toHaveBeenNthCalledWith(2, 'sfx.thump#0', POS);
  });

  it('plays nothing while locked', () => {
    const { audio, player } = setup();
    audio.isUnlocked = false;
    expect(player.play([SFX.block], POS)).toBe(0);
    expect(audio.playAt).not.toHaveBeenCalled();
  });

  it('rate-limits the same id within 40 ms', () => {
    const { audio, player, setT } = setup();
    setT(0); // start at 0 so 0.04 - 0 has no float error
    expect(player.play([SFX.block], POS)).toBe(1);
    setT(0.039);
    expect(player.play([SFX.block], POS)).toBe(0);
    expect(player.play([SFX.parry], POS)).toBe(1);
    setT(0.04);
    expect(player.play([SFX.block], POS)).toBe(1);
    setT(11);
    expect(player.play([SFX.block], POS)).toBe(1);
    expect(audio.playAt).toHaveBeenCalledTimes(4);
  });

  it('caps simultaneous voices at 12 and frees them after their duration', () => {
    const { audio, player, setT } = setup();
    const ids = SFX_IDS.slice(0, 11);
    expect(player.play(ids, POS)).toBe(11);
    expect(player.play([SFX.block], POS)).toBe(0); // gap-limited, not a voice test
    // 12th voice: wait out min gap so ids are free again
    setT(10.05);
    const started = player.play([...ids], POS);
    expect(started).toBe(1); // 11 active (long ones) + room for exactly one more
    expect(audio.playAt).toHaveBeenCalledTimes(12);
    // 13th dropped
    setT(10.1);
    expect(player.play([SFX.swingLight], POS)).toBe(0);
    // after every duration has elapsed voices free up
    setT(12);
    expect(player.play([SFX.swingLight], POS)).toBe(1);
  });

  it('drops the 13th voice with default cap when ids are distinct over time', () => {
    const { player, setT } = setup({ maxVoices: 2 });
    expect(player.play([SFX.armourRing, SFX.thump, SFX.parry], POS)).toBe(2);
    setT(10 + sfxSeconds(SFX.thump) + 0.001);
    expect(player.play([SFX.parry], POS)).toBe(1);
  });

  it('does not count or consume a voice when playAt returns null', () => {
    const { audio, player } = setup({ maxVoices: 1 });
    audio.playAt.mockReturnValueOnce(null);
    expect(player.play([SFX.block, SFX.parry], POS)).toBe(1);
    expect(audio.playAt).toHaveBeenCalledTimes(2);
  });

  it('catches playAt errors, warns, and continues', () => {
    const { audio, player } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    audio.playAt.mockImplementationOnce(() => {
      throw new Error('unregistered');
    });
    expect(player.play([SFX.block, SFX.parry], POS)).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('rotates variants 0,1,2,0 per id', () => {
    const { audio, player, setT } = setup();
    const keys: string[] = [];
    for (let i = 0; i < 4; i++) {
      setT(10 + i);
      player.play([SFX.parry], POS);
    }
    for (const c of audio.playAt.mock.calls) keys.push(c[0]);
    expect(keys).toEqual(['sfx.parry#0', 'sfx.parry#1', 'sfx.parry#2', 'sfx.parry#0']);
    setT(20);
    player.play([SFX.block], POS);
    expect(audio.playAt.mock.calls.at(-1)![0]).toBe('sfx.block#0');
  });
});

describe('registerPlaceholderSfx', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake') });
    if (typeof Blob === 'undefined') vi.stubGlobal('Blob', class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('registers 11 ids x 3 variants as wav and returns the keys', () => {
    const register = vi.fn();
    const keys = registerPlaceholderSfx({ register }, 0.5);
    expect(keys).toHaveLength(SFX_IDS.length * SFX_VARIANTS);
    expect(keys).toHaveLength(33);
    expect(new Set(keys).size).toBe(33);
    expect(register).toHaveBeenCalledTimes(33);
    for (const [key, def] of register.mock.calls) {
      expect(keys).toContain(key);
      expect(def.format).toEqual(['wav']);
      expect(def.src).toHaveLength(1);
      expect(def.volume).toBe(0.5);
    }
    expect(keys).toContain('sfx.thump#2');
    expect(keys.map((k) => k.split('#')[0])).toEqual(expect.arrayContaining(SFX_IDS as SfxId[]));
  });
});
