import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SettingsStore, clampSensitivity, clampVolume } from './SettingsStore';

function mem(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_STORAGE_KEY, initial);
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('SettingsStore', () => {
  it('starts on the defaults and persists a change that a new store reads back', () => {
    const s = mem();
    const a = new SettingsStore(s);
    expect(a.get()).toEqual(DEFAULT_SETTINGS);
    a.set({ music: 40, muted: true, barkSubtitles: false, padInvertY: true, padLookSensitivity: 1.5 });
    const b = new SettingsStore(s);
    expect(b.get()).toMatchObject({ music: 40, muted: true, barkSubtitles: false, padInvertY: true, padLookSensitivity: 1.5 });
  });

  it('tells listeners once per real change, never for a no-op', () => {
    const a = new SettingsStore(mem());
    const fn = vi.fn();
    a.onChange(fn);
    a.set({ master: 100 });
    expect(fn).not.toHaveBeenCalled();
    a.set({ master: 70 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].master).toBe(70);
  });

  it('clamps and rounds volumes and sensitivity, and ignores fields of the wrong type', () => {
    const a = new SettingsStore(mem());
    a.set({ master: 137, music: -5, effects: 44 });
    expect(a.get()).toMatchObject({ master: 100, music: 0, effects: 40 });
    a.set({ muted: 'yes' as unknown as boolean, padLookSensitivity: 9 });
    expect(a.get().muted).toBe(false);
    expect(a.get().padLookSensitivity).toBe(2);
    expect(clampVolume(Number.NaN, 30)).toBe(30);
    expect(clampSensitivity('x', 1)).toBe(1);
    expect(clampSensitivity(0.1, 1)).toBe(0.5);
  });

  it('falls back to the defaults for corrupt or partial storage, field by field', () => {
    expect(new SettingsStore(mem('{not json')).get()).toEqual(DEFAULT_SETTINGS);
    expect(new SettingsStore(mem('null')).get()).toEqual(DEFAULT_SETTINGS);
    const partial = new SettingsStore(mem(JSON.stringify({ music: 30, muted: 1, padRumble: false }))).get();
    expect(partial).toMatchObject({ music: 30, muted: false, padRumble: false, master: 100 });
  });

  it('works with no storage or storage that throws', () => {
    const a = new SettingsStore(null);
    a.set({ effects: 50 });
    expect(a.get().effects).toBe(50);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const b = new SettingsStore(throwing);
    expect(b.get()).toEqual(DEFAULT_SETTINGS);
    b.set({ effects: 20 });
    expect(b.get().effects).toBe(20);
  });
});
