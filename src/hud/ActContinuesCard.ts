import type { DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { makeEl, setShown, type HudWidgetView, type Translate } from './widget';

export const ACT_CONTINUES_TRIGGER = 'trg.fog.harrowmark';
export const ACT_CONTINUES_SECONDS = 6;

/** HUD options. Thread 21 retires the card in Phase B by flipping this one switch. */
export const hudOptions = { showActContinues: true };

export interface KeySource {
  addEventListener(type: 'keydown', listener: () => void): void;
  removeEventListener(type: 'keydown', listener: () => void): void;
}

/** "Act 1 continues" card (center): shown once per session on entering the fog-gate trigger. */
export class ActContinuesCard implements HudWidgetView {
  readonly id = 'act-continues';
  readonly element;
  private left = 0;
  private done = false;
  private readonly onKey = () => this.dismiss();
  private listening = false;

  constructor(
    doc: DocumentLike,
    private readonly opts: { t?: Translate; keys?: KeySource | null; enabled?: () => boolean } = {},
  ) {
    const t = opts.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-card');
    makeEl(doc, 'h2', 'owg-card-title', this.element).textContent = t('hud.actContinues.title');
    makeEl(doc, 'div', 'owg-card-body', this.element).textContent = t('hud.actContinues.body');
    makeEl(doc, 'div', 'owg-card-hint', this.element).textContent = t('hud.actContinues.hint');
    setShown(this.element, false);
  }

  get visible(): boolean {
    return this.left > 0;
  }

  /** Call for every `trigger.enter`; only the fog-gate trigger shows the card, and only once. */
  onTrigger(triggerId: string): void {
    if (triggerId !== ACT_CONTINUES_TRIGGER || this.done) return;
    if (this.opts.enabled && !this.opts.enabled()) return;
    this.done = true;
    this.left = ACT_CONTINUES_SECONDS;
    setShown(this.element, true);
    if (this.opts.keys && !this.listening) {
      this.opts.keys.addEventListener('keydown', this.onKey);
      this.listening = true;
    }
  }

  dismiss(): void {
    this.left = 0;
    setShown(this.element, false);
    this.unlisten();
  }

  private unlisten(): void {
    if (this.listening) this.opts.keys?.removeEventListener('keydown', this.onKey);
    this.listening = false;
  }

  update(dt = 0): void {
    if (this.left <= 0) return;
    if (Number.isFinite(dt) && dt > 0) this.left -= dt;
    if (this.left <= 0) this.dismiss();
  }

  dispose(): void {
    this.unlisten();
    this.element.remove();
  }
}
