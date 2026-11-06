import type { DocumentLike } from '../dom';
import { makeEl, pct, safeRead, setShown, type HudWidgetView, type Translate } from '../widget';
import { ACT4_HUD_STRINGS_EN } from './strings.en';
import { EXPOSURE } from '../../weather/tuning';
import type { WeatherKind } from '../../weather/types';

/** One frame's reading of L3's weather, as the meter needs it. Undefined (or a throw) hides the meter. */
export interface StormReading {
  /** The player is outdoors in a storm region (the Waste). Outside it the meter hides. */
  inRegion: boolean;
  kind: WeatherKind;
  /** Seconds into the current kind. */
  t: number;
  forced: boolean;
  held: boolean;
  /** Seconds to the clock's next change (L3's relative `clock.next().at`); null when unknown. */
  nextIn: number | null;
  /** Seconds of continuous exposure so far (0 when safe). */
  exposed: number;
  onRope: boolean;
  sheltered: boolean;
  /** The player's health at the exposure floor (exposure takes no more). */
  atFloor?: boolean;
}

export interface StormMeterSource {
  read?(): StormReading | null | undefined;
  /** The Ash Shroud Mask removes the visibility penalty (L3's `maskActive`). */
  mask?(): boolean;
  /** The chip shows only once the player can have a mask (`story.m42.started`). */
  maskKnown?(): boolean;
  t?: Translate;
}

const defaultT: Translate = (key, params) =>
  (ACT4_HUD_STRINGS_EN[key] ?? key).replace(/\{(\w+)\}/g, (_, n: string) => String(params?.[n] ?? `{${n}}`));

/** m:ss, whole seconds rounded up (a countdown never shows 0:00 while time is left). */
export function clockText(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type StormLine = 'exposed' | 'floor' | 'rope' | 'shelter' | null;

/** What the meter draws for a reading: pure, so every phase is tested without a DOM. */
export interface StormView {
  phase: WeatherKind;
  textKey: string;
  params?: Record<string, string | number>;
  /** Bar fill, 0..1: the time left in the phase (clear fills toward the warning). */
  fill: number;
  line: StormLine;
}

export function stormView(r: StormReading): StormView | null {
  if (!r || !r.inRegion) return null;
  const left = typeof r.nextIn === 'number' && Number.isFinite(r.nextIn) ? Math.max(0, r.nextIn) : null;
  const into = Number.isFinite(r.t) ? Math.max(0, r.t) : 0;
  // The fraction of the phase still to run; a forced or held phase has no clock to show.
  const remaining = left === null ? 1 : left + into > 0 ? left / (left + into) : 1;
  if (r.kind === 'clear') {
    if (r.held || left === null) return { phase: 'clear', textKey: 'act4.hud.storm.clearHeld', fill: 1, line: null };
    // The clear bar fills up toward the warning, so a full bar reads "ash is coming".
    return { phase: 'clear', textKey: 'act4.hud.storm.clear', params: { time: clockText(left) }, fill: 1 - remaining, line: null };
  }
  // Safe places read the same in the warning as in the storm, so the shelter arrow never points from a shelter or a rope.
  let line: StormLine = null;
  if (r.sheltered) line = 'shelter';
  else if (r.onRope) line = 'rope';
  else if (r.kind === 'storm') {
    if (r.atFloor && r.exposed > 0) line = 'floor';
    else if (r.exposed > 0) line = 'exposed';
  }
  if (r.kind === 'warning') {
    return { phase: 'warning', textKey: 'act4.hud.storm.warning', params: { time: clockText(left ?? 0) }, fill: remaining, line };
  }
  if (r.forced || left === null) return { phase: 'storm', textKey: 'act4.hud.storm.stormForced', fill: 1, line };
  return { phase: 'storm', textKey: 'act4.hud.storm.storm', params: { time: clockText(left) }, fill: remaining, line };
}

const LINE_KEYS: Record<Exclude<StormLine, null>, string> = {
  exposed: 'act4.hud.storm.exposed',
  floor: 'act4.hud.storm.floor',
  rope: 'act4.hud.storm.rope',
  shelter: 'act4.hud.storm.shelter',
};

/**
 * The Waste's storm meter (top-center), polled each frame like the breath meter: shown only while L3 says the player is
 * outdoors in the Waste, so Harrowmark never shows the Waste's countdown and a load shows the right phase on its first frame.
 * Four phases: clear (time to the warning), warning, storm (time left; none while forced), and the exposure line under the
 * storm bar, replaced on a rope-line or in a shelter. The mask chip sits beside it from M42.
 */
export class StormMeter implements HudWidgetView {
  readonly id = 'act4-storm-meter';
  readonly element;
  private readonly text;
  private readonly fill;
  private readonly line;
  private readonly mask;
  private readonly t: Translate;
  private shown = false;
  private key = '';

  constructor(doc: DocumentLike, private readonly source: StormMeterSource = {}) {
    this.t = source.t ?? defaultT;
    this.element = makeEl(doc, 'div', 'owg-storm');
    this.element.setAttribute('aria-label', this.t('act4.hud.storm.label'));
    const head = makeEl(doc, 'div', 'owg-storm-head', this.element);
    this.text = makeEl(doc, 'span', 'owg-storm-text', head);
    this.mask = makeEl(doc, 'span', 'owg-storm-mask', head);
    const bar = makeEl(doc, 'div', 'owg-bar owg-bar-storm', this.element);
    this.fill = makeEl(doc, 'div', 'owg-bar-fill', bar);
    this.line = makeEl(doc, 'div', 'owg-storm-line', this.element);
    setShown(this.element, false);
  }

  /** The view drawn last (null while hidden); for tests and the shelter arrow. */
  view: StormView | null = null;

  update(): void {
    const r = safeRead(this.source.read);
    let v: StormView | null = null;
    try {
      v = r ? stormView(r) : null;
    } catch {
      v = null;
    }
    this.view = v;
    if (!v) {
      if (this.shown) {
        this.shown = false;
        this.key = '';
        setShown(this.element, false);
      }
      return;
    }
    const maskKnown = safeRead(this.source.maskKnown) === true;
    const masked = safeRead(this.source.mask) === true;
    // The chip: lit while masked; the warning line only matters while the ash is up.
    const chip = !maskKnown ? '' : masked ? 'on' : v.phase === 'clear' ? '' : 'off';
    const text = this.t(v.textKey, v.params);
    const lineText = v.line ? this.t(LINE_KEYS[v.line], { pct: Math.round(EXPOSURE.perTick * 100), s: EXPOSURE.interval }) : '';
    const key = `${v.phase}|${text}|${v.line}|${chip}|${Math.round(v.fill * 200)}`;
    if (key !== this.key) {
      this.key = key;
      this.element.className = `owg-storm owg-storm-${v.phase}${v.line === 'exposed' || v.line === 'floor' ? ' owg-storm-exposed' : ''}`;
      this.text.textContent = text;
      this.fill.style.width = pct(Math.min(1, Math.max(0, v.fill)));
      this.line.textContent = lineText;
      setShown(this.line, lineText !== '');
      this.mask.textContent = chip ? this.t(chip === 'on' ? 'act4.hud.mask.on' : 'act4.hud.mask.off') : '';
      this.mask.className = chip ? `owg-storm-mask owg-storm-mask-${chip}` : 'owg-storm-mask';
      setShown(this.mask, chip !== '', 'inline');
    }
    if (!this.shown) {
      this.shown = true;
      setShown(this.element, true);
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
