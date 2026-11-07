// Act 5 N9 (plans/act5-N9.md section 6): the epilogue slide screen's model. Pure: any string list in, a current slide out.
export interface SlideDef {
  titleKey?: string;
  title?: string;
  lines: readonly string[];
}

export interface SlideDeck {
  /** Who speaks (a display name); omitted for the ballad slide. */
  speaker?: string;
  slides: readonly SlideDef[];
}

export class SlideModel {
  private readonly slides: SlideDef[];
  private n = 0;
  private done = false;

  constructor(readonly deck: SlideDeck) {
    this.slides = (deck?.slides ?? [])
      .map((s) => ({ ...s, lines: (s?.lines ?? []).filter((l) => typeof l === 'string' && l.trim() !== '') }))
      .filter((s) => s.lines.length > 0 || !!s.title || !!s.titleKey);
    if (this.slides.length === 0) this.done = true;
  }

  get index(): number {
    return this.n;
  }
  get count(): number {
    return this.slides.length;
  }
  get finished(): boolean {
    return this.done;
  }
  get current(): SlideDef | null {
    return this.done ? null : (this.slides[this.n] ?? null);
  }

  /** Next slide; past the last it finishes. Returns whether it just finished. */
  next(): boolean {
    if (this.done) return false;
    if (this.n + 1 >= this.slides.length) {
      this.done = true;
      return true;
    }
    this.n += 1;
    return false;
  }

  back(): void {
    if (!this.done && this.n > 0) this.n -= 1;
  }

  finish(): boolean {
    if (this.done) return false;
    this.done = true;
    return true;
  }
}
