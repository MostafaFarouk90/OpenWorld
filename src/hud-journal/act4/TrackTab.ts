import type { GameContext } from '../../core/Game';
import type { FavourSource } from '../../state/favour';
import { FAVOUR_MAX, FAVOUR_MIN, bandFor } from '../../state/favour';
import type { FavourTrack } from '../../state/favour';
import type { JournalTab } from '../../quests/journalTabs';
import { BAR_TICKS } from '../FavourTab';

/** One favour track's tab: its id, the flag that shows it, and its three strings (tab title, heading, row name). */
export interface TrackTabSpec {
  id: string;
  track: FavourTrack;
  flag: string;
  titleKey: string;
  headingKey: string;
  nameKey: string;
}

interface Row { value: HTMLElement; band: HTMLElement; fill: HTMLElement; last: HTMLElement }

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.min(FAVOUR_MAX, Math.max(FAVOUR_MIN, v)) : FAVOUR_MIN;
}

/**
 * Act 4 L9: K15's dragons' trust tab made generic over one favour track (DragonsTab stays as shipped; folding it onto this
 * is a later cleanup). The Houses' bar, band and ticks plus the last change. Visible is read from the flag every time, so a
 * load re-derives it; the last change clears on load.
 */
export class TrackTab {
  readonly tab: JournalTab;
  private root: HTMLElement | null = null;
  private row: Row | null = null;
  /** Source word of the latest change. Empty after a load. */
  private last = '';
  private readonly offs: Array<() => void> = [];

  constructor(private readonly ctx: GameContext, private readonly spec: TrackTabSpec) {
    this.tab = {
      id: spec.id,
      titleKey: spec.titleKey,
      visible: () => ctx.state.getBool(spec.flag),
      render: (root) => this.render(root),
    };
    this.offs.push(ctx.events.on('favour.changed', (e) => {
      if (e.track !== this.spec.track) return;
      this.last = this.changeText(e.delta, e.source);
      if (this.live()) this.patch();
    }));
    this.offs.push(ctx.events.on('save.loaded', () => {
      this.last = '';
      if (this.live()) this.patch();
    }));
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.root = null;
    this.row = null;
  }

  private t(key: string, params?: Record<string, string | number>): string { return this.ctx.strings.t(key, params); }

  private live(): boolean { return !!this.root && this.root.isConnected && this.row !== null; }

  private changeText(delta: number, source: FavourSource): string {
    if (!Number.isFinite(delta) || delta === 0) return '';
    return `${delta > 0 ? '+' : ''}${delta} ${this.t(`hud.journal.favour.source.${source}`)}`;
  }

  private render(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const el = (cls: string, text?: string): HTMLElement => {
      const e = doc.createElement('div');
      e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    this.root = root;
    root.replaceChildren();
    root.appendChild(el('journal-heading', this.t(this.spec.headingKey)));
    const row = el('favour-row');
    const head = el('favour-head');
    head.appendChild(el('favour-name', this.t(this.spec.nameKey)));
    const band = el('favour-band');
    const value = el('favour-value');
    head.append(band, value);
    const bar = el('favour-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', String(FAVOUR_MIN));
    bar.setAttribute('aria-valuemax', String(FAVOUR_MAX));
    bar.style.position = 'relative';
    const fill = el('favour-fill');
    bar.appendChild(fill);
    for (const tick of BAR_TICKS) {
      const m = el('favour-tick');
      m.style.position = 'absolute';
      m.style.left = `${tick}%`;
      bar.appendChild(m);
    }
    const last = el('favour-last');
    row.append(head, bar, last);
    root.appendChild(row);
    this.row = { value, band, fill, last };
    this.patch();
  }

  private patch(): void {
    const row = this.row;
    if (!row) return;
    const v = clamp(this.ctx.state.favour(this.spec.track));
    row.value.textContent = String(Math.round(v));
    row.band.textContent = this.t(`hud.journal.favour.band.${bandFor(v)}`);
    row.fill.style.width = `${v}%`;
    row.fill.parentElement?.setAttribute('aria-valuenow', String(Math.round(v)));
    row.last.textContent = this.last
      ? this.t('hud.journal.favour.last', { change: this.last })
      : this.t('hud.journal.favour.none');
  }
}
