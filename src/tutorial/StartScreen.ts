import type { HudWidget } from '../ui/HudLayer';
import type { TutorialMode } from './types';

export interface StartScreenDeps {
  doc: Pick<Document, 'createElement'>;
  t: (key: string) => string;
  canSkipToKettlewick: boolean;
  hintsAlways: boolean;
  onChoose(mode: TutorialMode): void;
  onHints(on: boolean): void;
}

/** The mode picker shown before the tutorial; the first choice wins, later clicks are ignored. */
export function createStartScreen(deps: StartScreenDeps): HudWidget {
  const { doc, t } = deps;
  const element = doc.createElement('div');
  element.className = 'tutorial-start';
  Object.assign(element.style, {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px',
    background: 'rgba(8,8,12,0.94)', color: '#eee', pointerEvents: 'auto',
  });
  const title = doc.createElement('h2');
  title.textContent = t('tutorial.start.title');
  element.appendChild(title);

  let used = false;
  const cleanups: Array<() => void> = [];
  const addButton = (labelKey: string, mode: TutorialMode, cls: string): void => {
    const b = doc.createElement('button');
    b.className = cls;
    b.textContent = t(labelKey);
    const handler = (): void => {
      if (used) return;
      used = true;
      deps.onChoose(mode);
    };
    b.addEventListener('click', handler);
    cleanups.push(() => b.removeEventListener('click', handler));
    element.appendChild(b);
  };
  addButton('tutorial.start.begin', 'full', 'tutorial-start__begin');
  addButton('tutorial.start.veteran', 'veteran', 'tutorial-start__veteran');
  if (deps.canSkipToKettlewick) addButton('tutorial.start.kettlewick', 'kettlewick', 'tutorial-start__kettlewick');

  const label = doc.createElement('label');
  label.className = 'tutorial-start__hints';
  const box = doc.createElement('input') as HTMLInputElement;
  box.type = 'checkbox';
  box.checked = deps.hintsAlways;
  const onChange = (): void => deps.onHints(box.checked);
  box.addEventListener('change', onChange);
  cleanups.push(() => box.removeEventListener('change', onChange));
  const text = doc.createElement('span');
  text.textContent = t('tutorial.start.hints');
  label.appendChild(box);
  label.appendChild(text);
  element.appendChild(label);

  return {
    id: 'tutorial.start',
    element,
    dispose() {
      for (const c of cleanups) c();
      element.remove();
    },
  };
}
