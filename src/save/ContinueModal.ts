import type { HudWidget } from '../ui/HudLayer';
import type { ContinueModalDeps } from '../map/viewTypes';

export interface ContinueModalWidget extends HudWidget {
  dispose(): void;
  focusDefault(): void;
  /** Keyboard `code`: Enter activates the default button, ArrowUp/Down moves focus. */
  key(code: string): void;
}

export function createContinueModal(deps: ContinueModalDeps): ContinueModalWidget {
  const doc = deps.doc ?? document;
  const element = doc.createElement('div');
  const title = doc.createElement('h2');
  element.className = 'continue-modal';
  Object.assign(element.style, {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px',
    background: 'rgba(8,8,12,0.94)', color: '#eee',
  });
  title.textContent = deps.t('save.title');
  element.appendChild(title);

  const notices: string[] = [];
  if (deps.storageUnavailable) notices.push('save.unavailable.notice');
  if (deps.saveProblem) notices.push(`save.problem.${deps.saveProblem}`);
  for (const k of notices) {
    const p = doc.createElement('p');
    p.className = 'continue-modal__notice';
    p.textContent = deps.t(k);
    element.appendChild(p);
  }

  let used = false;
  const buttons: HTMLElement[] = [];
  const onActions: Array<() => void> = [];
  const activate = (fn: () => void) => () => {
    if (used) return;
    used = true;
    fn();
  };
  const cleanups: Array<() => void> = [];
  const addButton = (labelKey: string, fn: () => void, cls: string): HTMLElement => {
    const b = doc.createElement('button');
    b.className = cls;
    b.textContent = deps.t(labelKey);
    const handler = activate(fn);
    b.addEventListener('click', handler);
    cleanups.push(() => b.removeEventListener('click', handler));
    element.appendChild(b);
    buttons.push(b);
    onActions.push(handler);
    return b;
  };

  if (deps.hasSave) addButton('save.continue', () => deps.onContinue(), 'continue-modal__continue');
  addButton('save.newGame', () => deps.onNewGame(), 'continue-modal__new');

  let focused = 0;
  const focusAt = (i: number): void => {
    focused = (i + buttons.length) % buttons.length;
    buttons[focused]!.focus?.();
  };

  function key(code: string): void {
    if (code === 'Enter' || code === 'NumpadEnter') onActions[focused === -1 ? 0 : focused]?.();
    else if (code === 'ArrowDown') focusAt(focused + 1);
    else if (code === 'ArrowUp') focusAt(focused - 1);
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    key(e.code);
  };
  element.addEventListener('keydown', onKey);

  return {
    id: 'save.continue-modal',
    element,
    key,
    focusDefault() {
      focusAt(0);
    },
    dispose() {
      for (const c of cleanups) c();
      element.removeEventListener('keydown', onKey);
      element.remove();
    },
  };
}
