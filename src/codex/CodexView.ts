import type { DocumentLike, ElementLike } from '../hud/dom';
import type { HudWidget } from '../ui/HudLayer';
import { asHtml, hudDocument } from '../hud/soft';
import { CODEX_TABS, entriesOf, findEntry, type CodexTab } from './entries';
import { ZERO_COUNTS } from './CodexModel';
import type { MercyCounts } from './service';

export const CODEX_MODAL_ID = 'codex.modal';

export interface CodexViewDeps {
  has(id: string): boolean;
  markRead(id: string): void;
  isRead(id: string): boolean;
  /** Counts for a kind, or null when the tally service is absent (zeros are shown). */
  tally(kind: string): MercyCounts | null;
  t(key: string, params?: Record<string, string | number>): string;
  doc?: DocumentLike;
}

export interface CodexModalWidget extends HudWidget {
  /** Keyboard `code` (ArrowLeft, ArrowRight, ArrowUp, ArrowDown). Close keys are the plugin's (input actions). */
  key(code: string): boolean;
  select(entryId: string): void;
  focusDefault(): void;
  readonly tab: CodexTab;
  readonly selectedId: string | null;
}

export function createCodexModal(deps: CodexViewDeps): CodexModalWidget {
  const doc = deps.doc ?? hudDocument();
  const root = doc.createElement('div');
  root.className = 'codex-modal';
  Object.assign(root.style, {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', minWidth: 'min(720px, 92vw)', maxHeight: '80vh',
    background: 'rgba(8,8,12,0.94)', color: '#eee', outline: 'none', border: '1px solid #553',
  });
  (root as unknown as { tabIndex: number }).tabIndex = 0;

  let tab: CodexTab = 'bestiary';
  const index: Record<CodexTab, number> = { bestiary: 0, lore: 0, howto: 0 };
  let disposed = false;
  let signature = '';

  const el = (tag: string, cls: string, text?: string): ElementLike => {
    const e = doc.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const currentEntries = () => entriesOf(tab);
  const selected = () => currentEntries()[index[tab]] ?? null;

  function render(): void {
    if (disposed) return;
    const entries = currentEntries();
    const sel = selected();
    if (sel && deps.has(sel.id)) deps.markRead(sel.id);

    const title = el('h2', 'codex-modal__title', deps.t('codex.title'));
    const tabs = el('div', 'codex-modal__tabs');
    Object.assign(tabs.style, { display: 'flex', gap: '12px' });
    for (const id of CODEX_TABS) {
      const t = el('button', id === tab ? 'codex-modal__tab codex-modal__tab--active' : 'codex-modal__tab', deps.t(`codex.tab.${id}`));
      t.setAttribute('data-tab', id);
      t.setAttribute('aria-selected', id === tab ? 'true' : 'false');
      t.onclick = () => setTab(id);
      if (id === tab) Object.assign(t.style, { borderBottom: '2px solid #ff8a3d' });
      tabs.append(t);
    }

    const list = el('div', 'codex-modal__list');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '220px', overflowY: 'auto' });
    entries.forEach((e, i) => {
      const unlocked = deps.has(e.id);
      const row = el('button', i === index[tab] ? 'codex-modal__item codex-modal__item--selected' : 'codex-modal__item', unlocked ? deps.t(e.nameKey) : deps.t('codex.locked'));
      row.setAttribute('data-entry', e.id);
      row.setAttribute('data-locked', unlocked ? 'false' : 'true');
      if (i === index[tab]) Object.assign(row.style, { background: 'rgba(255,138,61,0.25)' });
      row.onclick = () => {
        index[tab] = i;
        render();
      };
      list.append(row);
    });
    if (entries.length === 0) list.append(el('p', 'codex-modal__empty', deps.t('codex.empty')));

    const detail = el('div', 'codex-modal__detail');
    Object.assign(detail.style, { flex: '1', display: 'flex', flexDirection: 'column', gap: '6px' });
    if (sel) {
      const unlocked = deps.has(sel.id);
      detail.append(el('h3', 'codex-modal__name', unlocked ? deps.t(sel.nameKey) : deps.t('codex.locked')));
      detail.append(el('p', 'codex-modal__body', unlocked ? deps.t(sel.bodyKey) : deps.t('codex.lockedBody')));
      if (sel.tab === 'bestiary' && unlocked) {
        const c = deps.tally(sel.id) ?? ZERO_COUNTS;
        detail.append(el('p', 'codex-modal__tally', deps.t('codex.tally', { release: c.release, spare: c.spare, calm: c.calm })));
      }
    }

    const body = el('div', 'codex-modal__main');
    Object.assign(body.style, { display: 'flex', gap: '16px', overflow: 'hidden' });
    body.append(list, detail);

    root.replaceChildren(title, tabs, body, el('p', 'codex-modal__hint', deps.t('codex.hint')));
    signature = stateSignature();
  }

  function stateSignature(): string {
    const sel = selected();
    const c = sel && sel.tab === 'bestiary' ? deps.tally(sel.id) : null;
    const unlocks = currentEntries().map((e) => (deps.has(e.id) ? 1 : 0)).join('');
    return `${tab}|${index[tab]}|${unlocks}|${c ? `${c.release},${c.spare},${c.calm}` : '-'}`;
  }

  function setTab(next: CodexTab): void {
    tab = next;
    render();
  }

  const widget: CodexModalWidget = {
    id: CODEX_MODAL_ID,
    element: asHtml(root),
    get tab() {
      return tab;
    },
    get selectedId() {
      return selected()?.id ?? null;
    },
    key(code) {
      const n = currentEntries().length;
      switch (code) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          const step = code === 'ArrowRight' ? 1 : -1;
          setTab(CODEX_TABS[(CODEX_TABS.indexOf(tab) + step + CODEX_TABS.length) % CODEX_TABS.length]);
          return true;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          if (n === 0) return true;
          index[tab] = Math.min(n - 1, Math.max(0, index[tab] + (code === 'ArrowDown' ? 1 : -1)));
          render();
          return true;
        }
        default:
          return false;
      }
    },
    select(entryId) {
      const e = findEntry(entryId);
      if (!e) return;
      tab = e.tab;
      index[tab] = Math.max(0, entriesOf(tab).findIndex((x) => x.id === entryId));
      render();
    },
    focusDefault() {
      (root as unknown as { focus?: () => void }).focus?.();
    },
    update() {
      if (!disposed && stateSignature() !== signature) render();
    },
    dispose() {
      disposed = true;
      (root as unknown as { removeEventListener?: (t: string, f: unknown) => void }).removeEventListener?.('keydown', onKey);
    },
  };

  function onKey(ev: { code: string; preventDefault?: () => void }): void {
    if (widget.key(ev.code)) ev.preventDefault?.();
  }
  (root as unknown as { addEventListener?: (t: string, f: unknown) => void }).addEventListener?.('keydown', onKey);

  render();
  return widget;
}
