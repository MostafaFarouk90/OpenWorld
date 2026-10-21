import type { ElementLike, DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { barFraction } from './StatusBars';
import { makeEl, pct, setShown, type HudWidgetView, type Translate } from './widget';

export interface StructureActorView {
  health: number;
  maxHealth: number;
}

export interface StructureBarSource {
  /** `ctx.actors.get(id)`: structures are actors; health is read from it every update (a restore emits no event). */
  actor?(id: string): StructureActorView | null | undefined;
  /** `waves.structure(id)`: kind and maximum health, the fallback when the actor is not found. */
  structure?(id: string): { kind: string; maxHealth: number } | undefined;
  t?: Translate;
}

interface Row {
  id: string;
  kind: string;
  /** Last health from `structure.damaged`, used when the actor cannot be read. */
  health: number;
  root: ElementLike;
  fill: ElementLike;
}

/** The bar shows the barricade and up to this many carts. */
export const STRUCTURE_BAR_MAX_ROWS = 4;
/** After the last damage or clear event the bars stay this long when no wave is running. */
export const STRUCTURE_BAR_LINGER_SECONDS = 8;

const isCart = (id: string): boolean => id.includes('.cart.');

/** Barricade and brazier-cart health (top-centre, under the boss bar). Advances only on `update(dt)`. */
export class StructureBar implements HudWidgetView {
  readonly id = 'structure-bar';
  readonly element;
  private readonly t: Translate;
  private readonly rows = new Map<string, Row>();
  private waveActive = false;
  private idle = 0;

  constructor(
    private readonly doc: DocumentLike,
    private readonly source: StructureBarSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-structure-list');
    setShown(this.element, false);
  }

  /** `structure.damaged`: start tracking (the first event of a structure arrives at full health) and wake the bars. */
  damaged(id: string, health: number): void {
    this.idle = 0;
    const row = this.rows.get(id);
    if (row) {
      if (Number.isFinite(health)) row.health = health;
      this.update(0);
      return;
    }
    const kind = this.source.structure?.(id)?.kind ?? (isCart(id) ? 'cart' : 'barricade');
    if (!this.knownMax(id)) return;
    // Barricade first, then carts by id; the cap drops later carts.
    if (this.rows.size >= STRUCTURE_BAR_MAX_ROWS) return;
    const root = makeEl(this.doc, 'div', `owg-structure owg-structure-${kind}`);
    makeEl(this.doc, 'div', 'owg-structure-name', root).textContent = this.t(`hud.structure.${kind}`);
    const bar = makeEl(this.doc, 'div', 'owg-structure-bar', root);
    const fill = makeEl(this.doc, 'div', 'owg-structure-fill', bar);
    this.element.append(root);
    this.rows.set(id, { id, kind, health: Number.isFinite(health) ? health : 0, root, fill });
    this.sortRows();
    this.update(0);
  }

  destroyed(id: string): void {
    this.drop(id);
    this.idle = 0;
    this.update(0);
  }

  /** `wave.started`: carts of the last wave are gone without a destroyed event; the barricade stays and is announced again. */
  waveStarted(): void {
    this.waveActive = true;
    this.idle = 0;
    this.dropCarts();
    this.update(0);
  }

  /** `wave.cleared`: no wave runs; the bars linger a few seconds. */
  waveCleared(): void {
    this.waveActive = false;
    this.idle = 0;
    this.dropCarts();
    this.update(0);
  }

  /** `waves.failed`, a stop, `save.loaded`: the restart removes the carts and restores the barricade. */
  reset(all = false): void {
    this.dropCarts();
    if (all) {
      for (const id of [...this.rows.keys()]) this.drop(id);
      this.waveActive = false;
    }
    this.idle = 0;
    this.update(0);
  }

  get count(): number {
    return this.rows.size;
  }

  private knownMax(id: string): boolean {
    const m = this.source.structure?.(id)?.maxHealth ?? this.actorOf(id)?.maxHealth;
    return typeof m === 'number' && m > 0;
  }

  private actorOf(id: string): StructureActorView | undefined {
    try {
      return this.source.actor?.(id) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private drop(id: string): void {
    const row = this.rows.get(id);
    if (!row) return;
    row.root.remove();
    this.rows.delete(id);
  }

  private dropCarts(): void {
    for (const id of [...this.rows.keys()]) if (isCart(id)) this.drop(id);
  }

  private sortRows(): void {
    const ordered = [...this.rows.values()].sort((a, b) => Number(isCart(a.id)) - Number(isCart(b.id)) || a.id.localeCompare(b.id));
    this.element.replaceChildren(...ordered.map((r) => r.root));
  }

  update(frameTime = 0): void {
    if (Number.isFinite(frameTime) && frameTime > 0) this.idle += frameTime;
    for (const row of [...this.rows.values()]) {
      const a = this.actorOf(row.id);
      const max = this.source.structure?.(row.id)?.maxHealth ?? a?.maxHealth;
      if (!(typeof max === 'number' && max > 0)) {
        this.drop(row.id);
        continue;
      }
      const health = a ? a.health : row.health;
      row.fill.style.width = pct(barFraction(health, max));
    }
    setShown(this.element, this.rows.size > 0 && (this.waveActive || this.idle < STRUCTURE_BAR_LINGER_SECONDS));
  }

  dispose(): void {
    this.element.remove();
    this.rows.clear();
  }
}
