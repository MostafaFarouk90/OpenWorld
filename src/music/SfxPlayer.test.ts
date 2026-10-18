import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPlaceholderSfx, SfxPlayer } from './SfxPlayer';
import { BARE_SFX, SFX, SFX_IDS, SPELL_SFX_IDS, type SfxId } from './sfxLayers';
import { sfxSeconds, SFX_VARIANTS } from './sfxSynth';

const POS = { x: 1, y: 2, z: 3 };

function setup(opts: { maxVoices?: number; minGapSeconds?: number } = {}) {
  let t = 10;
  const audio = {
    isUnlocked: true,
    playAt: vi.fn<(k: string, p: typeof POS) => number | null>(() => 1),
    play: vi.fn<(k: string) => number | null>(() => 1),
  };
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

  it('registers every id x 3 variants, the bare-key sounds and the bare aliases as wav, and returns the keys', () => {
    const register = vi.fn();
    const keys = registerPlaceholderSfx({ register }, 0.5);
    // variants + spell sounds + the 11 bare slice 2 sounds + 4 bare aliases of variant ids
    const total = SFX_IDS.length * SFX_VARIANTS + SPELL_SFX_IDS.length + 11 + 4;
    expect(keys).toHaveLength(total);
    expect(new Set(keys).size).toBe(total);
    expect(register).toHaveBeenCalledTimes(total);
    for (const [key, def] of register.mock.calls) {
      expect(keys).toContain(key);
      expect(def.format).toEqual(['wav']);
      expect(def.src).toHaveLength(1);
      expect(def.volume).toBe(0.5);
    }
    expect(keys).toContain('sfx.thump#2');
    expect(keys.map((k) => k.split('#')[0])).toEqual(expect.arrayContaining(SFX_IDS as SfxId[]));
  });

  it('registers the spell sounds under their exact keys, with no variant suffix', () => {
    const register = vi.fn();
    const keys = registerPlaceholderSfx({ register });
    for (const id of ['sfx.surge.charge', 'sfx.surge.release', 'sfx.rally']) {
      expect(keys).toContain(id);
      expect(register.mock.calls.filter((c) => c[0] === id)).toHaveLength(1);
    }
  });

  it('a registry that throws on unknown keys (as AudioManager does) accepts every spell key after registration, and only those', () => {
    const known = new Set<string>();
    registerPlaceholderSfx({ register: (key) => void known.add(key) });
    const play = (key: string): void => {
      if (!known.has(key)) throw new Error(`Unknown sound "${key}"`);
    };
    for (const id of SPELL_SFX_IDS) expect(() => play(id)).not.toThrow();
    expect(() => play('sfx.surge.charge#0')).toThrow(/Unknown sound/);
    expect(() => play('sfx.nonexistent')).toThrow(/Unknown sound/);
  });
});

describe('SfxPlayer slice 2 additions', () => {
  it('a fixed variant is used as given (wrapped), and does not advance the cycling counter', () => {
    const { audio, player } = setup();
    player.play([SFX.leap], POS, { variant: 7 });
    expect(audio.playAt.mock.calls[0][0]).toBe('sfx.leap#1');
    player.play([SFX.thump], POS);
    expect(audio.playAt.mock.calls[1][0]).toBe('sfx.thump#0');
    player.play([SFX.leap], POS, { variant: -1, minGapSeconds: 0 });
    expect(audio.playAt.mock.calls[2][0]).toBe('sfx.leap#2');
  });

  it('a per-call minimum gap rate-limits one id longer than the default', () => {
    const { audio, player, setT } = setup();
    player.play([SFX.companionBark], POS, { minGapSeconds: 0.8 });
    setT(10.5);
    player.play([SFX.companionBark], POS, { minGapSeconds: 0.8 });
    expect(audio.playAt).toHaveBeenCalledTimes(1);
    setT(10.9);
    player.play([SFX.companionBark], POS, { minGapSeconds: 0.8 });
    expect(audio.playAt).toHaveBeenCalledTimes(2);
  });

  it('playKey plays flat without a position and spatially with one', () => {
    const { audio, player } = setup();
    expect(player.playKey(BARE_SFX.shrineRekindle)).toBe(true);
    expect(audio.play).toHaveBeenCalledWith('sfx.shrine.rekindle');
    expect(player.playKey(BARE_SFX.whistle, POS)).toBe(true);
    expect(audio.playAt).toHaveBeenCalledWith('sfx.whistle', POS);
  });

  it('playKey is dropped while locked, inside the gap, over the voice cap, or when the manager returns null', () => {
    const { audio, player, setT } = setup({ maxVoices: 1 });
    audio.isUnlocked = false;
    expect(player.playKey(BARE_SFX.whistle)).toBe(false);
    audio.isUnlocked = true;
    expect(player.playKey(BARE_SFX.whistle)).toBe(true);
    expect(player.playKey(BARE_SFX.whistle)).toBe(false); // same id, same instant
    expect(player.playKey(BARE_SFX.priorGong)).toBe(false); // voice cap
    setT(20);
    audio.play.mockReturnValueOnce(null);
    expect(player.playKey(BARE_SFX.priorGong)).toBe(false);
  });

  it('playKey never throws when the manager does (an unregistered key), and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { audio, player } = setup();
    audio.play.mockImplementation(() => {
      throw new Error('Sound "x" is not registered');
    });
    expect(player.playKey(BARE_SFX.whistle)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
