import { BURN } from './tuning';

interface Pulse {
  strength: number;
  seconds: number;
  age: number;
  color: number;
}

/**
 * Screen-edge vignette: a steady ember glow while Burn is above 25, red in the Cinder zone, plus
 * pulses (parry flash, Surge). Renders as one fixed DOM element in the hud layer; headless
 * (no document) it keeps its state and does nothing else.
 */
export class ScreenFx {
  readonly element: HTMLElement | null;
  private pulses: Pulse[] = [];
  private burn = 0;
  private lastCss = '';

  constructor(doc: Document | null = typeof document === 'undefined' ? null : document) {
    if (doc) {
      const el = doc.createElement('div');
      el.setAttribute('data-vfx', 'vignette');
      el.style.cssText =
        'position:fixed;inset:0;pointer-events:none;opacity:0;transition:none;z-index:5;mix-blend-mode:screen;';
      this.element = el;
    } else this.element = null;
  }

  setBurn(value: number): void {
    this.burn = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  }

  pulse(strength: number, seconds: number, color = 0xffb040): void {
    if (!Number.isFinite(strength) || !(strength > 0) || !(seconds > 0) || !Number.isFinite(seconds)) return;
    this.pulses.push({ strength: Math.min(1, strength), seconds, age: 0, color });
  }

  /** Current intensity 0..1 and colour; exposed for tests. */
  state(): { intensity: number; color: number } {
    let intensity = 0;
    let color = this.burn >= BURN.cinderAt ? 0xff2a10 : 0xff8a20;
    if (this.burn > BURN.vignetteGlowAbove) {
      intensity = 0.15 + 0.25 * ((this.burn - BURN.vignetteGlowAbove) / (100 - BURN.vignetteGlowAbove));
    }
    for (const p of this.pulses) {
      const v = p.strength * (1 - p.age / p.seconds);
      if (v > intensity) {
        intensity = v;
        color = p.color;
      }
    }
    return { intensity: Math.min(1, intensity), color };
  }

  /** `dt` is 0 while the game is paused. */
  update(dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    for (const p of this.pulses) p.age += step;
    this.pulses = this.pulses.filter((p) => p.age < p.seconds);
    const { intensity, color } = this.state();
    if (!this.element) return;
    const css = `${intensity.toFixed(3)}|${color}`;
    if (css === this.lastCss) return;
    this.lastCss = css;
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    this.element.style.opacity = String(intensity);
    this.element.style.background = `radial-gradient(ellipse at center, transparent 55%, ${hex} 140%)`;
  }

  dispose(): void {
    this.pulses = [];
    this.element?.remove();
  }
}
