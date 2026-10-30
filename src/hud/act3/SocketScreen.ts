import { SOCKET_TUNING } from '../../gear/sockets/tuning';
import type { SocketPanelHost, SocketPanelModel } from '../../gear/sockets/SocketFallbackPanel';
import type { SocketResult } from '../../gear/sockets/sockets';
import type { SocketScreenOpener } from '../../gear/sockets/shardGems.plugin';
import type { ElementLike } from '../dom';
import { makeEl } from '../widget';
import type { MenuKeyEvent } from './FerryMenu';

export const SOCKET_SCREEN_ID = 'shard-gems';

export interface SocketScreenKeys {
  addEventListener(type: 'keydown', listener: (e: MenuKeyEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (e: MenuKeyEvent) => void): void;
}

interface Action {
  el: ElementLike;
  run(): void;
}

/**
 * K15's socket screen: draws K10's `SocketPanelModel` (the model, the costs and every refusal stay K10's). The pieces that
 * take a gem come worn first, each with its sockets (empty, fitted, or dormant for another class's gem); the loose gems show
 * their counts. Choose an empty socket, then a gem to fit; a fitted socket offers Take out; a gem offers its recut target.
 * The last result shows as a line (K10's ok text or its refusal string). Arrows or Tab move, Enter selects, Esc closes.
 */
export function createSocketScreen(keys: SocketScreenKeys | null = null): SocketScreenOpener {
  return (host: SocketPanelHost, model: SocketPanelModel): (() => void) | null => {
    const { doc, t } = host;
    const element = makeEl(doc, 'div', 'owg-respec owg-sockets');
    const body = makeEl(doc, 'div', 'owg-menu owg-sockets-body', element);
    const name = (id: string): string => t(`item.${id}.name`);
    let last: SocketResult | null = null;
    let notice: string | null = null;
    /** The empty socket chosen for fitting. */
    let chosen: { itemId: string; slot: number } | null = null;
    let focus = 0;
    let actions: Action[] = [];
    let closer: (() => void) | null = null;
    let done = false;

    const act = (parent: ElementLike, label: string, fn: () => void, cls = 'owg-btn'): void => {
      const b = makeEl(doc, 'button', cls, parent);
      b.textContent = label;
      b.onclick = () => {
        focus = actions.findIndex((a) => a.el === b);
        fn();
        render();
      };
      actions.push({ el: b, run: b.onclick as () => void });
    };
    const result = (r: SocketResult): void => {
      last = r;
      notice = null;
      chosen = null;
    };

    const render = (): void => {
      body.replaceChildren();
      actions = [];
      makeEl(doc, 'h2', 'owg-menu-title', body).textContent = t('gear.sockets.title');
      makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t('gear.screen.gold', { gold: model.gold() });
      if (last) makeEl(doc, 'div', last.ok ? 'owg-respec-quote' : 'owg-respec-warn', body).textContent = last.ok ? t('gear.sockets.ok', { name: name(last.shardId) }) : t(`gear.sockets.fail.${last.reason}`);
      const pieces = [...model.pieces()];
      const worn = (id: string): boolean => model.equipped?.(id) === true;
      // Worn pieces first; the model's order otherwise.
      pieces.sort((a, b) => Number(worn(b.itemId)) - Number(worn(a.itemId)));
      const gems = model.gems();
      // A chosen socket that was filled (or whose piece is gone) is no longer a choice.
      if (chosen && !pieces.some((p) => p.itemId === chosen!.itemId && p.slots.some((s) => s.slot === chosen!.slot && !s.shardId))) chosen = null;
      if (notice) makeEl(doc, 'div', 'owg-respec-warn', body).textContent = notice;
      else if (chosen) makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t('act3.sockets.screen.pickGem', { n: chosen.slot + 1, piece: name(chosen.itemId) });
      if (pieces.length === 0) makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t('gear.sockets.none');
      else makeEl(doc, 'h3', 'owg-sockets-head', body).textContent = t('act3.sockets.screen.pieces');
      for (const p of pieces) {
        makeEl(doc, 'div', 'owg-row owg-sockets-piece', body).textContent = `${name(p.itemId)}${worn(p.itemId) ? ` ${t('act3.sockets.screen.worn')}` : ''}`;
        for (const s of p.slots) {
          const isChosen = !!chosen && chosen.itemId === p.itemId && chosen.slot === s.slot;
          const line = makeEl(doc, 'div', isChosen ? 'owg-row owg-selected' : 'owg-row', body);
          const label = t('gear.sockets.slot', { n: s.slot + 1 });
          if (s.shardId) {
            // Dormant gems are fitted but give nothing while another class wears the piece.
            line.textContent = `${label} ${name(s.shardId)}${s.dormant ? ` ${t('gear.sockets.dormant')}` : ''}`;
            act(line, t('act3.sockets.screen.remove', { gold: SOCKET_TUNING.removeGold }), () => result(model.remove(p.itemId, s.slot)));
          } else {
            line.textContent = `${label} ${t('gear.sockets.empty')}`;
            act(line, t(isChosen ? 'act3.sockets.screen.chosen' : 'act3.sockets.screen.choose'), () => {
              chosen = { itemId: p.itemId, slot: s.slot };
              notice = null;
            });
          }
        }
      }
      makeEl(doc, 'h3', 'owg-sockets-head', body).textContent = t('act3.sockets.screen.gems');
      if (gems.length === 0) makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t('act3.sockets.screen.noGems');
      for (const g of gems) {
        const line = makeEl(doc, 'div', 'owg-row', body);
        line.textContent = `${name(g.id)} x${g.count}${g.dormant ? ` ${t('gear.sockets.dormant')}` : ''}`;
        act(line, t('act3.sockets.screen.fit', { gold: SOCKET_TUNING.fitGold }), () => {
          if (!chosen) {
            notice = t('act3.sockets.screen.pickSlot');
            return;
          }
          result(model.fit(chosen.itemId, chosen.slot, g.id));
        });
        const to = g.recutTo;
        if (to) act(line, t('act3.sockets.screen.recut', { name: name(to), gold: SOCKET_TUNING.recutGold }), () => result(model.recut(g.id, to)));
      }
      makeEl(doc, 'div', 'owg-card-hint', body).textContent = t('act3.sockets.screen.hint');
      const close = makeEl(doc, 'button', 'owg-btn', body);
      close.textContent = t('gear.screen.close');
      close.onclick = () => closer?.();
      actions.push({ el: close, run: () => closer?.() });
      focus = Math.min(Math.max(0, focus), actions.length - 1);
      actions.forEach((a, i) => {
        a.el.className = a.el.className.replace(/ owg-focus/g, '') + (i === focus ? ' owg-focus' : '');
      });
    };

    const onKey = (e: MenuKeyEvent): void => {
      const k = e.code && !e.code.startsWith('Numpad') ? e.code : (e.key ?? e.code);
      if (k === 'Escape' || e.key === 'Escape') {
        closer?.();
        return;
      }
      const step = k === 'ArrowDown' || k === 'ArrowRight' || k === 'Tab' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
      if (step !== 0) {
        e.preventDefault?.();
        focus = (focus + step + actions.length) % actions.length;
        render();
      } else if (k === 'Enter' || k === 'NumpadEnter') {
        e.preventDefault?.();
        actions[focus]?.run();
      }
    };
    const teardown = (): void => {
      if (done) return;
      done = true;
      keys?.removeEventListener('keydown', onKey);
    };

    render();
    closer = host.openModal({ id: SOCKET_SCREEN_ID, element, dispose: teardown });
    if (!closer) {
      teardown();
      return null;
    }
    keys?.addEventListener('keydown', onKey);
    return closer;
  };
}
