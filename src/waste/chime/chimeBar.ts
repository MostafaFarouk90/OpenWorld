// The chime strip on screen: R13's song bar (the tempering strip's cells, judgement colours and playhead, styled by
// hud/hudStyles.ts) with each strike cell labelled by its pillar and attack key, so the plaque's notation can be read.
import type { ChimeView } from './chimePuzzle';

interface El { className: string; style: { display: string }; textContent: string | null; appendChild(c: unknown): unknown }
interface Doc { createElement(tag: string): El }

export interface ChimeBarWidget {
  id: string;
  element: unknown;
  update(dt: number): void;
  dispose(): void;
}

/** The label a strike's cell carries: pillar, then key ("3·2"). */
export const cellLabel = (pillar: number, key: number): string => `${pillar}·${key}`;

/** The text key of the label over the strip. */
export function barLabelKey(v: ChimeView): string {
  if (v.mode === 'replay') return v.hum ? 'waste.chime.bar.hum' : 'waste.chime.bar.replay';
  if (v.position < 0) return 'waste.chime.bar.count';
  return v.wide ? 'waste.chime.bar.wide' : 'waste.chime.bar.run';
}

/** Returns null without a document (headless boots draw nothing). */
export function createChimeBar(doc: Doc | null, view: () => ChimeView | null, text: (key: string, vars: Record<string, string | number>) => string): ChimeBarWidget | null {
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
  for (let i = 0; i < 16; i++) {
    const c = doc.createElement('div');
    c.className = 'owg-tempering-cell';
    strip.appendChild(c);
    cells.push(c);
  }
  return {
    id: 'waste-chime-bar',
    element: root,
    update() {
      const v = view();
      if (!v) {
        root.style.display = 'none';
        return;
      }
      root.style.display = '';
      label.textContent = text(barLabelKey(v), { n: v.phrase + 1 });
      const head = Math.floor(v.position);
      for (let i = 0; i < v.stepsInBar; i++) {
        const k = v.steps.indexOf(i);
        const cls = ['owg-tempering-cell'];
        if (k >= 0) cls.push('owg-tempering-mark');
        if (k >= 0 && v.judged[k]) cls.push(`owg-tempering-${v.judged[k]}`);
        if (i === head) cls.push('owg-tempering-head');
        cells[i]!.className = cls.join(' ');
        cells[i]!.textContent = k >= 0 ? cellLabel(v.pillars[k]!, v.keys[k]!) : '';
      }
    },
    dispose() {
      /* the HUD layer removes the element */
    },
  };
}
