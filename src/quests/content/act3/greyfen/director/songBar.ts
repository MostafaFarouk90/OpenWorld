// The water-song's bar on screen: the tempering screen's own strip (its cells, strike marks, judgement colours and playhead,
// styled by hud/hudStyles.ts) drawn from the song's view, so the grid the player must hit can be seen.
import type { SongView } from './song';

interface Cell { className: string }
interface El { className: string; style: { display: string }; textContent: string | null; appendChild(c: unknown): unknown }
interface Doc { createElement(tag: string): El & Cell }

export interface SongBarWidget {
  id: string;
  element: unknown;
  update(dt: number): void;
  dispose(): void;
}

/** `text` is the prompt over the strip (the count-in and the widened window say so). Returns null without a document. */
export function createSongBar(doc: Doc | null, view: () => SongView | null, text: (key: string) => string): SongBarWidget | null {
  if (!doc) return null;
  const root = doc.createElement('div');
  root.className = 'owg-card owg-tempering';
  root.style.display = 'none';
  const label = doc.createElement('div');
  label.className = 'owg-tempering-state';
  root.appendChild(label);
  const strip = doc.createElement('div');
  strip.className = 'owg-tempering-strip';
  root.appendChild(strip);
  const cells: El[] = [];
  for (let i = 0; i < 16; i++) { const c = doc.createElement('div'); c.className = 'owg-tempering-cell'; strip.appendChild(c); cells.push(c); }
  return {
    id: 'greyfen-song-bar',
    element: root,
    update() {
      const v = view();
      if (!v) { root.style.display = 'none'; return; }
      root.style.display = '';
      label.textContent = v.position < 0 ? text('greyfen.q.r13.bar.count') : text(v.wide ? 'greyfen.q.r13.bar.wide' : `greyfen.q.r13.bar.${v.kind}`);
      const head = Math.floor(v.position);
      for (let i = 0; i < v.stepsInBar; i++) {
        const k = v.steps.indexOf(i);
        const cls = ['owg-tempering-cell'];
        if (k >= 0) cls.push('owg-tempering-mark');
        if (k >= 0 && v.judged[k]) cls.push(`owg-tempering-${v.judged[k]}`);
        if (i === head) cls.push('owg-tempering-head');
        cells[i]!.className = cls.join(' ');
      }
    },
    dispose() { /* the HUD layer removes the element */ },
  };
}
