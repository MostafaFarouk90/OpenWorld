import type { DocumentLike, ElementLike } from './dom';
import { defaultHudT } from './strings.en';
import { makeEl, type HudWidgetView, type Translate } from './widget';

export interface PartyScreenOption {
  id: string;
  nameKey: string;
  role: string;
  rank: number;
  active: boolean;
}

/** A5's party service, plus `companions.maxActive()` and the downed set. All reads are soft. */
export interface PartyScreenSource {
  canChange(): boolean;
  options(): readonly PartyScreenOption[];
  maxActive(): number;
  change(ids: readonly string[]): boolean;
  /** Companion ids currently kneeling (`companion.downed` without `companion.stood`). */
  downed?(): ReadonlySet<string>;
  close(): void;
  t?: Translate;
}

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/**
 * The Party screen (key P, or opened by `party.offered`). Read-only unless the party window is open (`canChange()`),
 * with a locked second seat while `maxActive() === 1`. Controls follow `canChange()` live, so a window that expires
 * while the screen is open disables them.
 */
export class PartyScreen implements HudWidgetView {
  readonly id = 'party-screen';
  readonly element: ElementLike;
  private readonly t: Translate;
  private readonly list: ElementLike;
  private readonly slotNote: ElementLike;
  private readonly status: ElementLike;
  private readonly applyBtn: ElementLike;
  private readonly selected = new Set<string>();
  private sig = '';
  private locked = true;

  constructor(
    private readonly doc: DocumentLike,
    private readonly source: PartyScreenSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-card owg-party');
    makeEl(doc, 'h2', 'owg-card-title', this.element).textContent = this.t('hud.party.title');
    this.list = makeEl(doc, 'div', 'owg-party-list', this.element);
    this.slotNote = makeEl(doc, 'div', 'owg-party-slot', this.element);
    this.status = makeEl(doc, 'div', 'owg-party-status', this.element);
    const actions = makeEl(doc, 'div', 'owg-party-actions', this.element);
    this.applyBtn = makeEl(doc, 'button', 'owg-btn', actions);
    this.applyBtn.textContent = this.t('hud.party.apply');
    this.applyBtn.className = 'owg-btn owg-btn-off';
    this.applyBtn.onclick = () => this.apply();
    const closeBtn = makeEl(doc, 'button', 'owg-btn', actions);
    closeBtn.textContent = this.t('hud.party.close');
    closeBtn.onclick = () => source.close();
    makeEl(doc, 'div', 'owg-card-hint', this.element).textContent = this.t('hud.party.hint');
    this.resyncSelection();
    this.update();
  }

  /** True while changes are accepted. */
  get canChange(): boolean {
    return !this.locked;
  }

  get selectedIds(): string[] {
    return [...this.selected];
  }

  private options(): readonly PartyScreenOption[] {
    return safe(() => this.source.options(), [] as readonly PartyScreenOption[]);
  }

  private maxActive(): number {
    const n = safe(() => this.source.maxActive(), 1);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private resyncSelection(): void {
    this.selected.clear();
    for (const o of this.options()) if (o.active) this.selected.add(o.id);
  }

  /** A click on a companion's row: fill, free or swap a seat within `maxActive()`. */
  toggle(id: string): void {
    if (this.locked) {
      this.setStatus('hud.party.locked');
      return;
    }
    if (!this.options().some((o) => o.id === id)) return;
    const max = this.maxActive();
    if (this.selected.has(id)) {
      if (this.selected.size <= 1) return; // the party is never empty
      this.selected.delete(id);
    } else if (this.selected.size < max) {
      this.selected.add(id);
    } else if (max === 1) {
      this.selected.clear();
      this.selected.add(id);
    } else {
      this.setStatus('hud.party.full');
      return;
    }
    this.setStatus(null);
    this.update();
  }

  apply(): void {
    if (!safe(() => this.source.canChange(), false)) {
      this.setStatus('hud.party.locked');
      this.update();
      return;
    }
    let ok = false;
    try {
      ok = this.source.change([...this.selected]);
    } catch {
      ok = false;
    }
    this.setStatus(ok ? 'hud.party.changed' : 'hud.party.refused');
    this.resyncSelection();
    this.update();
  }

  private setStatus(key: string | null): void {
    this.status.textContent = key ? this.t(key) : '';
  }

  update(): void {
    const canChange = safe(() => this.source.canChange(), false);
    const opts = this.options();
    const max = this.maxActive();
    const downed = safe(() => this.source.downed?.() ?? new Set<string>(), new Set<string>());
    if (canChange !== !this.locked) {
      this.locked = !canChange;
      if (!canChange) this.resyncSelection();
    }
    // Drop selections that no longer exist (a companion left while the screen was open).
    for (const id of [...this.selected]) if (!opts.some((o) => o.id === id)) this.selected.delete(id);
    const sig = JSON.stringify([canChange, max, opts.map((o) => [o.id, o.rank, o.active]), [...this.selected], [...downed]]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.list.replaceChildren();
    for (const o of opts) {
      const row = makeEl(this.doc, 'div', this.selected.has(o.id) ? 'owg-party-row owg-party-on' : 'owg-party-row', this.list);
      const name = this.t(o.nameKey);
      makeEl(this.doc, 'div', 'owg-party-name', row).textContent = name.startsWith('[[') ? o.id : name;
      const bits = [this.t(`hud.companion.role.${o.role}`), this.t('hud.companion.rank', { rank: o.rank })];
      if (downed.has(o.id)) bits.push(this.t('hud.companion.downed'));
      makeEl(this.doc, 'div', 'owg-party-meta', row).textContent = bits.join(' · ');
      const btn = makeEl(this.doc, 'button', 'owg-btn', row);
      btn.textContent = this.t(this.selected.has(o.id) ? 'hud.party.leave' : 'hud.party.take');
      if (this.locked) btn.className = 'owg-btn owg-btn-off';
      btn.onclick = () => this.toggle(o.id);
    }
    this.slotNote.textContent = max <= 1 ? this.t('hud.party.slot2') : '';
    this.applyBtn.className = this.locked ? 'owg-btn owg-btn-off' : 'owg-btn';
    if (this.locked && !this.status.textContent) this.status.textContent = this.t('hud.party.readonly');
  }

  dispose(): void {
    this.element.remove();
  }
}
