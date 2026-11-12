// G1 (plans/g1-settings-menu.md): the player's audio and subtitle settings, one localStorage key. Key bindings and the
// quality step keep their own keys (owg.bindings.v1, the quality manager's), so this store never duplicates them.

export const SETTINGS_STORAGE_KEY = 'owg.settings.v1';

export interface Settings {
  /** 0..100, steps of VOLUME_STEP. */
  master: number;
  music: number;
  effects: number;
  muted: boolean;
  /** Companion barks shown as a subtitle line (they have no voice, so the text is the only way to hear them). */
  barkSubtitles: boolean;
  /** G2 (reserved here so one store holds every setting): controller rumble. */
  padRumble: boolean;
  /** G2: controller look speed, PAD_SENSITIVITY_MIN..MAX. */
  padLookSensitivity: number;
  /** G2: controller look inverted vertically. */
  padInvertY: boolean;
}

export const PAD_SENSITIVITY_MIN = 0.5;
export const PAD_SENSITIVITY_MAX = 2;

/** A controller look speed clamped to its range and rounded to 0.1; anything else gives `fallback`. */
export function clampSensitivity(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(PAD_SENSITIVITY_MAX, Math.max(PAD_SENSITIVITY_MIN, v)) * 10) / 10;
}

export const VOLUME_STEP = 10;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  master: 100,
  music: 100,
  effects: 100,
  muted: false,
  barkSubtitles: true,
  padRumble: true,
  padLookSensitivity: 1,
  padInvertY: false,
});

type Storageish = Pick<Storage, 'getItem' | 'setItem'>;

export function safeStorage(): Storageish | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A volume rounded to the step and clamped to 0..100; anything that is not a finite number gives `fallback`. */
export function clampVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, Math.round(v / VOLUME_STEP) * VOLUME_STEP));
}

export class SettingsStore {
  private data: Settings = { ...DEFAULT_SETTINGS };
  private readonly listeners = new Set<(s: Readonly<Settings>) => void>();

  constructor(private readonly storage: Storageish | null = safeStorage()) {
    this.load();
  }

  get(): Readonly<Settings> {
    return this.data;
  }

  /** Applies a partial change (invalid fields are ignored), persists it and tells every listener once. */
  set(patch: Partial<Settings>): void {
    const next: Settings = { ...this.data };
    if ('master' in patch) next.master = clampVolume(patch.master, next.master);
    if ('music' in patch) next.music = clampVolume(patch.music, next.music);
    if ('effects' in patch) next.effects = clampVolume(patch.effects, next.effects);
    if (typeof patch.muted === 'boolean') next.muted = patch.muted;
    if (typeof patch.barkSubtitles === 'boolean') next.barkSubtitles = patch.barkSubtitles;
    if (typeof patch.padRumble === 'boolean') next.padRumble = patch.padRumble;
    if ('padLookSensitivity' in patch) next.padLookSensitivity = clampSensitivity(patch.padLookSensitivity, next.padLookSensitivity);
    if (typeof patch.padInvertY === 'boolean') next.padInvertY = patch.padInvertY;
    if (JSON.stringify(next) === JSON.stringify(this.data)) return;
    this.data = next;
    this.save();
    for (const fn of [...this.listeners]) {
      try {
        fn(this.data);
      } catch (e) {
        console.error('[settings] listener threw', e);
      }
    }
  }

  onChange(fn: (s: Readonly<Settings>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private load(): void {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(SETTINGS_STORAGE_KEY) ?? null;
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>> | null;
      if (!d || typeof d !== 'object') return;
      this.data = {
        master: clampVolume(d.master, DEFAULT_SETTINGS.master),
        music: clampVolume(d.music, DEFAULT_SETTINGS.music),
        effects: clampVolume(d.effects, DEFAULT_SETTINGS.effects),
        muted: typeof d.muted === 'boolean' ? d.muted : DEFAULT_SETTINGS.muted,
        barkSubtitles: typeof d.barkSubtitles === 'boolean' ? d.barkSubtitles : DEFAULT_SETTINGS.barkSubtitles,
        padRumble: typeof d.padRumble === 'boolean' ? d.padRumble : DEFAULT_SETTINGS.padRumble,
        padLookSensitivity: clampSensitivity(d.padLookSensitivity, DEFAULT_SETTINGS.padLookSensitivity),
        padInvertY: typeof d.padInvertY === 'boolean' ? d.padInvertY : DEFAULT_SETTINGS.padInvertY,
      };
    } catch {
      // corrupt: defaults stand
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage unavailable: the change lives for the session only
    }
  }
}
