// Act 5 N9 (plans/act5-N9.md sections 5 to 7): one full-screen overlay for "The Rim holds", the epilogue slides and the credits.
// Data in, a promise out; N11 PR 2 and N12 supply the data and decide when (and hold autosave while `active()`).
import type { DocumentLike, ElementLike } from '../dom';
import { makeEl, setShown, type HudWidgetView, type Translate } from '../widget';
import { SlideModel, type SlideDeck } from './slides';
import { CreditsModel, type CreditsDef, type VerseStep } from './credits';

export interface KeyEvt {
  repeat?: boolean;
  key?: string;
  code?: string;
}
export interface KeySource2 {
  addEventListener(type: 'keydown' | 'keyup', listener: (e: KeyEvt) => void): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: (e: KeyEvt) => void): void;
}

export const SCREEN_ARM_S = 0.5;
export const SKIP_HOLD_S = 1.5;
export const FADE_S = 0.4;

type Mode = 'phase' | 'slides' | 'credits';

export interface Act5ScreensService {
  showPhaseCard(id: string, lines: readonly string[], titleKey?: string): Promise<void>;
  showEpilogue(deck: SlideDeck): Promise<void>;
  showCredits(def: CreditsDef, opts?: { onStep?: (s: VerseStep) => void }): Promise<void>;
  /** A screen is open: callers hold autosave while this is true. */
  active(): boolean;
  /** Headless: close the phase card, advance a slide, or finish the credits. */
  advance(): void;
  finish(): void;
}

export interface Act5ScreensSource {
  t: Translate;
  keys?: KeySource2 | null;
  reducedMotion?(): boolean;
  closed?(kind: 'phaseCard' | 'epilogue' | 'credits', id?: string): void;
  slide?(n: number): void;
}

export class Act5Screens implements HudWidgetView, Act5ScreensService {
  readonly id = 'act5-screens';
  readonly element: ElementLike;
  private readonly body: ElementLike;
  private readonly hint: ElementLike;
  private mode: Mode | null = null;
  private resolve: (() => void) | null = null;
  private phaseId = '';
  private slides: SlideModel | null = null;
  private credits: CreditsModel | null = null;
  private age = 0;
  private fade = 0;
  private held = 0;
  private escDown = false;
  private readonly onDown = (e: KeyEvt): void => {
    if (!this.mode) return;
    const esc = e?.key === 'Escape' || e?.code === 'Escape';
    if (esc) {
      this.escDown = true;
      return;
    }
    if (e?.repeat || this.age < SCREEN_ARM_S) return;
    if ((e?.key === 'ArrowLeft' || e?.code === 'ArrowLeft') && this.mode === 'slides') {
      this.slides?.back();
      this.fade = 0;
      this.render();
      return;
    }
    if (this.mode === 'credits') {
      // Any key skips only by holding (the roll is long and wants to be seen); a tap does nothing.
      return;
    }
    this.advance();
  };
  private readonly onUp = (e: KeyEvt): void => {
    if (e?.key === 'Escape' || e?.code === 'Escape') {
      this.escDown = false;
      this.held = 0;
    }
  };

  constructor(
    private readonly doc: DocumentLike,
    private readonly src: Act5ScreensSource,
  ) {
    this.element = makeEl(doc, 'div', 'owg-act5-screen');
    this.body = makeEl(doc, 'div', 'owg-act5-body', this.element);
    this.hint = makeEl(doc, 'div', 'owg-act5-hint', this.element);
    this.element.onclick = () => {
      if (this.mode && this.mode !== 'credits' && this.age >= SCREEN_ARM_S) this.advance();
    };
    setShown(this.element, false);
    src.keys?.addEventListener('keydown', this.onDown);
    src.keys?.addEventListener('keyup', this.onUp);
  }

  active(): boolean {
    return this.mode !== null;
  }

  get currentMode(): Mode | null {
    return this.mode;
  }
  get slideModel(): SlideModel | null {
    return this.slides;
  }
  get creditsModel(): CreditsModel | null {
    return this.credits;
  }

  private open(mode: Mode): Promise<void> {
    // A second screen replaces the first (the first closes as skipped), never stacks.
    if (this.mode) this.close();
    this.mode = mode;
    this.age = 0;
    this.fade = 0;
    this.held = 0;
    setShown(this.element, true);
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  showPhaseCard(id: string, lines: readonly string[], titleKey = 'hud.phase.rimHolds.title'): Promise<void> {
    const p = this.open('phase');
    this.phaseId = id;
    this.body.replaceChildren();
    makeEl(this.doc, 'h2', 'owg-act5-title', this.body).textContent = this.src.t(titleKey);
    for (const l of lines) makeEl(this.doc, 'p', 'owg-act5-line', this.body).textContent = l;
    this.hint.textContent = this.src.t('hud.epilogue.next');
    return p;
  }

  showEpilogue(deck: SlideDeck): Promise<void> {
    const p = this.open('slides');
    this.slides = new SlideModel(deck);
    this.hint.textContent = this.src.t('hud.epilogue.skip');
    if (this.slides.finished) this.close();
    else this.render();
    return p;
  }

  showCredits(def: CreditsDef, opts: { onStep?: (s: VerseStep) => void } = {}): Promise<void> {
    const p = this.open('credits');
    this.credits = new CreditsModel(def);
    this.credits.onStep = opts.onStep ?? null;
    this.hint.textContent = this.src.t('hud.credits.skip');
    if (this.credits.finished) this.close();
    else this.render();
    return p;
  }

  advance(): void {
    if (this.mode === 'phase') this.close();
    else if (this.mode === 'slides' && this.slides) {
      this.fade = 0;
      if (this.slides.next()) this.close();
      else this.render();
    } else if (this.mode === 'credits') this.finish();
  }

  finish(): void {
    if (this.mode === 'slides') {
      this.slides?.finish();
      this.close();
    } else if (this.mode === 'credits') {
      this.credits?.finish();
      this.close();
    } else if (this.mode === 'phase') this.close();
  }

  private render(): void {
    this.body.replaceChildren();
    if (this.mode === 'slides' && this.slides?.current) {
      const s = this.slides.current;
      const title = s.title ?? (s.titleKey ? this.src.t(s.titleKey) : '');
      if (title) makeEl(this.doc, 'h2', 'owg-act5-title', this.body).textContent = title;
      for (const l of s.lines) makeEl(this.doc, 'p', 'owg-act5-line', this.body).textContent = l;
      this.src.slide?.(this.slides.index);
    } else if (this.mode === 'credits' && this.credits) {
      const blocks = this.credits.def.blocks;
      const i = this.credits.blockIndex;
      const b = blocks[Math.max(0, i)];
      if (!b) return;
      if (b.kind === 'heading') {
        makeEl(this.doc, 'h2', 'owg-act5-title', this.body).textContent = b.text;
        for (const n of b.names ?? []) makeEl(this.doc, 'p', 'owg-act5-line', this.body).textContent = n;
      } else if (b.kind === 'verse') {
        for (const l of b.lines) makeEl(this.doc, 'p', 'owg-act5-line owg-act5-verse', this.body).textContent = l;
      } else {
        makeEl(this.doc, 'h2', 'owg-act5-title owg-act5-card', this.body).textContent = b.title;
        for (const l of b.lines) makeEl(this.doc, 'p', 'owg-act5-line', this.body).textContent = l;
      }
    }
  }

  private close(): void {
    const mode = this.mode;
    if (!mode) return;
    const id = this.phaseId;
    this.mode = null;
    this.slides = null;
    this.credits = null;
    this.escDown = false;
    this.held = 0;
    setShown(this.element, false);
    const done = this.resolve;
    this.resolve = null;
    this.src.closed?.(mode === 'phase' ? 'phaseCard' : mode === 'slides' ? 'epilogue' : 'credits', mode === 'phase' ? id : undefined);
    done?.();
  }

  update(dt = 0): void {
    if (!this.mode || !(dt > 0)) return;
    this.age += dt;
    this.fade = Math.min(FADE_S, this.fade + dt);
    const reduced = this.src.reducedMotion?.() === true;
    this.element.style.opacity = reduced ? '1' : String(Math.min(1, this.fade / FADE_S));
    if (this.escDown && this.mode !== 'phase') {
      this.held += dt;
      if (this.held >= SKIP_HOLD_S) {
        this.finish();
        return;
      }
    }
    if (this.mode === 'credits' && this.credits) {
      const before = this.credits.blockIndex;
      if (this.credits.update(dt)) this.close();
      else if (this.credits.blockIndex !== before) this.render();
    }
  }

  dispose(): void {
    this.src.keys?.removeEventListener('keydown', this.onDown);
    this.src.keys?.removeEventListener('keyup', this.onUp);
    this.element.remove();
  }
}
