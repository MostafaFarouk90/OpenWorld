import type { HudWidget } from '../ui/HudLayer';
import { hitTestMarker, playerArrowPosition, selectionOrder, stepSelection, worldToMap, type MapMarker } from './MapModel';
import type { MapViewDeps } from './viewTypes';

/** Canvas edge in pixels (square). */
export const MAP_CANVAS_SIZE = 640;
/** Modal redraw rate. */
export const MAP_MODAL_REDRAW_HZ = 10;

const EMBER = '#ff8a3d';

export interface MapModalWidget extends HudWidget {
  update(frameTime: number): void;
  dispose(): void;
  /** Click at canvas pixel coordinates. */
  click(px: number, py: number): void;
  /** Keyboard `code` (ArrowLeft, Enter, KeyM, ...). */
  key(code: string): void;
  focusDefault(): void;
  readonly selectedId: string | null;
  /** Work counters, for tests and profiling. */
  readonly stats: { bitmapBuilds: number; fogBuilds: number; frames: number };
}

export function createMapModal(deps: MapViewDeps): MapModalWidget {
  const doc = deps.doc ?? document;
  const model = deps.model;
  const size = MAP_CANVAS_SIZE;

  const element = doc.createElement('div');
  const title = doc.createElement('h2');
  const canvas = doc.createElement('canvas') as HTMLCanvasElement;
  const status = doc.createElement('p');
  const hint = doc.createElement('p');
  element.className = 'map-modal';
  element.tabIndex = 0;
  Object.assign(element.style, {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
    position: 'absolute', inset: '0', background: 'rgba(8,8,12,0.92)', color: '#eee', outline: 'none',
  });
  title.className = 'map-modal__title';
  title.textContent = model.t('map.title');
  hint.className = 'map-modal__hint';
  hint.textContent = model.t('map.hint');
  status.className = 'map-modal__status';
  status.textContent = '';
  canvas.width = size;
  canvas.height = size;
  Object.assign(canvas.style, { width: 'min(80vh, 90vw)', height: 'min(80vh, 90vw)', cursor: 'pointer' });
  element.appendChild(title);
  element.appendChild(canvas);
  element.appendChild(status);
  element.appendChild(hint);

  const ctx = canvas.getContext('2d');
  const stats = { bitmapBuilds: 0, fogBuilds: 0, frames: 0 };

  // Cached layers.
  let terrainLayer: HTMLCanvasElement | null = null;
  let fogLayer: HTMLCanvasElement | null = null;
  let fogCount = -1;
  let fogRef: unknown = null;

  let selectedId: string | null = null;
  let acc = 0;
  let drawnOnce = false;
  let disposed = false;

  function buildTerrain(): void {
    const bmp = model.fullBitmap();
    if (!bmp || terrainLayer) return;
    const layer = doc.createElement('canvas') as HTMLCanvasElement;
    layer.width = bmp.width;
    layer.height = bmp.height;
    const lctx = layer.getContext('2d');
    if (!lctx) return;
    const img = lctx.createImageData(bmp.width, bmp.height);
    img.data.set(bmp.pixels);
    lctx.putImageData(img, 0, 0);
    terrainLayer = layer;
    stats.bitmapBuilds++;
  }

  function buildFog(): void {
    const fog = model.fog();
    if (fog === fogRef && fog.revealedCount === fogCount && fogLayer) return;
    fogRef = fog;
    fogCount = fog.revealedCount;
    const layer = fogLayer ?? (doc.createElement('canvas') as HTMLCanvasElement);
    layer.width = fog.cols;
    layer.height = fog.rows;
    const fctx = layer.getContext('2d');
    if (!fctx) return;
    fctx.clearRect(0, 0, fog.cols, fog.rows);
    fctx.fillStyle = 'rgba(6,6,10,0.82)';
    for (let r = 0; r < fog.rows; r++) {
      for (let c = 0; c < fog.cols; c++) {
        if (!fog.isCellRevealed(c, r)) fctx.fillRect(c, r, 1, 1);
      }
    }
    fogLayer = layer;
    stats.fogBuilds++;
  }

  function drawMarker(m: MapMarker, selected: boolean): void {
    if (!ctx) return;
    const p = worldToMap(m.x, m.z, model.bounds, size);
    ctx.beginPath();
    if (m.kind === 'waystone') {
      ctx.arc(p.u, p.v, 7, 0, Math.PI * 2);
      if (m.state === 'rekindled') {
        ctx.fillStyle = EMBER;
        ctx.fill();
      } else {
        ctx.strokeStyle = EMBER;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (m.kind === 'quest') {
      ctx.moveTo(p.u, p.v - 8);
      ctx.lineTo(p.u + 7, p.v);
      ctx.lineTo(p.u, p.v + 8);
      ctx.lineTo(p.u - 7, p.v);
      ctx.closePath();
      ctx.fillStyle = '#ffe066';
      ctx.fill();
    } else {
      ctx.arc(p.u, p.v, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#9ad1ff';
      ctx.fill();
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(p.u, p.v, 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function draw(): void {
    if (!ctx) return;
    stats.frames++;
    buildTerrain();
    buildFog();
    ctx.fillStyle = '#10121a';
    ctx.fillRect(0, 0, size, size);
    if (terrainLayer) ctx.drawImage(terrainLayer, 0, 0, size, size);
    if (fogLayer) ctx.drawImage(fogLayer, 0, 0, size, size);
    for (const m of model.markers()) drawMarker(m, m.id === selectedId);
    const pl = model.player();
    const a = playerArrowPosition(pl.x, pl.z, model.bounds, size);
    ctx.save();
    ctx.translate(a.u, a.v);
    ctx.rotate(-pl.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    drawnOnce = true;
  }

  function tryTravel(m: MapMarker | null | undefined): void {
    if (!m || !m.travelable) return;
    const reason = model.travelBlockedReason();
    if (reason !== null) {
      status.textContent = model.t(`map.blocked.${reason}`);
      return;
    }
    status.textContent = '';
    model.travel(m.id);
    deps.close();
  }

  function click(px: number, py: number): void {
    const m = hitTestMarker(model.markers(), px, py, model.bounds, size);
    if (m) selectedId = m.id;
    tryTravel(m);
  }

  function key(code: string): void {
    const pl = model.player();
    const move = (dir: 1 | -1) => {
      const ordered = selectionOrder(model.markers(), pl.x, pl.z);
      selectedId = stepSelection(ordered, selectedId, dir);
    };
    switch (code) {
      case 'ArrowLeft':
      case 'ArrowUp':
        move(-1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
      case 'Tab':
        move(1);
        break;
      case 'Enter':
      case 'NumpadEnter':
        tryTravel(model.markers().find((m) => m.id === selectedId));
        break;
      case 'Escape':
      case 'KeyM':
        deps.close();
        break;
      default:
        break;
    }
  }

  const onClick = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return;
    click(((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyM') {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    key(e.code);
  };
  canvas.addEventListener('click', onClick);
  element.addEventListener('keydown', onKey);

  return {
    id: 'map.modal',
    element,
    click,
    key,
    focusDefault() {
      element.focus?.();
    },
    get selectedId() {
      return selectedId;
    },
    stats,
    update(frameTime: number) {
      if (disposed) return;
      acc += Number.isFinite(frameTime) && frameTime > 0 ? frameTime : 0;
      if (drawnOnce && acc < 1 / MAP_MODAL_REDRAW_HZ) return;
      acc = 0;
      draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKey);
      element.remove();
    },
  };
}
