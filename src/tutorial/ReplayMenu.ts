import type { HudWidget } from '../ui/HudLayer';

export interface ReplayMenuDeps {
  doc: Pick<Document, 'createElement'>;
  t: (key: string) => string;
  drills: { id: string; labelKey: string }[];
  onPick(id: string): void;
  onClose(): void;
}

/** Lists the drills that can be replayed, one button each, plus Close. */
export function createReplayMenu(deps: ReplayMenuDeps): HudWidget {
  const { doc, t } = deps;
  const element = doc.createElement('div');
  element.className = 'tutorial-replay';
  Object.assign(element.style, {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px',
    background: 'rgba(8,8,12,0.94)', color: '#eee', pointerEvents: 'auto',
  });
  const title = doc.createElement('h2');
  title.textContent = t('tutorial.replay.title');
  element.appendChild(title);

  const cleanups: Array<() => void> = [];
  const addButton = (text: string, cls: string, fn: () => void): void => {
    const b = doc.createElement('button');
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', fn);
    cleanups.push(() => b.removeEventListener('click', fn));
    element.appendChild(b);
  };
  for (const d of deps.drills) addButton(t(d.labelKey), 'tutorial-replay__drill', () => deps.onPick(d.id));
  addButton(t('tutorial.replay.close'), 'tutorial-replay__close', () => deps.onClose());

  return {
    id: 'tutorial.replay',
    element,
    dispose() {
      for (const c of cleanups) c();
      element.remove();
    },
  };
}
