import type { GameContext } from '../core/Game';
import type { FavourSource, FavourTrack } from '../state/favour';
import { FAVOUR_MAX, FAVOUR_MIN, bandFor } from '../state/favour';
import { FAVOUR_TAB_FLAG, TAB_FAVOUR, type JournalTab } from '../quests/journalTabs';

/** Only the three Houses; the dragons and the Ashwalkers stay off this tab. */
export const HOUSE_TRACKS: readonly FavourTrack[] = ['halvard', 'oswin', 'grisel'];
/** Band edges drawn as ticks on the bar. */
export const BAR_TICKS: readonly number[] = [25, 50, 70];

interface Row { value: HTMLElement; band: HTMLElement; fill: HTMLElement; last: HTMLElement }

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.min(FAVOUR_MAX, Math.max(FAVOUR_MIN, v)) : FAVOUR_MIN;
}

export class FavourTab {
  readonly tab: JournalTab;
  private root: HTMLElement | null = null;
  private rows = new Map<FavourTrack, Row>();
  /** Source word of the latest change per House. Empty after a load. */
  private readonly last = new Map<FavourTrack, string>();
  private readonly offs: Array<() => void> = [];

  constructor(private readonly ctx: GameContext) {
    this.tab = {
      id: TAB_FAVOUR,
      titleKey: 'quest.journal.tab.favour',
      visible: () => ctx.state.getBool(FAVOUR_TAB_FLAG),
      render: (root) => this.render(root),
    };
    this.offs.push(ctx.events.on('favour.changed', (e) => {
      if (!HOUSE_TRACKS.includes(e.track)) return;
      this.last.set(e.track, this.changeText(e.delta, e.source));
      if (this.live()) this.patch(e.track);
    }));
    this.offs.push(ctx.events.on('save.loaded', () => {
      this.last.clear();
      if (this.live()) for (const track of HOUSE_TRACKS) this.patch(track);
    }));
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.root = null;
    this.rows.clear();
  }

  private t(key: string, params?: Record<string, string | number>): string { return this.ctx.strings.t(key, params); }

  private live(): boolean { return !!this.root && this.root.isConnected && this.rows.size > 0; }

  private changeText(delta: number, source: FavourSource): string {
    if (!Number.isFinite(delta) || delta === 0) return '';
    const sourceWord = this.t(`hud.journal.favour.source.${source}`);
    return `${delta > 0 ? '+' : ''}${delta} ${sourceWord}`;
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
    this.rows = new Map();
    root.replaceChildren();
    root.appendChild(el('journal-heading', this.t('hud.journal.favour.heading')));
    for (const track of HOUSE_TRACKS) {
      const row = el('favour-row');
      const head = el('favour-head');
      head.appendChild(el('favour-name', this.t(`hud.journal.favour.${track}`)));
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
      this.rows.set(track, { value, band, fill, last });
      this.patch(track);
    }
  }

  /** Writes one House's row from state; cheap enough to call on every change. */
  private patch(track: FavourTrack): void {
    const row = this.rows.get(track);
    if (!row) return;
    const v = clamp(this.ctx.state.favour(track));
    row.value.textContent = String(Math.round(v));
    row.band.textContent = this.t(`hud.journal.favour.band.${bandFor(v)}`);
    row.fill.style.width = `${v}%`;
    row.fill.parentElement?.setAttribute('aria-valuenow', String(Math.round(v)));
    const change = this.last.get(track) ?? '';
    row.last.textContent = change
      ? this.t('hud.journal.favour.last', { change })
      : this.t('hud.journal.favour.none');
  }
}
