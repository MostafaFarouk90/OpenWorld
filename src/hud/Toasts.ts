import type { DocumentLike, ElementLike } from './dom';
import type { HudWidgetView } from './widget';

const SHOW_SECONDS = 2.5;
const MAX_TOASTS = 3;

/** Short messages in the toast slot; each lives a couple of seconds and the oldest drops past three. */
export class Toasts implements Omit<HudWidgetView, 'update'> {
  readonly id = 'toasts';
  readonly element: ElementLike;
  private readonly live: { el: ElementLike; left: number }[] = [];

  constructor(private readonly doc: DocumentLike) {
    this.element = doc.createElement('div');
    this.element.className = 'owg-toasts';
  }

  show(text: string): void {
    if (!text) return;
    const el = this.doc.createElement('div');
    el.className = 'owg-toast';
    el.textContent = text;
    this.element.append(el);
    this.live.push({ el, left: SHOW_SECONDS });
    while (this.live.length > MAX_TOASTS) this.live.shift()?.el.remove();
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const t of [...this.live]) {
      t.left -= dt;
      if (t.left <= 0) {
        t.el.remove();
        this.live.splice(this.live.indexOf(t), 1);
      }
    }
  }

  dispose(): void {
    this.live.length = 0;
    this.element.replaceChildren();
    this.element.remove();
  }
}
