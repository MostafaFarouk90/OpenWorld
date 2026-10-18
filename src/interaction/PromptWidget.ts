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

const COST_MARK = '\u0000';

/**
 * Formats one prompt line. The interactable's `promptParams` come first and the core's `key` and `name` win; a
 * non-empty `{cost}` is wrapped in `<span class="prompt-cost">` (v0.5 CSS hook). Returns the cache key.
 */
function renderLine(
  el: HTMLElement,
  doc: Pick<Document, 'createElement'>,
  deps: PromptWidgetDeps,
  key: string,
  params: Record<string, string | number>,
  last: string,
): string {
  const cost = params.cost;
  const hasCost = cost !== undefined && String(cost) !== '';
  const text = deps.text(key, hasCost ? { ...params, cost: COST_MARK } : params);
  const cacheKey = hasCost ? `${text}|${String(cost)}` : text;
  if (cacheKey === last) return last;
  const parts = hasCost ? text.split(COST_MARK) : [text];
  if (parts.length === 1) {
    el.textContent = parts[0];
    return cacheKey;
  }
  el.textContent = '';
  parts.forEach((part, i) => {
    if (i > 0) {
      const span = doc.createElement('span');
      span.className = 'prompt-cost';
      span.textContent = String(cost);
      el.appendChild(span);
    }
    if (!part) return;
    const span = doc.createElement('span');
    span.textContent = part;
    el.appendChild(span);
  });
  return cacheKey;
}

function paramsOf(i: { promptParams?(): Record<string, string | number> }, key: string, name: string) {
  let extra: Record<string, string | number> = {};
  try {
    extra = i.promptParams?.() ?? {};
  } catch {
    extra = {};
  }
  return { ...extra, key, name };
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
        lastMercy = renderLine(mercy, doc, deps, m.promptKey ?? 'interact.mercy', paramsOf(m, deps.mercyGlyph?.() ?? '', m.name ?? ''), lastMercy);
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
      lastText = renderLine(label, doc, deps, f.promptKey ?? `interact.${f.kind}`, paramsOf(f, deps.glyph(), f.name ?? ''), lastText);
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
