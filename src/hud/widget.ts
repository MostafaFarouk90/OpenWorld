import type { DocumentLike, ElementLike } from './dom';

export interface HudWidgetView {
  id: string;
  element: ElementLike;
  update(): void;
  dispose(): void;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function makeEl(doc: DocumentLike, tag: string, className: string, parent?: ElementLike): ElementLike {
  const el = doc.createElement(tag);
  el.className = className;
  if (parent) parent.append(el);
  return el;
}

export function setShown(el: ElementLike, shown: boolean, display = 'block'): void {
  el.style.display = shown ? display : 'none';
}

/** Percent string for a CSS width, rounded to two decimals. */
export function pct(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`;
}
