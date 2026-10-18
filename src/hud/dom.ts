/** Minimal DOM surface the HUD renderers use, so they run against a stub in node tests. */
export interface ElementLike {
  className: string;
  textContent: string | null;
  readonly style: Record<string, string>;
  readonly children: ElementLike[];
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(...nodes: ElementLike[]): void;
  replaceChildren(...nodes: ElementLike[]): void;
  remove(): void;
}

export interface DocumentLike {
  createElement(tag: string): ElementLike;
}

/** Stub implementation for tests (not exported to the game bundle by any plugin). */
export class StubElement implements ElementLike {
  className = '';
  textContent: string | null = null;
  readonly style: Record<string, string> = {};
  children: ElementLike[] = [];
  parent: StubElement | null = null;
  private attrs = new Map<string, string>();
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  append(...nodes: ElementLike[]): void {
    for (const n of nodes) {
      (n as StubElement).parent = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes: ElementLike[]): void {
    this.children = [];
    this.append(...nodes);
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
}

export class StubDocument implements DocumentLike {
  createElement(tag: string): ElementLike {
    return new StubElement(tag);
  }
}

/** Collects all text in an element tree, space separated; handy in tests. */
export function textOf(el: ElementLike): string {
  const parts: string[] = [];
  const walk = (e: ElementLike): void => {
    if (e.textContent) parts.push(e.textContent);
    e.children.forEach(walk);
  };
  walk(el);
  return parts.join(' ');
}
