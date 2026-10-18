import type { HudWidget } from '../ui/HudLayer';
import { MAP_TUNING } from './tuning';
import type { MapViewModel } from './viewTypes';

export const MINIMAP_SIZE = 160;

export interface MinimapDeps {
  model: MapViewModel;
  doc?: Pick<Document, 'createElement'>;
}

export interface MinimapWidget extends HudWidget {
  update(frameTime: number): void;
  dispose(): void;
  readonly stats: { draws: number; tileBuilds: number };
}

export function createMinimap(deps: MinimapDeps): MinimapWidget {
  const doc = deps.doc ?? document;
  const model = deps.model;
  const R = MINIMAP_SIZE / 2;
  const element = doc.createElement('div');
  const canvas = doc.createElement('canvas') as HTMLCanvasElement;
  element.className = 'minimap';
  element.setAttribute?.('role', 'img');
  element.setAttribute?.('aria-label', model.t('map.minimap.label'));
  Object.assign(element.style, {
    width: `${MINIMAP_SIZE}px`, height: `${MINIMAP_SIZE}px`, borderRadius: '50%', overflow: 'hidden',
    background: '#10121a', border: '2px solid rgba(255,255,255,0.35)', boxSizing: 'content-box',
  });
  canvas.width = MINIMAP_SIZE;
  canvas.height = MINIMAP_SIZE;
  Object.assign(canvas.style, { width: `${MINIMAP_SIZE}px`, height: `${MINIMAP_SIZE}px`, display: 'block', borderRadius: '50%' });
  element.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const stats = { draws: 0, tileBuilds: 0 };

  let tileLayer: HTMLCanvasElement | null = null;
  let tileBitmap: unknown = null;
  let acc = 0;
  let drawnOnce = false;
  let disposed = false;

  function buildTile(bitmap: { width: number; height: number; pixels: Uint8ClampedArray }): HTMLCanvasElement | null {
    if (tileLayer && tileBitmap === bitmap) return tileLayer;
    const layer = tileLayer ?? (doc.createElement('canvas') as HTMLCanvasElement);
    layer.width = bitmap.width;
    layer.height = bitmap.height;
    const lctx = layer.getContext('2d');
    if (!lctx) return null;
    const img = lctx.createImageData(bitmap.width, bitmap.height);
    img.data.set(bitmap.pixels);
    lctx.putImageData(img, 0, 0);
    tileLayer = layer;
    tileBitmap = bitmap;
    stats.tileBuilds++;
    return layer;
  }

  function draw(): boolean {
    const tile = model.minimapTile();
    if (!ctx || !tile) return false;
    const layer = buildTile(tile.bitmap);
    if (!layer) return false;
    stats.draws++;
    const pl = model.player();
    // Display pixels per tile pixel, and metres per display pixel.
    const scale = MINIMAP_SIZE / tile.bitmap.width;
    const mPerPx = MAP_TUNING.minimapMetresPerPixel / scale;
    const tileW = tile.bitmap.width * scale;
    const tileH = tile.bitmap.height * scale;

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#10121a';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.translate(R, R);
    // World is rotated so the camera yaw points up.
    ctx.rotate(pl.yaw);
    const dx = (pl.x - tile.centerX) / mPerPx;
    const dz = (pl.z - tile.centerZ) / mPerPx;
    ctx.drawImage(layer, -dx - tileW / 2, -dz - tileH / 2, tileW, tileH);

    const edge = R - 5;
    for (const m of model.markers()) {
      if (m.kind !== 'waystone') continue;
      let ox = (m.x - pl.x) / mPerPx;
      let oz = (m.z - pl.z) / mPerPx;
      const d = Math.hypot(ox, oz);
      const out = d > edge;
      if (out) {
        ox = (ox / d) * edge;
        oz = (oz / d) * edge;
      }
      ctx.beginPath();
      ctx.arc(ox, oz, out ? 3 : 4, 0, Math.PI * 2);
      if (m.state === 'rekindled') {
        ctx.fillStyle = '#ff8a3d';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(R, R, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    return true;
  }

  return {
    id: 'map.minimap',
    element,
    order: 10,
    stats,
    update(frameTime: number) {
      if (disposed) return;
      acc += Number.isFinite(frameTime) && frameTime > 0 ? frameTime : 0;
      if (drawnOnce && acc < 1 / MAP_TUNING.minimapRedrawHz) return;
      if (draw()) {
        drawnOnce = true;
        acc = 0;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      tileLayer = null;
      tileBitmap = null;
      ctx?.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      element.remove();
    },
  };
}
