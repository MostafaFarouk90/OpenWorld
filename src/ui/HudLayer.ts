import type { GameEvents } from '../core/events';
import type { InputContextStack } from '../input/actions';

export type HudSlot =
  | 'top-left' | 'top-center' | 'top-right' | 'center'
  | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'toast' | 'subtitle';

export const HUD_SLOTS: readonly HudSlot[] = [
  'top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right', 'toast', 'subtitle',
];

export interface HudWidget {
  id: string;
  element: HTMLElement;
  order?: number;
  update?(frameTime: number): void;
  dispose?(): void;
}

export interface HudLayerOptions {
  doc?: Pick<Document, 'createElement'>;
  exitPointerLock?: () => void;
}

interface Mounted {
  widget: HudWidget;
  slot: HudSlot;
  seq: number;
  done: boolean;
}

const SLOT_STYLE: Record<HudSlot, Record<string, string>> = {
  'top-left': { top: '12px', left: '12px', alignItems: 'flex-start' },
  'top-center': { top: '12px', left: '50%', transform: 'translateX(-50%)', alignItems: 'center' },
  'top-right': { top: '12px', right: '12px', alignItems: 'flex-end' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center' },
  'bottom-left': { bottom: '12px', left: '12px', alignItems: 'flex-start', justifyContent: 'flex-end' },
  'bottom-center': { bottom: '12px', left: '50%', transform: 'translateX(-50%)', alignItems: 'center', justifyContent: 'flex-end' },
  'bottom-right': { bottom: '12px', right: '12px', alignItems: 'flex-end', justifyContent: 'flex-end' },
  toast: { top: '64px', right: '12px', alignItems: 'flex-end' },
  subtitle: { bottom: '72px', left: '50%', transform: 'translateX(-50%)', alignItems: 'center', justifyContent: 'flex-end' },
};

function detach(el: HTMLElement): void {
  if (typeof el.remove === 'function') el.remove();
  else el.parentNode?.removeChild(el);
}

export class HudLayer {
  private readonly lists = new Map<HudSlot, Mounted[]>(HUD_SLOTS.map((s) => [s, []]));
  private readonly ids = new Map<string, Mounted>();
  private readonly root: HTMLElement | null = null;
  private readonly slotEls = new Map<HudSlot, HTMLElement>();
  private modalEl: HTMLElement | null = null;
  private modal: { widget: HudWidget; popContext: () => void } | null = null;
  private seq = 0;
  private visible = true;
  private readonly exitPointerLock: () => void;

  constructor(
    container: HTMLElement | null,
    private readonly contexts: InputContextStack,
    private readonly events: GameEvents,
    private readonly opts: HudLayerOptions = {},
  ) {
    this.exitPointerLock =
      opts.exitPointerLock ?? (() => (typeof document !== 'undefined' ? document.exitPointerLock?.() : undefined));
    if (container) {
      const doc = opts.doc ?? document;
      const root = doc.createElement('div');
      Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
      for (const slot of HUD_SLOTS) {
        const el = doc.createElement('div');
        el.dataset.slot = slot;
        Object.assign(el.style, {
          position: 'absolute', display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'none',
          ...SLOT_STYLE[slot],
        });
        root.appendChild(el);
        this.slotEls.set(slot, el);
      }
      container.appendChild(root);
      this.root = root;
    }
  }

  get modalOpen(): string | null {
    return this.modal ? this.modal.widget.id : null;
  }

  mount(slot: HudSlot, widget: HudWidget): () => void {
    const list = this.lists.get(slot);
    if (!list) throw new Error(`HudLayer: unknown slot "${String(slot)}"`);
    if (this.ids.has(widget.id) || this.modal?.widget.id === widget.id) {
      throw new Error(`HudLayer: widget id "${widget.id}" is already mounted`);
    }
    const m: Mounted = { widget, slot, seq: this.seq++, done: false };
    list.push(m);
    list.sort((a, b) => (a.widget.order ?? 0) - (b.widget.order ?? 0) || a.seq - b.seq);
    this.ids.set(widget.id, m);
    const parent = this.slotEls.get(slot);
    if (parent) {
      if (list[list.length - 1] === m) parent.appendChild(widget.element);
      else for (const x of list) parent.appendChild(x.widget.element);
    }
    return () => this.unmount(m);
  }

  mounted(slot: HudSlot): string[] {
    return (this.lists.get(slot) ?? []).map((m) => m.widget.id);
  }

  openModal(widget: HudWidget): (() => void) | null {
    if (this.modal) return null;
    let el: HTMLElement | null = null;
    if (this.root) {
      const doc = this.opts.doc ?? document;
      el = doc.createElement('div');
      Object.assign(el.style, {
        position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'auto',
      });
      el.appendChild(widget.element);
      this.root.appendChild(el);
    }
    this.modalEl = el;
    const popContext = this.contexts.push('menu', `modal:${widget.id}`);
    const modal = { widget, popContext };
    this.modal = modal;
    this.exitPointerLock();
    this.events.emit('ui.modal', { id: widget.id, open: true });
    return () => this.closeModal(modal);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const el of this.slotEls.values()) el.style.display = visible ? 'flex' : 'none';
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(frameTime: number): void {
    const all = [...this.lists.values()].flat().map((m) => m.widget);
    if (this.modal) all.push(this.modal.widget);
    for (const w of all) {
      try {
        w.update?.(frameTime);
      } catch (e) {
        console.error(`HudLayer: widget "${w.id}" update failed`, e);
      }
    }
  }

  dispose(): void {
    for (const list of this.lists.values()) for (const m of [...list]) this.unmount(m);
    if (this.modal) this.closeModal(this.modal);
    if (this.root) detach(this.root);
  }

  private unmount(m: Mounted): void {
    if (m.done) return;
    m.done = true;
    const list = this.lists.get(m.slot)!;
    list.splice(list.indexOf(m), 1);
    this.ids.delete(m.widget.id);
    detach(m.widget.element);
    this.safeDispose(m.widget);
  }

  private closeModal(modal: { widget: HudWidget; popContext: () => void }): void {
    if (this.modal !== modal) return;
    this.modal = null;
    modal.popContext();
    detach(modal.widget.element);
    if (this.modalEl) detach(this.modalEl);
    this.modalEl = null;
    this.safeDispose(modal.widget);
    this.events.emit('ui.modal', { id: modal.widget.id, open: false });
  }

  private safeDispose(w: HudWidget): void {
    try {
      w.dispose?.();
    } catch (e) {
      console.error(`HudLayer: widget "${w.id}" dispose failed`, e);
    }
  }
}
