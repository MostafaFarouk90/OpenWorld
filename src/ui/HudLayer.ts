import type { GameEvents } from '../core/events';
import type { InputContextStack } from '../input/actions';

export type HudSlot =
  | 'top-left' | 'top-center' | 'top-right' | 'center'
  | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'toast' | 'subtitle' | 'overlay';

export const HUD_SLOTS: readonly HudSlot[] = [
  'top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right', 'toast', 'subtitle', 'overlay',
];

export interface HudWidget {
  id: string;
  element: HTMLElement;
  order?: number;
  update?(frameTime: number): void;
  dispose?(): void;
}

export interface OpenModalOptions {
  /** Input context pushed while the modal is open (default 'menu'). */
  context?: 'menu' | 'dialogue';
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
  overlay: { inset: '0' },
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
  private readonly fadeEl: HTMLElement | null = null;
  private fadeValue = 0;
  private fadeRun: { cancel: () => void } | null = null;
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
      const order: HudSlot[] = ['overlay', ...HUD_SLOTS.filter((x) => x !== 'overlay')];
      for (const slot of order) {
        const el = doc.createElement('div');
        el.dataset.slot = slot;
        Object.assign(el.style, {
          position: 'absolute', display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'none',
          ...SLOT_STYLE[slot],
        });
        root.appendChild(el);
        this.slotEls.set(slot, el);
      }
      const fade = doc.createElement('div');
      Object.assign(fade.style, { position: 'absolute', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none' });
      this.slotEls.get('overlay')!.appendChild(fade);
      this.fadeEl = fade;
      container.appendChild(root);
      this.root = root;
    }
  }

  get modalOpen(): string | null {
    return this.modal ? this.modal.widget.id : null;
  }

  /** Current opacity of the full-screen black fade (0..1). */
  get fadeOpacity(): number {
    return this.fadeValue;
  }

  /**
   * Animates the black fade to `opacity` (clamped 0..1) over `seconds`. A newer fade cancels the older
   * one, whose promise resolves at once. Headless layers record the target and resolve immediately.
   */
  fade(opacity: number, seconds: number): Promise<void> {
    this.fadeRun?.cancel();
    this.fadeRun = null;
    const target = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : this.fadeValue;
    const set = (v: number) => {
      this.fadeValue = v;
      if (this.fadeEl) this.fadeEl.style.opacity = String(v);
    };
    if (!this.fadeEl || !(seconds > 0) || !Number.isFinite(seconds) || target === this.fadeValue) {
      set(target);
      return Promise.resolve();
    }
    const from = this.fadeValue;
    const ms = seconds * 1000;
    return new Promise<void>((resolve) => {
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
      const start = now();
      let handle: unknown = null;
      let finished = false;
      let steps = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (this.fadeRun === run) this.fadeRun = null;
        resolve();
      };
      const run = {
        cancel: () => {
          if (raf && caf && handle !== null) caf(handle as number);
          else if (handle !== null) clearTimeout(handle as ReturnType<typeof setTimeout>);
          finish();
        },
      };
      this.fadeRun = run;
      const step = () => {
        if (finished) return;
        // Without rAF, time advances by fixed 16ms steps so the fade length does not depend on timer drift.
        const t = Math.min(1, raf ? (now() - start) / ms : (++steps * 16) / ms);
        set(t >= 1 ? target : from + (target - from) * t);
        if (t >= 1) return finish();
        handle = raf ? raf(step) : setTimeout(step, 16);
      };
      handle = raf ? raf(step) : setTimeout(step, 16);
    });
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

  openModal(widget: HudWidget, opts: OpenModalOptions = {}): (() => void) | null {
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
    const popContext = this.contexts.push(opts.context === 'dialogue' ? 'dialogue' : 'menu', `modal:${widget.id}`);
    const modal = { widget, popContext };
    this.modal = modal;
    this.exitPointerLock();
    this.events.emit('ui.modal', { id: widget.id, open: true });
    return () => this.closeModal(modal);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    // The overlay (fade) is not part of the HUD and stays visible.
    for (const [slot, el] of this.slotEls) if (slot !== 'overlay') el.style.display = visible ? 'flex' : 'none';
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
    this.fadeRun?.cancel();
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
