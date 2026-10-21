import type { DocumentLike, ElementLike } from './dom';
import { defaultHudT } from './strings.en';
import { barFraction } from './StatusBars';
import { makeEl, pct, setShown, type HudWidgetView, type Translate } from './widget';

export interface CompanionActorView {
  health: number;
  maxHealth: number;
}

export interface CompanionPortraitSource {
  /** `companions.active()`. */
  active?(): readonly string[];
  /** `companions.actorId(id)`. */
  actorId?(id: string): string | null | undefined;
  /** `ctx.actors.get(actorId)`; undefined for an unknown actor. */
  actor?(actorId: string): CompanionActorView | null | undefined;
  /** Role and bond rank for a joined companion (A5's `party.options()`); absent for Tobb in Act 1. */
  info?(id: string): { role?: string; rank?: number } | undefined;
  /** Whether a companion is kneeling now, so a re-seated companion keeps the state. */
  isDowned?(id: string): boolean;
  t?: Translate;
}

interface Row {
  actorId: string | null;
  aura: boolean;
  downed: boolean;
  meta: ElementLike;
  root: ElementLike;
  name: ElementLike;
  pip: ElementLike;
  fill: ElementLike;
}

function titleCase(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

/** Companion portrait (top-left): name, health bar and an aura pip per joined companion. */
export class CompanionPortrait implements HudWidgetView {
  readonly id = 'companion-portrait';
  readonly element;
  private readonly t: Translate;
  private readonly rows = new Map<string, Row>();

  constructor(
    private readonly doc: DocumentLike,
    private readonly source: CompanionPortraitSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-companion-list');
    this.reload();
  }

  /**
   * Re-derives who is in the party from `active()` (setup, `save.loaded`, `party.changed`, joins and leaves: a swap
   * emits no `left`). A load starts from a clean slate (aura events arrive again); other refreshes keep the pips.
   */
  reload(keepAura = false): void {
    let ids: readonly string[] = [];
    try {
      ids = this.source.active?.() ?? [];
    } catch {
      ids = [];
    }
    for (const id of [...this.rows.keys()]) if (!ids.includes(id)) this.left(id);
    for (const id of ids) this.joined(id, this.queryActor(id));
    if (!keepAura) {
      for (const [id, row] of this.rows) {
        row.aura = false;
        row.downed = this.source.isDowned?.(id) === true;
        this.refreshMeta(id, row);
      }
    }
    this.update();
  }

  private queryActor(id: string): string | null {
    try {
      return this.source.actorId?.(id) ?? null;
    } catch {
      return null;
    }
  }

  joined(companionId: string, actorId: string | null): void {
    let row = this.rows.get(companionId);
    if (!row) {
      const root = makeEl(this.doc, 'div', 'owg-companion', this.element);
      const head = makeEl(this.doc, 'div', 'owg-companion-head', root);
      const name = makeEl(this.doc, 'div', 'owg-companion-name', head);
      const pip = makeEl(this.doc, 'div', 'owg-aura-pip', head);
      const meta = makeEl(this.doc, 'div', 'owg-companion-meta', head);
      const bar = makeEl(this.doc, 'div', 'owg-companion-bar', root);
      const fill = makeEl(this.doc, 'div', 'owg-companion-fill', bar);
      const label = this.t(`hud.companion.${companionId}`);
      name.textContent = label.startsWith('[[') ? titleCase(companionId) : label;
      pip.setAttribute('title', this.t('hud.companion.aura'));
      row = { actorId, aura: false, downed: this.source.isDowned?.(companionId) === true, meta, root, name, pip, fill };
      this.refreshMeta(companionId, row);
      this.rows.set(companionId, row);
    } else if (actorId) row.actorId = actorId;
    // A join, swap or bond event may have changed the rank: refresh once here, never per frame.
    this.refreshMeta(companionId, row);
    this.update();
  }

  left(companionId: string): void {
    const row = this.rows.get(companionId);
    if (!row) return;
    row.root.remove();
    this.rows.delete(companionId);
    this.update();
  }

  aura(companionId: string, active: boolean): void {
    const row = this.rows.get(companionId);
    if (row) row.aura = active;
    this.update();
  }

  /** `companion.downed` / `companion.stood`: the bar greys and the name shows the kneel. */
  downed(companionId: string, down: boolean): void {
    const row = this.rows.get(companionId);
    if (row) {
      row.downed = down;
      this.refreshMeta(companionId, row);
    }
    this.update();
  }

  private refreshMeta(id: string, row: Row): void {
    row.meta.textContent = this.metaText(id, row.downed);
  }

  private metaText(id: string, downed: boolean): string {
    let info: { role?: string; rank?: number } | undefined;
    try {
      info = this.source.info?.(id);
    } catch {
      info = undefined;
    }
    const parts: string[] = [];
    if (info?.role) parts.push(this.t(`hud.companion.role.${info.role}`));
    if (typeof info?.rank === 'number' && Number.isFinite(info.rank) && info.rank > 0) parts.push(this.t('hud.companion.rank', { rank: info.rank }));
    if (downed) parts.push(this.t('hud.companion.downed'));
    return parts.join(' · ');
  }

  get count(): number {
    return this.rows.size;
  }

  update(): void {
    setShown(this.element, this.rows.size > 0);
    for (const [id, row] of this.rows) {
      const read = (): CompanionActorView | null | undefined => {
        try {
          return row.actorId ? this.source.actor?.(row.actorId) : null;
        } catch {
          return null;
        }
      };
      let a = read();
      // The actor may spawn after the HUD's save.loaded handler: keep asking while it is unknown.
      if (!a) {
        const found = this.queryActor(id);
        if (found) {
          row.actorId = found;
          a = read();
        }
      }
      row.fill.style.width = a ? pct(barFraction(a.health, a.maxHealth)) : '0%';
      row.pip.className = row.aura ? 'owg-aura-pip owg-aura-on' : 'owg-aura-pip';
      row.root.className = row.downed ? 'owg-companion owg-companion-down' : 'owg-companion';
    }
  }

  dispose(): void {
    this.element.remove();
  }
}
