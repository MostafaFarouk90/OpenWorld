import type { InteractionSystem } from './InteractionSystem';

export interface PromptWidgetDeps {
  interaction: InteractionSystem;
  text: (key: string, params: Record<string, string | number>) => string;
  glyph: () => string;
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
  element.className = 'interaction-prompt';
  label.className = 'interaction-prompt__text';
  ring.className = 'interaction-prompt__ring';
  element.appendChild(label);
  element.appendChild(ring);
  element.style.display = 'none';
  let shown = false;
  let lastText = '';
  let lastRing = '';

  return {
    id: 'core.interaction-prompt',
    element,
    order: 0,
    update() {
      const f = deps.interaction.focus;
      if (!f) {
        if (shown) {
          element.style.display = 'none';
          shown = false;
        }
        return;
      }
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
