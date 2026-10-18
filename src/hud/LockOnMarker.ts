import type { DocumentLike } from './dom';
import { makeEl, setShown, type HudWidgetView } from './widget';

export interface LockOnSource {
  /** Screen position in CSS pixels, already projected by the plugin; null = no (or dead) target. */
  targetScreen(): { x: number; y: number; behind: boolean } | null;
  viewport(): { width: number; height: number };
}

export interface LockOnPlacement {
  x: number;
  y: number;
  offscreen: boolean;
  /** Degrees, 0 = pointing right; only meaningful when offscreen. */
  rotation: number;
}

export const LOCK_ON_MARGIN = 24;

export function lockOnPlacement(
  target: { x: number; y: number; behind: boolean } | null,
  vp: { width: number; height: number },
  margin = LOCK_ON_MARGIN,
): LockOnPlacement | null {
  if (!target || target.behind) return null;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  if (!(vp.width > 0) || !(vp.height > 0)) return null;
  const offscreen = target.x < 0 || target.x > vp.width || target.y < 0 || target.y > vp.height;
  if (!offscreen) return { x: target.x, y: target.y, offscreen: false, rotation: 0 };
  const m = Math.min(margin, vp.width / 2, vp.height / 2);
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const rotation = (Math.atan2(target.y - cy, target.x - cx) * 180) / Math.PI;
  return {
    x: Math.min(vp.width - m, Math.max(m, target.x)),
    y: Math.min(vp.height - m, Math.max(m, target.y)),
    offscreen: true,
    rotation: Math.round(rotation * 100) / 100,
  };
}

export class LockOnMarker implements HudWidgetView {
  readonly id = 'lock-on';
  readonly element;
  private readonly marker;

  constructor(
    doc: DocumentLike,
    private readonly source: LockOnSource,
  ) {
    this.element = makeEl(doc, 'div', 'owg-lockon-layer');
    this.marker = makeEl(doc, 'div', 'owg-lockon', this.element);
    this.update();
  }

  update(): void {
    const p = lockOnPlacement(this.source.targetScreen(), this.source.viewport());
    setShown(this.marker, !!p);
    if (!p) return;
    this.marker.className = p.offscreen ? 'owg-lockon owg-lockon-arrow' : 'owg-lockon';
    this.marker.style.left = `${Math.round(p.x)}px`;
    this.marker.style.top = `${Math.round(p.y)}px`;
    this.marker.style.transform = p.offscreen ? `translate(-50%, -50%) rotate(${p.rotation}deg)` : 'translate(-50%, -50%)';
  }

  dispose(): void {
    this.element.remove();
  }
}
