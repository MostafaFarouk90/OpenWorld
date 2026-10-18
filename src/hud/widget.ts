import type { DocumentLike, ElementLike } from './dom';

export interface HudWidgetView {
  id: string;
  element: ElementLike;
  update(frameTime?: number): void;
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

/** Calls a soft reader; a missing reader, a throw or a nullish result all give undefined (the widget hides). */
export function safeRead<T>(read: (() => T | null | undefined) | undefined): T | undefined {
  if (!read) return undefined;
  try {
    return read() ?? undefined;
  } catch {
    return undefined;
  }
}

/** Clamps to 0..1; NaN and non-numbers give 0. */
export function clamp01(n: unknown): number {
  return typeof n === 'number' && n > 0 ? (n < 1 ? n : 1) : 0;
}
