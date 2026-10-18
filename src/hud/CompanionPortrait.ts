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
  t?: Translate;
}

interface Row {
  actorId: string | null;
  aura: boolean;
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

  /** Re-derives who is joined from the service (setup and `save.loaded`; a load emits no join events). */
  reload(): void {
    let ids: readonly string[] = [];
    try {
      ids = this.source.active?.() ?? [];
    } catch {
      ids = [];
    }
    for (const id of [...this.rows.keys()]) if (!ids.includes(id)) this.left(id);
    for (const id of ids) {
      let actorId: string | null = null;
      try {
        actorId = this.source.actorId?.(id) ?? null;
      } catch {
        actorId = null;
      }
      this.joined(id, actorId);
    }
    this.update();
  }

  joined(companionId: string, actorId: string | null): void {
    let row = this.rows.get(companionId);
    if (!row) {
      const root = makeEl(this.doc, 'div', 'owg-companion', this.element);
      const head = makeEl(this.doc, 'div', 'owg-companion-head', root);
      const name = makeEl(this.doc, 'div', 'owg-companion-name', head);
      const pip = makeEl(this.doc, 'div', 'owg-aura-pip', head);
      const bar = makeEl(this.doc, 'div', 'owg-companion-bar', root);
      const fill = makeEl(this.doc, 'div', 'owg-companion-fill', bar);
      const label = this.t(`hud.companion.${companionId}`);
      name.textContent = label.startsWith('[[') ? titleCase(companionId) : label;
      pip.setAttribute('title', this.t('hud.companion.aura'));
      row = { actorId, aura: false, root, name, pip, fill };
      this.rows.set(companionId, row);
    } else if (actorId) row.actorId = actorId;
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

  get count(): number {
    return this.rows.size;
  }

  update(): void {
    setShown(this.element, this.rows.size > 0);
    for (const row of this.rows.values()) {
      let a: CompanionActorView | null | undefined;
      try {
        a = row.actorId ? this.source.actor?.(row.actorId) : null;
      } catch {
        a = null;
      }
      row.fill.style.width = a ? pct(barFraction(a.health, a.maxHealth)) : '0%';
      row.pip.className = row.aura ? 'owg-aura-pip owg-aura-on' : 'owg-aura-pip';
    }
  }

  dispose(): void {
    this.element.remove();
  }
}
