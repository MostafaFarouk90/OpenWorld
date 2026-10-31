import type { DocumentLike } from '../dom';
import { makeEl, pct, safeRead, setShown, type HudWidgetView, type Translate } from '../widget';
import { ACT3_HUD_STRINGS_EN } from './strings.en';
import { GLIDE_TUNING } from '../../movement/types';

/** Net climb or sink (m/s) inside this band reads as level flight. */
export const GLIDE_LEVEL_BAND = 0.5;

export interface GlideReading {
  state: string;
  yaw: number;
  /** Null when no lane is known: the lane bar hides, the rest stays. */
  heading: number | null;
  laneHalfAngle: number | null;
  lift: number;
  heightAboveGround: number;
}

export interface GlideIndicatorSource {
  /** K7's `glide` service; undefined when the service is missing. Read every frame. */
  glide?(): GlideReading | null | undefined;
  /** The interact key's glyph, for the let-go hint. */
  glyph?(): string;
  t?: Translate;
}

const defaultT: Translate = (key, p) => (ACT3_HUD_STRINGS_EN[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (p && k in p ? String(p[k]) : m));

const TWO_PI = Math.PI * 2;
/** Wraps an angle to (-pi, pi]; NaN stays NaN. */
export function wrapPi(a: number): number {
  if (!Number.isFinite(a)) return NaN;
  const r = a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
  // The floor maps +pi to -pi; keep +pi as it is so an edge reads the same from both sides.
  return r === -Math.PI ? Math.PI : r;
}

/** Where the glide's yaw sits in its lane: -1 at the left edge, 0 on the heading, 1 at the right edge, clamped past them. */
export function laneOffset(yaw: number, heading: number, halfAngle: number): number | null {
  if (!(halfAngle > 0) || !Number.isFinite(halfAngle)) return null;
  const d = wrapPi(yaw - heading);
  if (!Number.isFinite(d)) return null;
  return Math.max(-1, Math.min(1, d / halfAngle));
}

export type LiftTrend = 'rising' | 'level' | 'sinking';
/** Lift against the sink rate: above it the glide climbs, below it the glide falls. */
export function liftTrend(lift: number): LiftTrend | null {
  if (!Number.isFinite(lift)) return null;
  const net = lift - GLIDE_TUNING.sinkRate;
  return net > GLIDE_LEVEL_BAND ? 'rising' : net < -GLIDE_LEVEL_BAND ? 'sinking' : 'level';
}

const ARROWS: Record<LiftTrend, string> = { rising: '↑', level: '→', sinking: '↓' };

/**
 * Glide indicator (bottom-centre), polled each frame like the breath meter: shown only while the glide state is `gliding`,
 * so it hides on landing, after a let-go or a contained end, and after a load. The let-go hint rides with the same state
 * K7's `glide:let-go` interactable is enabled on. A bad value hides its own part, not the whole widget.
 */
export class GlideIndicator implements HudWidgetView {
  readonly id = 'glide-indicator';
  readonly element;
  private readonly lane;
  private readonly marker;
  private readonly lift;
  private readonly height;
  private readonly hint;
  private readonly t: Translate;
  private shown = false;

  constructor(doc: DocumentLike, private readonly source: GlideIndicatorSource = {}) {
    this.t = source.t ?? defaultT;
    this.element = makeEl(doc, 'div', 'owg-glide');
    this.element.setAttribute('aria-label', this.t('act3.hud.glide'));
    this.lane = makeEl(doc, 'div', 'owg-glide-lane', this.element);
    this.lane.setAttribute('role', 'img');
    // The lane's edges are the bar's two ends; the centre tick is the heading.
    makeEl(doc, 'div', 'owg-glide-centre', this.lane);
    this.marker = makeEl(doc, 'div', 'owg-glide-marker', this.lane);
    const row = makeEl(doc, 'div', 'owg-glide-row', this.element);
    this.lift = makeEl(doc, 'span', 'owg-glide-lift', row);
    this.height = makeEl(doc, 'span', 'owg-glide-height', row);
    this.hint = makeEl(doc, 'div', 'owg-glide-hint', this.element);
    setShown(this.element, false);
  }

  update(): void {
    const g = safeRead(this.source.glide);
    const ok = !!g && typeof g === 'object' && g.state === 'gliding';
    if (ok) {
      const off = typeof g.heading === 'number' && typeof g.laneHalfAngle === 'number' ? laneOffset(g.yaw, g.heading, g.laneHalfAngle) : null;
      setShown(this.lane, off !== null);
      if (off !== null) this.marker.style.left = pct((off + 1) / 2);
      const trend = liftTrend(g.lift);
      setShown(this.lift, trend !== null, 'inline');
      if (trend) {
        this.lift.textContent = `${ARROWS[trend]} ${this.t(`act3.hud.glide.${trend}`)}`;
        this.lift.className = `owg-glide-lift owg-glide-${trend}`;
      }
      const h = g.heightAboveGround;
      const hOk = typeof h === 'number' && Number.isFinite(h);
      setShown(this.height, hOk, 'inline');
      if (hOk) this.height.textContent = this.t('act3.hud.glide.height', { m: Math.max(0, Math.round(h)) });
      this.hint.textContent = this.t('act3.hud.glide.letGo', { key: safeRead(this.source.glyph) ?? '?' });
    }
    if (ok !== this.shown) {
      this.shown = ok;
      setShown(this.element, ok);
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
