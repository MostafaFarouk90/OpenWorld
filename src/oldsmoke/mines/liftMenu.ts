// The lift's stop picker: a small HUD modal list. No existing menu fits (dialogue choices belong to a talk, the waystone travel
// list is the map), so this is the minimum: keyboard (arrows or W/S, Enter, Esc), mouse (click a row), locked stops greyed with
// the reason. The selection model is pure and tested; the DOM is a thin shell, skipped headless.
import type { CoreContext } from '../../region/coreTypes';

export interface LiftMenuRow {
  id: string;
  label: string;
  locked: boolean;
  /** Shown beside a locked row. */
  reason?: string;
}

/** Cursor over the rows: wraps, and starts on the first unlocked row. */
export class LiftMenuModel {
  index: number;
  constructor(readonly rows: readonly LiftMenuRow[]) {
    const first = rows.findIndex((r) => !r.locked);
    this.index = first >= 0 ? first : 0;
  }
  move(delta: number): void {
    if (this.rows.length) this.index = (this.index + delta + this.rows.length) % this.rows.length;
  }
  get selected(): LiftMenuRow | undefined {
    return this.rows[this.index];
  }
}

export const LIFT_MENU_MODAL_ID = 'oldsmoke.lift.menu';

type MenuCtx = Pick<CoreContext, 'hud' | 'strings' | 'systems' | 'input'>;

/**
 * Opens the picker. `onChoose` gets the chosen row's id (locked rows too: the caller toasts the reason). Returns the closer;
 * null when another modal is already open.
 */
export function openLiftMenu(ctx: MenuCtx, rows: readonly LiftMenuRow[], onChoose: (id: string) => void): (() => void) | null {
  const model = new LiftMenuModel(rows);
  const hasDom = typeof document !== 'undefined';
  const el = hasDom ? document.createElement('div') : null;
  let closeModal: (() => void) | null = null;
  let offSystem: (() => void) | null = null;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (hasDom) document.removeEventListener('keydown', onKey, true);
    offSystem?.();
    closeModal?.();
  };
  const choose = (): void => {
    const row = model.selected;
    if (!row) return;
    close();
    onChoose(row.id);
  };
  const paint = (): void => {
    if (!el) return;
    el.replaceChildren();
    const title = document.createElement('div');
    title.textContent = ctx.strings.t('oldsmoke.lift.menu.title');
    title.style.cssText = 'font:bold 18px serif;margin-bottom:8px';
    el.appendChild(title);
    rows.forEach((row, i) => {
      const line = document.createElement('div');
      line.textContent = row.locked && row.reason ? `${row.label}  (${row.reason})` : row.label;
      const sel = i === model.index;
      line.style.cssText = `padding:4px 10px;cursor:pointer;font:15px serif;opacity:${row.locked ? 0.45 : 1};background:${sel ? 'rgba(255,176,112,.25)' : 'transparent'}`;
      line.onmousemove = () => {
        // Real pointer movement only: a repaint puts a new row under a pointer that has not moved, and mouseenter would take the keyboard's selection.
        if (model.index === i) return;
        model.index = i;
        paint();
      };
      line.onclick = () => {
        model.index = i;
        choose();
      };
      el.appendChild(line);
    });
    const hint = document.createElement('div');
    hint.textContent = ctx.strings.t('oldsmoke.lift.menu.hint');
    hint.style.cssText = 'margin-top:8px;font:12px serif;opacity:.6';
    el.appendChild(hint);
  };
  function onKey(e: KeyboardEvent): void {
    const k = e.code;
    // A held W or S (pressed before F) must not scroll the cursor on every repeat.
    if (e.repeat && (k === 'KeyW' || k === 'KeyS')) return;
    if (k === 'Escape') close();
    else if (k === 'ArrowDown' || k === 'KeyS') model.move(1);
    else if (k === 'ArrowUp' || k === 'KeyW') model.move(-1);
    else if (k === 'Enter' || k === 'Space') choose();
    else return;
    e.preventDefault();
    e.stopPropagation();
    if (!closed) paint();
  }

  if (el) {
    el.style.cssText = 'background:rgba(20,16,12,.92);color:#f3e6c8;padding:14px 18px;border-radius:6px;min-width:280px;border:1px solid #6b4a2a';
    paint();
  }
  const widget = { id: LIFT_MENU_MODAL_ID, element: el as unknown as HTMLElement, dispose: () => close() };
  closeModal = ctx.hud.openModal(widget);
  if (!closeModal) return null;
  if (hasDom) document.addEventListener('keydown', onKey, true);
  // The same Esc the other modals answer to (the `menu` action), for input that does not reach the document.
  offSystem = ctx.systems.add({
    id: `${LIFT_MENU_MODAL_ID}.input`,
    fixedPhase: 'input',
    order: 0,
    fixedUpdate: () => {
      if (ctx.input.actions.pressed('menu')) close();
    },
  });
  return close;
}
