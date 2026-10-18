/** Tiny DOM stand in for node tests. Only what the journal tabs touch. */
export class FakeEl {
  className = '';
  textContent = '';
  readonly style: Record<string, string> = {};
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  attrs = new Map<string, string>();
  connected = true;
  constructor(readonly ownerDocument: { createElement(t: string): FakeEl }) {}
  get isConnected(): boolean { return this.connected; }
  appendChild(c: FakeEl): FakeEl { c.parentElement = this; this.children.push(c); return c; }
  append(...cs: FakeEl[]): void { for (const c of cs) this.appendChild(c); }
  replaceChildren(): void { this.children = []; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  all(): FakeEl[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  byClass(cls: string): FakeEl[] { return this.all().filter((e) => e.className === cls); }
}
export const fakeDoc = { createElement: (_t: string): FakeEl => new FakeEl(fakeDoc) };
export const fakeRoot = (): HTMLElement => new FakeEl(fakeDoc) as unknown as HTMLElement;
export const asFake = (e: unknown): FakeEl => e as FakeEl;
