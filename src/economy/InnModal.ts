import type { DocumentLike, ElementLike } from '../hud/dom';
import { makeEl, type Translate } from '../hud/widget';
import { defaultHudT } from '../hud/strings.en';

export interface InnRequest {
  gold: number;
  canAfford: boolean;
  /** Why the room cannot be had (no room rented yet), or null. */
  blocked: 'no-room' | null;
  confirm(): void;
  cancel(): void;
}

export interface InnModalDeps {
  doc: DocumentLike;
  openModal(widget: { id: string; element: ElementLike; dispose?(): void }): (() => void) | null;
  t?: Translate;
}

/** One-shot confirm dialog for a night at the inn; the Inn service does the paying and resting. */
/** Returns a function that cancels the dialog (Esc), or null when another modal is open. */
export function openInnModal(deps: InnModalDeps, req: InnRequest): (() => void) | null {
  const t = deps.t ?? defaultHudT;
  const { doc } = deps;
  const element = makeEl(doc, 'div', 'owg-respec');
  makeEl(doc, 'h2', 'owg-menu-title', element).textContent = t('economy.inn.title');
  const usable = req.blocked === null;
  makeEl(doc, 'div', 'owg-respec-quote', element).textContent = usable ? t('economy.inn.quote', { gold: req.gold }) : t('economy.inn.noRoom');
  if (usable && !req.canAfford) makeEl(doc, 'div', 'owg-respec-warn', element).textContent = t('economy.inn.cannotAfford');
  const actions = makeEl(doc, 'div', 'owg-respec-actions', element);
  const yes = makeEl(doc, 'button', 'owg-btn', actions);
  yes.textContent = t('economy.inn.confirm');
  (yes as unknown as { disabled: boolean }).disabled = !usable || !req.canAfford;
  const no = makeEl(doc, 'button', 'owg-btn', actions);
  no.textContent = t('economy.inn.cancel');

  let decided = false;
  let closer: (() => void) | null = null;
  const finish = (kind: 'confirm' | 'cancel'): void => {
    if (decided) return;
    if (kind === 'confirm' && (!usable || !req.canAfford)) return;
    decided = true;
    const c = closer;
    closer = null;
    c?.();
    (kind === 'confirm' ? req.confirm : req.cancel)();
  };
  yes.onclick = () => finish('confirm');
  no.onclick = () => finish('cancel');
  closer = deps.openModal({
    id: 'inn',
    element,
    dispose: () => {
      if (decided) return;
      decided = true;
      req.cancel();
    },
  });
  return closer === null ? null : () => finish('cancel');
}
