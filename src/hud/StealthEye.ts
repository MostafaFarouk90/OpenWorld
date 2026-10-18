import type { DocumentLike } from './dom';
import { clamp01, makeEl, safeRead, setShown, type HudWidgetView, type Translate } from './widget';
import { defaultHudT } from './strings.en';

export type StealthState = 'calm' | 'suspicious' | 'alerted';

export interface StealthEyeReading {
  level: number;
  state: StealthState;
  observerId?: string | null;
}

export interface StealthEyeSource {
  /** Thread 18's `stealth.eye()`; null when nobody is watching. Read every frame. */
  eye?(): StealthEyeReading | null | undefined;
  t?: Translate;
}

export interface NoiseRingSource {
  /** `stealth.noise()` in metres while sneaking, null otherwise (null hides the Quiet Soles ring). */
  noise?(): number | null | undefined;
  t?: Translate;
}

/** Ring diameter in px per metre of noise, clamped. */
export const NOISE_RING_PX_PER_M = 6;
export const NOISE_RING_MAX_PX = 240;

const STATES: readonly string[] = ['calm', 'suspicious', 'alerted'];

/** Stealth eye (top-center). CSS only; every reader is optional. */
export class StealthEye implements HudWidgetView {
  readonly id = 'stealth-eye';
  readonly element;
  private readonly eye;
  private readonly lid;
  private shownEye = false;
  private lastLevel = -1;
  private lastState = '';

  constructor(doc: DocumentLike, private readonly source: StealthEyeSource = {}) {
    const t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-stealth');
    this.eye = makeEl(doc, 'div', 'owg-eye owg-eye-calm', this.element);
    this.eye.setAttribute('role', 'meter');
    this.eye.setAttribute('aria-valuemin', '0');
    this.eye.setAttribute('aria-valuemax', '100');
    this.eye.setAttribute('aria-label', t('hud.stealth.eye'));
    this.lid = makeEl(doc, 'div', 'owg-eye-lid', this.eye);
    makeEl(doc, 'div', 'owg-eye-pupil', this.eye);
    setShown(this.eye, false);
    setShown(this.element, false);
  }

  update(): void {
    const reading = safeRead(this.source.eye);
    const eyeOn = !!reading && typeof reading === 'object';
    if (eyeOn) {
      const level = Math.round(clamp01(reading.level) * 100) / 100;
      const state = STATES.includes(reading.state) ? reading.state : 'calm';
      if (level !== this.lastLevel) {
        this.lastLevel = level;
        // The lid closes as the level falls: open eye at 1, a slit at 0.
        this.lid.style.transform = `scaleY(${Math.round((1 - level) * 100) / 100})`;
        this.eye.setAttribute('aria-valuenow', String(Math.round(level * 100)));
      }
      if (state !== this.lastState) {
        this.lastState = state;
        this.eye.className = `owg-eye owg-eye-${state}`;
      }
    }
    if (eyeOn !== this.shownEye) {
      this.shownEye = eyeOn;
      setShown(this.eye, eyeOn);
      setShown(this.element, eyeOn);
      if (!eyeOn) {
        this.lastLevel = -1;
        this.lastState = '';
      }
    }
  }

  get visible(): boolean {
    return this.shownEye;
  }

  dispose(): void {
    this.element.remove();
  }
}

/**
 * The Quiet Soles noise ring, centred on the screen. Mounted in the full-viewport `overlay` slot: a transformed
 * ancestor (the top-center slot) would turn its position:fixed into position relative to that slot.
 */
export class NoiseRing implements HudWidgetView {
  readonly id = 'noise-ring';
  readonly element;
  private readonly ring;
  private shown = false;
  private lastPx = -1;

  constructor(doc: DocumentLike, private readonly source: NoiseRingSource = {}) {
    const t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-noise');
    this.ring = makeEl(doc, 'div', 'owg-noise-ring', this.element);
    this.ring.setAttribute('aria-label', t('hud.stealth.noise'));
    setShown(this.ring, false);
    setShown(this.element, false);
  }

  update(): void {
    const noise = safeRead(this.source.noise);
    const on = typeof noise === 'number' && Number.isFinite(noise) && noise >= 0;
    if (on) {
      const px = Math.min(NOISE_RING_MAX_PX, Math.round(noise * NOISE_RING_PX_PER_M));
      if (px !== this.lastPx) {
        this.lastPx = px;
        this.ring.style.width = `${px}px`;
        this.ring.style.height = `${px}px`;
      }
    }
    if (on !== this.shown) {
      this.shown = on;
      setShown(this.ring, on);
      setShown(this.element, on);
      if (!on) this.lastPx = -1;
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
