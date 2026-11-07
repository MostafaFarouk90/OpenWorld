import type { DocumentLike } from '../dom';
import { makeEl, safeRead, setShown, type HudWidgetView, type Translate } from '../widget';
import { ACT4_HUD_STRINGS_EN } from './strings.en';

export interface XZPoint {
  x: number;
  z: number;
}

export interface Refuge {
  kind: 'shelter' | 'rope';
  id: string;
  x: number;
  z: number;
  distance: number;
}

/**
 * The nearest place the storm cannot reach: the nearest shelter, or the nearest rope-line point when that is closer.
 * Pure. Non-finite points are skipped; nothing usable gives null.
 */
export function nearestRefuge(
  x: number,
  z: number,
  shelters: readonly ({ id: string } & XZPoint)[],
  rope?: ({ id: string } & XZPoint) | null,
): Refuge | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best: Refuge | null = null;
  for (const s of shelters) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (!best || d < best.distance) best = { kind: 'shelter', id: s.id, x: s.x, z: s.z, distance: d };
  }
  if (rope && Number.isFinite(rope.x) && Number.isFinite(rope.z)) {
    const d = Math.hypot(rope.x - x, rope.z - z);
    if (!best || d < best.distance) best = { kind: 'rope', id: rope.id, x: rope.x, z: rope.z, distance: d };
  }
  return best;
}

/**
 * The arrow's turn in degrees, clockwise on screen, for a target seen from `from` with the camera at `cameraYaw`.
 * Yaw 0 faces -Z and a positive yaw turns left (three.js about +Y), so a target dead ahead is 0 and one to the right is +90.
 */
export function arrowDegrees(from: XZPoint, to: XZPoint, cameraYaw: number): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  // The yaw that would face the target.
  const face = Math.atan2(-dx, -dz);
  let rel = (Number.isFinite(cameraYaw) ? cameraYaw : 0) - face;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const deg = (rel * 180) / Math.PI;
  return Math.round(deg * 10) / 10 || 0;
}

export interface ShelterArrowSource {
  /** Shown only while the meter says the ash is up and the player is unsafe. */
  active?(): boolean;
  player?(): XZPoint | null | undefined;
  cameraYaw?(): number;
  shelters?(): readonly ({ id: string } & XZPoint)[];
  /** The nearest point on a rope-line (L1's `nearestRope`), if any. */
  nearestRope?(x: number, z: number): ({ id: string } & XZPoint) | null | undefined;
  t?: Translate;
}

const defaultT: Translate = (key, params) =>
  (ACT4_HUD_STRINGS_EN[key] ?? key).replace(/\{(\w+)\}/g, (_, n: string) => String(params?.[n] ?? `{${n}}`));

/** The shelter marker under the storm meter: an arrow toward the nearest shelter or rope-line, and how far it is. */
export class ShelterArrow implements HudWidgetView {
  readonly id = 'act4-shelter-arrow';
  readonly element;
  private readonly arrow;
  private readonly text;
  private readonly t: Translate;
  private shown = false;
  private key = '';
  /** The refuge pointed at last (null while hidden). */
  target: Refuge | null = null;

  constructor(doc: DocumentLike, private readonly source: ShelterArrowSource = {}) {
    this.t = source.t ?? defaultT;
    this.element = makeEl(doc, 'div', 'owg-shelter');
    this.arrow = makeEl(doc, 'span', 'owg-shelter-arrow', this.element);
    this.arrow.textContent = '▲';
    this.text = makeEl(doc, 'span', 'owg-shelter-text', this.element);
    setShown(this.element, false, 'flex');
  }

  update(): void {
    const on = safeRead(this.source.active) === true;
    const p = on ? safeRead(this.source.player) : undefined;
    let r: Refuge | null = null;
    if (p) {
      const shelters = safeRead(this.source.shelters) ?? [];
      let rope: ({ id: string } & XZPoint) | null | undefined;
      try {
        rope = this.source.nearestRope?.(p.x, p.z);
      } catch {
        rope = null;
      }
      r = nearestRefuge(p.x, p.z, shelters, rope);
    }
    this.target = r;
    if (!r || !p) {
      if (this.shown) {
        this.shown = false;
        this.key = '';
        setShown(this.element, false, 'flex');
      }
      return;
    }
    const yaw = safeRead(this.source.cameraYaw) ?? 0;
    const deg = arrowDegrees(p, r, yaw);
    const m = Math.round(r.distance);
    const key = `${r.kind}|${m}|${Math.round(deg)}`;
    if (key !== this.key) {
      this.key = key;
      this.arrow.style.transform = `rotate(${Math.round(deg)}deg)`;
      this.text.textContent = this.t(r.kind === 'shelter' ? 'act4.hud.shelter.to' : 'act4.hud.rope.to', { m });
    }
    if (!this.shown) {
      this.shown = true;
      setShown(this.element, true, 'flex');
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.element.remove();
  }
}
