import type { DocumentLike, ElementLike } from '../../hud/dom';
import { makeEl } from '../../hud/widget';
import type { SocketResult, SocketView } from './sockets';

/** What the minimal socket panel drives; K15's socket screen replaces the drawing, never this. */
export interface SocketPanelModel {
  pieces(): SocketView[];
  /** Loose gems held, with counts. */
  gems(): { id: string; count: number; dormant: boolean; recutTo: string | null }[];
  fit(itemId: string, slot: number, gemId: string): SocketResult;
  remove(itemId: string, slot: number): SocketResult;
  recut(fromId: string, toId: string): SocketResult;
  gold(): number;
}

export interface SocketPanelHost {
  doc: DocumentLike;
  t(key: string, params?: Record<string, string | number>): string;
  openModal(widget: { id: string; element: ElementLike; dispose?(): void }): (() => void) | null;
}

/** Minimal DOM panel: fit, remove and recut, with the result of the last action. Returns the closer, or null. */
export function openSocketPanel(host: SocketPanelHost, model: SocketPanelModel): (() => void) | null {
  const { doc, t } = host;
  const element = makeEl(doc, 'div', 'owg-respec');
  const body = makeEl(doc, 'div', 'owg-menu', element);
  let last: SocketResult | null = null;
  let closer: (() => void) | null = null;
  const button = (parent: ElementLike, label: string, fn: () => void): void => {
    const b = makeEl(doc, 'button', 'owg-btn', parent);
    b.textContent = label;
    b.onclick = () => {
      fn();
      render();
    };
  };
  const name = (id: string): string => t(`item.${id}.name`);
  const render = (): void => {
    body.replaceChildren();
    makeEl(doc, 'h2', 'owg-menu-title', body).textContent = t('gear.sockets.title');
    makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t('gear.screen.gold', { gold: model.gold() });
    if (last) makeEl(doc, 'div', last.ok ? 'owg-respec-quote' : 'owg-respec-warn', body).textContent = last.ok ? t('gear.sockets.ok', { name: name(last.shardId) }) : t(`gear.sockets.fail.${last.reason}`);
    const gems = model.gems();
    const pieces = model.pieces();
    if (pieces.length === 0) makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t('gear.sockets.none');
    for (const p of pieces) {
      makeEl(doc, 'div', 'owg-row', body).textContent = name(p.itemId);
      for (const s of p.slots) {
        const line = makeEl(doc, 'div', 'owg-row', body);
        if (s.shardId) {
          line.textContent = `${t('gear.sockets.slot', { n: s.slot + 1 })} ${name(s.shardId)}${s.dormant ? ` ${t('gear.sockets.dormant')}` : ''}`;
          button(line, t('gear.sockets.remove'), () => (last = model.remove(p.itemId, s.slot)));
        } else {
          line.textContent = `${t('gear.sockets.slot', { n: s.slot + 1 })} ${t('gear.sockets.empty')}`;
          for (const g of gems) button(line, t('gear.sockets.fit', { name: name(g.id) }), () => (last = model.fit(p.itemId, s.slot, g.id)));
        }
      }
    }
    for (const g of gems) {
      const line = makeEl(doc, 'div', 'owg-row', body);
      line.textContent = `${name(g.id)} x${g.count}${g.dormant ? ` ${t('gear.sockets.dormant')}` : ''}`;
      const to = g.recutTo;
      if (to) button(line, t('gear.sockets.recut', { name: name(to) }), () => (last = model.recut(g.id, to)));
    }
    const close = makeEl(doc, 'button', 'owg-btn', body);
    close.textContent = t('gear.screen.close');
    close.onclick = () => closer?.();
  };
  render();
  closer = host.openModal({ id: 'shard-gems', element });
  return closer;
}
