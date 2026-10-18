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

export interface RespecModalRequest {
  quote: RespecQuote;
  /** Called once, when the player confirms. The caller (thread 7) spends the gold and calls progression. */
  confirm(): void;
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

export interface RespecModalDeps {
  doc: DocumentLike;
  /** `ctx.hud.openModal` bound with context 'menu'; null when another modal is open. */
  openModal(widget: { id: string; element: ElementLike; dispose?(): void }): (() => void) | null;
  t?: Translate;
  /** The player's gold (inventory.gold); undefined when unknown, in which case the price is assumed affordable. */
  gold?(): number | undefined;
  /** Where Esc is heard (window in the browser). */
  keys?: {
    addEventListener(type: 'keydown', listener: (e: { code?: string; key?: string }) => void): void;
    removeEventListener(type: 'keydown', listener: (e: { code?: string; key?: string }) => void): void;
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
      const raw = [quote.gold, quote.cost].find((n): n is number => typeof n === 'number' && Number.isFinite(n));
      const gold = raw === undefined ? 0 : Math.max(0, Math.round(raw));
      let have: number | undefined;
      try {
        have = deps.gold?.();
      } catch {
        have = undefined;
      }
      // Unknown affordability is assumed true; the caller (thread 7) refuses the spend if it is not.
      const canAfford =
        quote.free === true ||
        (typeof quote.canAfford === 'boolean' ? quote.canAfford : typeof have === 'number' && Number.isFinite(have) ? gold <= have : true);

      const { doc } = deps;
      const element = makeEl(doc, 'div', 'owg-respec');
      makeEl(doc, 'h2', 'owg-menu-title', element).textContent = t('hud.respec.title');
      makeEl(doc, 'div', 'owg-respec-quote', element).textContent = quote.free ? t('hud.respec.free') : t('hud.respec.cost', { gold });
      if (!canAfford) makeEl(doc, 'div', 'owg-respec-warn', element).textContent = t('hud.respec.cannotAfford');
      const actions = makeEl(doc, 'div', 'owg-respec-actions', element);
      const confirmBtn = makeEl(doc, 'button', 'owg-btn owg-respec-confirm', actions);
      confirmBtn.textContent = t('hud.respec.confirm');
      (confirmBtn as unknown as { disabled: boolean }).disabled = !canAfford;
      const cancelBtn = makeEl(doc, 'button', 'owg-btn owg-respec-cancel', actions);
      cancelBtn.textContent = t('hud.respec.cancel');

      let decided = false;
      let closer: (() => void) | null = null;
      const onKey = (e: { code?: string; key?: string }): void => {
        if (e.code === 'Escape' || e.key === 'Escape') finish('cancel');
      };
      const teardown = (): void => {
        active = false;
        deps.keys?.removeEventListener('keydown', onKey);
      };
      const finish = (kind: 'confirm' | 'cancel'): void => {
        if (decided) return;
        if (kind === 'confirm' && !canAfford) return;
        decided = true;
        const c = closer;
        closer = null;
        try {
          c?.();
        } finally {
          teardown();
        }
        try {
          (kind === 'confirm' ? request.confirm : request.cancel)();
        } catch (e) {
          console.warn('respecModal: callback failed', e);
        }
      };
      confirmBtn.onclick = () => finish('confirm');
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
