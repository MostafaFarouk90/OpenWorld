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
        el.textContent = r.text;
        el.style.opacity = String(r.opacity);
        el.setAttribute('data-mechanic', r.mechanic);
        el.setAttribute('data-state', r.state);
        return el;
      }),
    );
  }
}
