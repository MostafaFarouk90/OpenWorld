import type { DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { barFraction } from './StatusBars';
import { makeEl, pct, setShown, type HudWidgetView, type Translate } from './widget';

/** The Weeping Bellows' puzzle id. A9's second PR registers its puzzle under this id; the bar reads it by service, so a different id there is a one-line change here. */
export const BELLOWS_PUZZLE_ID = 'weeping-bellows';
export const PRESSURE_PHASE_ID = 'pressure';
/** Under this many seconds the bar flashes. */
export const PRESSURE_URGENT_SECONDS = 10;

export interface PressureBarSource {
  /** `puzzles.pressure(id)`: A9's sim-time clock, `{ remaining, total }` while the pressure phase runs, else null. */
  pressure?(id: string): { remaining: number; total: number } | null | undefined;
  /** Puzzle ids to watch (default: the Bellows). */
  ids?: readonly string[];
  t?: Translate;
}

/**
 * Countdown card for the Weeping Bellows. It shows what A9's sim-time clock says each `update(dt)` (no clock of its own,
 * so a paused sim pauses it), only for a watched puzzle id and only while that clock runs. Any other phase, a failure, a
 * solve or a load hides it at once.
 */
export class PressureBar implements HudWidgetView {
  readonly id = 'pressure-bar';
  readonly element;
  private readonly t: Translate;
  private readonly ids: readonly string[];
  private readonly label;
  private readonly fill;
  private hidden = new Set<string>();
  private shownId: string | null = null;

  constructor(
    doc: DocumentLike,
    private readonly source: PressureBarSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.ids = source.ids ?? [BELLOWS_PUZZLE_ID];
    this.element = makeEl(doc, 'div', 'owg-card owg-pressure');
    this.label = makeEl(doc, 'div', 'owg-pressure-label', this.element);
    const bar = makeEl(doc, 'div', 'owg-pressure-bar', this.element);
    this.fill = makeEl(doc, 'div', 'owg-pressure-fill', bar);
    setShown(this.element, false);
  }

  /** `puzzle.state`: a phase other than pressure hides the bar until the clock reports again. */
  state(id: string, phase: string): void {
    if (!this.ids.includes(id)) return;
    if (phase === PRESSURE_PHASE_ID) this.hidden.delete(id);
    else this.stop(id);
  }

  /** `puzzle.failed`, `puzzle.solved`. */
  stop(id: string): void {
    if (!this.ids.includes(id)) return;
    this.hidden.add(id);
    if (this.shownId === id) this.hide();
  }

  /** `save.loaded`: the room resets with no clock. */
  reset(): void {
    this.hidden = new Set(this.ids);
    this.hide();
  }

  get visible(): boolean {
    return this.shownId !== null;
  }

  private hide(): void {
    this.shownId = null;
    setShown(this.element, false);
  }

  update(): void {
    let found: { id: string; remaining: number; total: number } | null = null;
    for (const id of this.ids) {
      let p: { remaining: number; total: number } | null | undefined;
      try {
        p = this.source.pressure?.(id);
      } catch {
        p = null;
      }
      if (!p || !(p.total > 0) || !Number.isFinite(p.remaining)) {
        // The clock stopped by itself: the next one that starts is a new run.
        if (!p) this.hidden.delete(id);
        continue;
      }
      if (this.hidden.has(id)) continue;
      found = { id, remaining: Math.max(0, p.remaining), total: p.total };
      break;
    }
    if (!found) {
      if (this.shownId !== null) this.hide();
      return;
    }
    this.shownId = found.id;
    setShown(this.element, true);
    this.label.textContent = this.t('hud.pressure.label', { seconds: Math.ceil(found.remaining) });
    this.fill.style.width = pct(barFraction(found.remaining, found.total));
    this.element.className = found.remaining <= PRESSURE_URGENT_SECONDS ? 'owg-card owg-pressure owg-pressure-urgent' : 'owg-card owg-pressure';
  }

  dispose(): void {
    this.element.remove();
  }
}
