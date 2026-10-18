import type { InteractionSystem } from './InteractionSystem';

export interface PromptWidgetDeps {
  interaction: InteractionSystem;
  text: (key: string, params: Record<string, string | number>) => string;
  glyph: () => string;
  /** Glyph of the mercy key (empty string if omitted). */
  mercyGlyph?: () => string;
  doc?: Pick<Document, 'createElement'>;
}

export interface PromptWidget {
  id: 'core.interaction-prompt';
  element: HTMLElement;
  order: 0;
  update(frameTime: number): void;
  dispose(): void;
}

/** "[F] Open door" with a hold ring; hidden when nothing is focused. */
export function createPromptWidget(deps: PromptWidgetDeps): PromptWidget {
  const doc = deps.doc ?? document;
  const element = doc.createElement('div');
  const label = doc.createElement('span');
  const ring = doc.createElement('div');
  const mercy = doc.createElement('span');
  element.className = 'interaction-prompt';
  label.className = 'interaction-prompt__text';
  mercy.className = 'interaction-prompt__mercy';
  mercy.style.display = 'none';
  ring.className = 'interaction-prompt__ring';
  element.appendChild(label);
  element.appendChild(ring);
  element.appendChild(mercy);
  element.style.display = 'none';
  let shown = false;
  let lastText = '';
  let lastRing = '';
  let lastMercy = '';
  let mercyShown = false;

  return {
    id: 'core.interaction-prompt',
    element,
    order: 0,
    update() {
      const f = deps.interaction.focus;
      const m = deps.interaction.focusFor?.('mercy') ?? null;
      if (m) {
        const t = deps.text(m.promptKey ?? 'interact.mercy', { key: deps.mercyGlyph?.() ?? '', name: m.name ?? '' });
        if (t !== lastMercy) {
          mercy.textContent = t;
          lastMercy = t;
        }
        if (!mercyShown) {
          mercy.style.display = '';
          mercyShown = true;
        }
      } else if (mercyShown) {
        mercy.style.display = 'none';
        mercyShown = false;
      }
      if (!f) {
        // The first line is hidden; a mercy line alone keeps the widget visible.
        if (label.style.display !== 'none') label.style.display = 'none';
        ring.style.display = 'none';
        const want = mercyShown;
        if (want !== shown) {
          element.style.display = want ? '' : 'none';
          shown = want;
        }
        return;
      }
      if (label.style.display === 'none') label.style.display = '';
      const text = deps.text(f.promptKey ?? `interact.${f.kind}`, { key: deps.glyph(), name: f.name ?? '' });
      if (text !== lastText) {
        label.textContent = text;
        lastText = text;
      }
      const width = `${Math.round(Math.min(1, Math.max(0, deps.interaction.holdProgress)) * 100)}%`;
      if (width !== lastRing) {
        ring.style.width = width;
        lastRing = width;
      }
      ring.style.display = (f.holdSeconds ?? 0) > 0 ? '' : 'none';
      if (!shown) {
        element.style.display = '';
        shown = true;
      }
    },
    dispose() {
      element.remove();
    },
  };
}
