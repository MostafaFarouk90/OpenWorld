import type { DocumentLike, ElementLike } from '../hud/dom';
import type { PromptRow } from './types';

export class PromptList {
  readonly element: ElementLike;

  constructor(private readonly doc: DocumentLike) {
    this.element = doc.createElement('div');
    this.element.className = 'owg-prompts';
  }

  render(rows: PromptRow[]): void {
    this.element.replaceChildren(
      ...rows.map((r) => {
        const el = this.doc.createElement('div');
        el.className = 'owg-prompt';
        this.fill(el, r);
        el.style.opacity = String(r.opacity);
        el.setAttribute('data-mechanic', r.mechanic);
        el.setAttribute('data-state', r.state);
        return el;
      }),
    );
  }

  /** The text with its first key glyph as a keycap (`<kbd class="owg-key">`); plain text when there is none. */
  private fill(el: ElementLike, r: PromptRow): void {
    const at = r.key ? (r.keyAt !== undefined && r.text.startsWith(r.key, r.keyAt) ? r.keyAt : r.text.indexOf(r.key)) : -1;
    if (!r.key || at < 0) {
      el.textContent = r.text;
      return;
    }
    const part = (tag: string, text: string, cls = ''): ElementLike => {
      const n = this.doc.createElement(tag);
      if (cls) n.className = cls;
      n.textContent = text;
      return n;
    };
    el.textContent = null;
    el.replaceChildren(part('span', r.text.slice(0, at)), part('kbd', r.key, 'owg-key'), part('span', r.text.slice(at + r.key.length)));
  }
}
