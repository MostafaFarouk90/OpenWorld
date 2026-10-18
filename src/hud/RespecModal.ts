import type { DocumentLike, ElementLike } from './dom';
import { defaultHudT } from './strings.en';
import { makeEl, type Translate } from './widget';

/** Thread 7's `respecQuote()` reduced to what the dialog shows. */
export interface RespecQuote {
  free: boolean;
  gold?: number;
  /** Alias of `gold`. */
  cost?: number;
  /** When absent it is derived: free, or the price fits in the gold the player holds. */
  canAfford?: boolean;
}

/** One choice in the optional radio group (for example the class to change to). */
export interface RespecOption {
  id: string;
  label: string;
}

export interface RespecModalRequest {
  /**
   * The quote shown. When `quoteFor` is absent (or there are no options) this single quote covers all options:
   * the cost depends on state (first respec free, gold held), not on the target. It is also the fallback when
   * `quoteFor` throws or returns a malformed quote.
   */
  quote: RespecQuote;
  /**
   * Optional, used only with options: the quote for one option id. Asked for the first option on open and again
   * on every selection change (arrows, click), so the price text and Confirm's enabled state follow the highlight.
   * A throw or a malformed result falls back to `quote` for that option.
   */
  quoteFor?(id: string): RespecQuote;
  /**
   * With options (non-empty after dropping entries with an empty id or label; duplicate ids make `open` return
   * false) the dialog shows a radio group, the first option selected. Absent or empty: no group.
   */
  options?: RespecOption[];
  /**
   * Called once, when the player confirms. The caller (thread 7) spends the gold and calls progression.
   * With options it receives the selected id (always one from the list); without, it gets no argument.
   */
  confirm(id?: string): void;
  /** Called once, on Cancel or Esc. */
  cancel(): void;
}

/** Declared here, provided by hud.plugin.ts. The modal never calls progression and listens to no `interact`. */
export interface RespecModalService {
  /** False when the dialog could not open (another modal is open, or a respec dialog is already showing). */
  open(request: RespecModalRequest): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    respecModal: RespecModalService;
  }
}

export interface RespecKeyEvent {
  code?: string;
  key?: string;
  preventDefault?(): void;
}

/** Valid options of a request: null when none were given (or all were dropped), false when ids repeat. */
function cleanOptions(raw: unknown): RespecOption[] | null | false {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RespecOption[] = [];
  const seen = new Set<string>();
  for (const o of raw as unknown[]) {
    const id = (o as RespecOption | null)?.id;
    const label = (o as RespecOption | null)?.label;
    if (typeof id !== 'string' || id === '' || typeof label !== 'string' || label === '') continue;
    if (seen.has(id)) {
      console.warn(`RespecModal: duplicate option id "${id}"; the request is refused`);
      return false;
    }
    seen.add(id);
    out.push({ id, label });
  }
  return out.length > 0 ? out : null;
}

export interface RespecModalDeps {
  doc: DocumentLike;
  /** `ctx.hud.openModal` bound with context 'menu'; null when another modal is open. */
  openModal(widget: { id: string; element: ElementLike; dispose?(): void }): (() => void) | null;
  t?: Translate;
  /** The player's gold (inventory.gold); undefined when unknown, in which case the price is assumed affordable. */
  gold?(): number | undefined;
  /** Where Esc is heard (window in the browser). */
  keys?: {
    addEventListener(type: 'keydown', listener: (e: RespecKeyEvent) => void): void;
    removeEventListener(type: 'keydown', listener: (e: RespecKeyEvent) => void): void;
  } | null;
}

export function createRespecModal(deps: RespecModalDeps): RespecModalService {
  const t = deps.t ?? defaultHudT;
  let active = false;
  return {
    open(request) {
      if (active) return false;
      const quote = request?.quote;
      if (!quote || typeof request.confirm !== 'function' || typeof request.cancel !== 'function') return false;
      const options = cleanOptions(request.options);
      if (options === false) return false;
      // Unknown affordability is assumed true; the caller (thread 7) refuses the spend if it is not.
      const evaluate = (q: RespecQuote): { free: boolean; gold: number; canAfford: boolean } => {
        const raw = [q.gold, q.cost].find((n): n is number => typeof n === 'number' && Number.isFinite(n));
        const gold = raw === undefined ? 0 : Math.max(0, Math.round(raw));
        let have: number | undefined;
        try {
          have = deps.gold?.();
        } catch {
          have = undefined;
        }
        const canAfford =
          q.free === true ||
          (typeof q.canAfford === 'boolean' ? q.canAfford : typeof have === 'number' && Number.isFinite(have) ? gold <= have : true);
        return { free: !!q.free, gold, canAfford };
      };
      const quoteFor = options && typeof request.quoteFor === 'function' ? request.quoteFor.bind(request) : null;
      const quoteOf = (index: number): { free: boolean; gold: number; canAfford: boolean } => {
        if (quoteFor && options) {
          try {
            const q = quoteFor(options[index]!.id) as RespecQuote | null | undefined;
            if (q && typeof q === 'object' && typeof q.free === 'boolean') return evaluate(q);
          } catch {
            // fall through to the request quote
          }
        }
        return evaluate(quote);
      };
      let current = quoteOf(0);

      const { doc } = deps;
      const element = makeEl(doc, 'div', 'owg-respec');
      makeEl(doc, 'h2', 'owg-menu-title', element).textContent = t('hud.respec.title');
      const quoteEl = makeEl(doc, 'div', 'owg-respec-quote', element);
      const warnEl = makeEl(doc, 'div', 'owg-respec-warn', element);
      let selected = 0;
      const radios: ElementLike[] = [];
      let confirmBtn: ElementLike | null = null;
      const render = (): void => {
        quoteEl.textContent = current.free ? t('hud.respec.free') : t('hud.respec.cost', { gold: current.gold });
        warnEl.textContent = current.canAfford ? '' : t('hud.respec.cannotAfford');
        warnEl.style.display = current.canAfford ? 'none' : '';
        if (confirmBtn) (confirmBtn as unknown as { disabled: boolean }).disabled = !current.canAfford;
      };
      const select = (i: number): void => {
        selected = i;
        current = quoteOf(i);
        paint();
        render();
      };
      const paint = (): void => {
        radios.forEach((r, i) => {
          r.setAttribute('aria-checked', i === selected ? 'true' : 'false');
          r.setAttribute('tabindex', i === selected ? '0' : '-1');
          r.className = i === selected ? 'owg-respec-option owg-selected' : 'owg-respec-option';
        });
      };
      if (options) {
        const group = makeEl(doc, 'div', 'owg-respec-options', element);
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', t('hud.respec.options'));
        options.forEach((o, i) => {
          const r = makeEl(doc, 'div', 'owg-respec-option', group);
          r.setAttribute('role', 'radio');
          r.textContent = o.label;
          r.onclick = () => {
            select(i);
          };
          radios.push(r);
        });
        paint();
      }
      const actions = makeEl(doc, 'div', 'owg-respec-actions', element);
      const confirmEl = makeEl(doc, 'button', 'owg-btn owg-respec-confirm', actions);
      confirmBtn = confirmEl;
      confirmEl.textContent = t('hud.respec.confirm');
      render();
      const cancelBtn = makeEl(doc, 'button', 'owg-btn owg-respec-cancel', actions);
      cancelBtn.textContent = t('hud.respec.cancel');

      let decided = false;
      let closer: (() => void) | null = null;
      const onKey = (e: RespecKeyEvent): void => {
        // A Numpad code (Numpad2...) names no arrow, so then the produced key (ArrowDown) decides.
        const k = e.code && !e.code.startsWith('Numpad') ? e.code : (e.key ?? e.code);
        if (k === 'Escape' || e.key === 'Escape') {
          finish('cancel');
          return;
        }
        if (!options || decided) return;
        const step = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        e.preventDefault?.();
        select((selected + step + options.length) % options.length);
      };
      const teardown = (): void => {
        active = false;
        deps.keys?.removeEventListener('keydown', onKey);
      };
      const finish = (kind: 'confirm' | 'cancel'): void => {
        if (decided) return;
        if (kind === 'confirm' && !current.canAfford) return;
        decided = true;
        const c = closer;
        closer = null;
        try {
          c?.();
        } finally {
          teardown();
        }
        try {
          if (kind === 'cancel') request.cancel();
          else if (options) request.confirm(options[selected]!.id);
          else request.confirm();
        } catch (e) {
          console.warn('respecModal: callback failed', e);
        }
      };
      confirmEl.onclick = () => finish('confirm');
      cancelBtn.onclick = () => finish('cancel');

      active = true;
      closer = deps.openModal({
        id: 'respec',
        element,
        dispose: () => {
          // Closed from outside (plugin teardown): treat it as a cancel, once, so the caller never holds a pending respec.
          if (decided) return;
          decided = true;
          teardown();
          try {
            request.cancel();
          } catch (e) {
            console.warn('respecModal: callback failed', e);
          }
        },
      });
      if (!closer) {
        active = false;
        return false;
      }
      deps.keys?.addEventListener('keydown', onKey);
      return true;
    },
  };
}
