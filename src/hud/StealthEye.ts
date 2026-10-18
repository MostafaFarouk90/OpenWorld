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
  /** `stealth.noise()` in metres while sneaking, null otherwise (null hides the Quiet Soles ring). */
  noise?(): number | null | undefined;
  t?: Translate;
}

/** Ring diameter in px per metre of noise, clamped. */
export const NOISE_RING_PX_PER_M = 6;
export const NOISE_RING_MAX_PX = 240;

const STATES: readonly string[] = ['calm', 'suspicious', 'alerted'];

/** Stealth eye (top-center) and the Quiet Soles noise ring. CSS only; every reader is optional. */
export class StealthEye implements HudWidgetView {
  readonly id = 'stealth-eye';
  readonly element;
  private readonly eye;
  private readonly lid;
  private readonly ring;
  private shownEye = false;
  private shownRing = false;
  private shownAll = true;
  private lastLevel = -1;
  private lastState = '';
  private lastRing = -1;

  constructor(doc: DocumentLike, private readonly source: StealthEyeSource = {}) {
    const t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-stealth');
    this.eye = makeEl(doc, 'div', 'owg-eye owg-eye-calm', this.element);
    this.eye.setAttribute('role', 'img');
    this.eye.setAttribute('aria-label', t('hud.stealth.eye'));
    this.lid = makeEl(doc, 'div', 'owg-eye-lid', this.eye);
    makeEl(doc, 'div', 'owg-eye-pupil', this.eye);
    this.ring = makeEl(doc, 'div', 'owg-noise-ring', this.element);
    this.ring.setAttribute('aria-label', t('hud.stealth.noise'));
    setShown(this.eye, false);
    setShown(this.ring, false);
    setShown(this.element, false);
    this.shownAll = false;
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
      if (!eyeOn) {
        this.lastLevel = -1;
        this.lastState = '';
      }
    }

    const noise = safeRead(this.source.noise);
    const ringOn = typeof noise === 'number' && Number.isFinite(noise) && noise >= 0;
    if (ringOn) {
      const px = Math.min(NOISE_RING_MAX_PX, Math.round(noise * NOISE_RING_PX_PER_M));
      if (px !== this.lastRing) {
        this.lastRing = px;
        this.ring.style.width = `${px}px`;
        this.ring.style.height = `${px}px`;
      }
    }
    if (ringOn !== this.shownRing) {
      this.shownRing = ringOn;
      setShown(this.ring, ringOn);
      if (!ringOn) this.lastRing = -1;
    }

    const any = eyeOn || ringOn;
    if (any !== this.shownAll) {
      this.shownAll = any;
      setShown(this.element, any);
    }
  }

  get visible(): boolean {
    return this.shownAll;
  }

  dispose(): void {
    this.element.remove();
  }
}
