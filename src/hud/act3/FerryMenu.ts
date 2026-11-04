import type { BoardRefusal } from '../../traversal/ferry/FerryRides';
import type { DocumentLike, ElementLike } from '../dom';
import { makeEl, type Translate } from '../widget';

/** The slice of K7's `ferry` service the menu reads. */
export interface FerryMenuFerry {
  destinations(stop: string): string[];
  refusal(from: string, to: string): BoardRefusal | null;
  ride(from: string, to: string): BoardRefusal | null;
  readonly riding: boolean;
}

export interface MenuKeyEvent {
  code?: string;
  key?: string;
  preventDefault?(): void;
}

export interface FerryMenuDeps {
  doc: DocumentLike;
  /** `ctx.hud.openModal` with context 'menu'; null when another modal is open. */
  openModal(widget: { id: string; element: ElementLike; dispose?(): void }): (() => void) | null;
  t: Translate;
  /** Looked up on every open: the traversal plugin may set up after this one. */
  ferry(): FerryMenuFerry | undefined;
  stopName(id: string): string;
  /** Where the keys are heard (window in the browser). */
  keys?: {
    addEventListener(type: 'keydown', listener: (e: MenuKeyEvent) => void): void;
    removeEventListener(type: 'keydown', listener: (e: MenuKeyEvent) => void): void;
  } | null;
}

export const FERRY_MENU_ID = 'ferry-menu';

/** One line of text per reason: K7's toast strings, plus the two it never had (`busy`) and a fallback for any new reason. */
const REFUSAL_KEYS: Readonly<Record<BoardRefusal, string>> = {
  noToken: 'ferry.refused.noToken',
  notRunning: 'ferry.refused.notRunning',
  combat: 'ferry.refused.combat',
  hauling: 'ferry.refused.hauling',
  busy: 'act3.ferry.refused.busy',
  noRoute: 'ferry.refused.noRoute',
};
export const refusalKey = (r: unknown): string => (typeof r === 'string' && Object.prototype.hasOwnProperty.call(REFUSAL_KEYS, r) ? REFUSAL_KEYS[r as BoardRefusal] : 'act3.ferry.refused.generic');

/**
 * The ferry stop menu (K15 PR 1): lists the legs from a stop, each with its live refusal as a disabled line, and Cancel, which
 * only closes (the player stays standing at the stop). A leg boards through `ferry.ride`, never the default destination.
 * `open` is what `ferry.setMenu` takes: true when the menu opened.
 */
export function createFerryMenu(deps: FerryMenuDeps): { open(stop: string): boolean; readonly active: boolean } {
  const { doc, t } = deps;
  let active = false;
  const show = (stop: string, notice: string | null): boolean => {
    const ferry = deps.ferry();
    if (!ferry || ferry.riding) return false;
    const dests = ferry.destinations(stop);
    if (dests.length === 0) return false;
    const element = makeEl(doc, 'div', 'owg-respec owg-ferry-menu');
    makeEl(doc, 'h2', 'owg-menu-title', element).textContent = t('act3.ferry.menu.title', { stop: deps.stopName(stop) });
    const noticeEl = makeEl(doc, 'div', 'owg-respec-warn', element);
    noticeEl.textContent = notice ?? '';
    noticeEl.style.display = notice ? '' : 'none';
    let selected = 0;
    const rows: { to: string; row: ElementLike }[] = [];
    let closer: (() => void) | null = null;
    let done = false;
    const teardown = (): void => {
      if (done) return;
      done = true;
      active = false;
      deps.keys?.removeEventListener('keydown', onKey);
    };
    const close = (): void => {
      const c = closer;
      closer = null;
      teardown();
      c?.();
    };
    /** The live refusal; `busy` here is the menu's own modal on top of the gameplay context, so it does not count. */
    const refusalOf = (to: string): BoardRefusal | null => {
      const r = ferry.refusal(stop, to);
      return r === 'busy' ? null : r;
    };
    const say = (text: string): void => {
      noticeEl.textContent = text;
      noticeEl.style.display = '';
    };
    const paint = (): void => rows.forEach((r, i) => (r.row.className = i === selected ? 'owg-row owg-selected' : 'owg-row'));
    const choose = (to: string): void => {
      const r = refusalOf(to);
      if (r) {
        say(t(refusalKey(r)));
        return;
      }
      // The menu's modal is what makes the ferry read the player as busy: close it, then board.
      close();
      const res = ferry.ride(stop, to);
      if (res) show(stop, t(refusalKey(res)));
    };
    for (const to of dests) {
      const row = makeEl(doc, 'div', 'owg-row', element);
      const r = refusalOf(to);
      const label = t('act3.ferry.menu.go', { dest: deps.stopName(to) });
      const btn = makeEl(doc, 'button', r ? 'owg-btn owg-btn-off' : 'owg-btn', row);
      btn.textContent = label;
      if (r) {
        (btn as unknown as { disabled: boolean }).disabled = true;
        makeEl(doc, 'span', 'owg-respec-warn', row).textContent = t(refusalKey(r));
      } else {
        btn.onclick = () => choose(to);
      }
      rows.push({ to, row });
    }
    paint();
    const actions = makeEl(doc, 'div', 'owg-respec-actions', element);
    const cancel = makeEl(doc, 'button', 'owg-btn owg-ferry-cancel', actions);
    cancel.textContent = t('act3.ferry.menu.cancel');
    cancel.onclick = close;

    const onKey = (e: MenuKeyEvent): void => {
      const k = e.code && !e.code.startsWith('Numpad') ? e.code : (e.key ?? e.code);
      if (k === 'Escape' || e.key === 'Escape') {
        close();
        return;
      }
      const step = k === 'ArrowDown' || k === 'ArrowRight' || k === 'Tab' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
      if (step !== 0) {
        e.preventDefault?.();
        selected = (selected + step + rows.length) % rows.length;
        paint();
      } else if (k === 'Enter' || k === 'NumpadEnter') {
        e.preventDefault?.();
        choose(rows[selected]!.to);
      }
    };
    active = true;
    closer = deps.openModal({ id: FERRY_MENU_ID, element, dispose: teardown });
    if (!closer) {
      active = false;
      return false;
    }
    deps.keys?.addEventListener('keydown', onKey);
    return true;
  };
  return {
    open: (stop) => !active && show(stop, null),
    get active() {
      return active;
    },
  };
}
