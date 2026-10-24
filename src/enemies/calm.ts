import type { CalmUiPort, InventoryPort } from './ports';
import type { MercyDef } from './types';

/** The part of the inventory service Calm uses: `remove` only, never a loot grant. */
export type CalmInventory = Pick<InventoryPort, 'count' | 'remove'>;

/** What a Calm hold can pay: an item from the inventory, or the Warm Hand (10 Burn, no item). */
export type CalmOption = { kind: 'item'; itemId: string; count: number } | { kind: 'warmHand' } | { kind: 'free' };

/** What a Calm prompt knows about the beast besides its def (A6b). */
export interface CalmContext {
  /** A cooling hit has it staggered (the crawler's free Calm). */
  cooled?: boolean;
  /** v0.7: the Peat Shambler has been pulled out of the peat (`MercyDef.precondition: 'pulledOut'`). */
  pulledOut?: boolean;
  /** v0.7: a flyer is down, after a bolt hit or on its nest (`precondition: 'grounded'`). */
  grounded?: boolean;
}

/** Owner name of the wheel claim (`input.claimWheel`). */
export const CALM_WHEEL_OWNER = 'enemies.calm';

/**
 * The ways the player can pay for a Calm now, cheapest first: each def offering the inventory holds enough of,
 * in the def's order (Hearth Bread before Ember Coal), then the Warm Hand when the beast takes it. Empty means
 * no prompt (design section 2: no offering, no Calm).
 */
export function calmOptions(
  mercy: Pick<MercyDef, 'offerings' | 'warmHand' | 'delivery' | 'freeCalm' | 'precondition'>,
  inventory: CalmInventory | undefined,
  context: CalmContext = {},
): CalmOption[] {
  // v0.7: a set precondition needs its context flag to be exactly true, or there is no prompt at all.
  if (mercy.precondition && context[mercy.precondition] !== true) return [];
  const out: CalmOption[] = [];
  if (mercy.freeCalm === 'always' || (mercy.freeCalm === 'cooled' && context.cooled)) out.push({ kind: 'free' });
  // A thrown offering (the Cooling Draught) is never a hold-T item: it has its own throw prompt (ground/throw.ts).
  if (mercy.delivery !== 'thrown') {
    for (const o of mercy.offerings ?? []) {
      if ((inventory?.count(o.itemId) ?? 0) >= o.count) out.push({ kind: 'item', itemId: o.itemId, count: o.count });
    }
  }
  if (mercy.warmHand) out.push({ kind: 'warmHand' });
  return out;
}

/** True when `option` is still payable (an item the inventory still holds, or the Warm Hand). */
export function calmPayable(option: CalmOption, inventory: CalmInventory | undefined): boolean {
  return option.kind === 'warmHand' || option.kind === 'free' || (inventory?.count(option.itemId) ?? 0) >= option.count;
}

/** The prompt's `{offering}` text: the item's name, or "Warm Hand, 10 Burn". */
export function calmOptionLabel(option: CalmOption, text: (key: string) => string): string {
  if (option.kind === 'free') return text('enemies.calm.free');
  return option.kind === 'warmHand' ? text('enemies.calm.warmHand') : text(`enemies.calm.offering.${option.itemId}`);
}

/**
 * The offering selection of the Calm prompt. While the focused 'mercy' interactable offers more than one option the
 * wheel is claimed (`input.claimWheel`) and each step moves the selection, wrapping; the claim is dropped when the
 * focus leaves, a modal opens, the options fall to one or fewer, a hold completes, and on `dispose`. The selection
 * freezes when the hold starts, so the option paid is the one shown. Without a `ui` (tests, headless) the cheapest
 * option is always the selection.
 */
export class CalmCycle {
  private readonly sources = new Map<string, () => readonly CalmOption[]>();
  private claim: (() => void) | null = null;
  private focusId: string | null = null;
  private index = 0;
  private key: string | null = null;
  private frozen: CalmOption | null = null;

  constructor(private readonly ui?: CalmUiPort) {}

  /** `options` is read while the interactable `id` has focus; returns the unregister. */
  register(id: string, options: () => readonly CalmOption[]): () => void {
    this.sources.set(id, options);
    return () => {
      if (this.sources.get(id) === options) this.sources.delete(id);
      if (this.focusId === id) this.reset(null);
    };
  }

  /** The option the prompt shows and a completing hold pays: the frozen one during a hold, else the selected. */
  selected(id: string): CalmOption | null {
    const opts = this.sources.get(id)?.() ?? [];
    if (!opts.length) return null;
    if (this.frozen && this.focusId === id) return this.frozen;
    if (this.focusId !== id) return opts[0] ?? null;
    // Follow the option the player picked when the list shrinks or reorders under it.
    const kept = this.key === null ? -1 : opts.findIndex((o) => keyOf(o) === this.key);
    const at = kept >= 0 ? kept : ((this.index % opts.length) + opts.length) % opts.length;
    return opts[at] ?? null;
  }

  /** Once per render frame: focus edges, the claim, wheel steps, and the freeze at hold start. */
  update(): void {
    const ui = this.ui;
    if (!ui) return;
    const id = ui.focusedId();
    if (id !== this.focusId) this.reset(id);
    const opts = id ? (this.sources.get(id)?.() ?? []) : [];
    const want = id !== null && opts.length > 1 && !ui.modalOpen();
    if (want && !this.claim) this.claim = ui.claimWheel(CALM_WHEEL_OWNER);
    else if (!want) this.drop();
    if (ui.holding()) {
      if (this.claim) ui.consumeWheel(CALM_WHEEL_OWNER); // scroll during a hold is dropped, not queued
      if (id && !this.frozen && opts.length) this.frozen = this.selected(id);
      return;
    }
    this.frozen = null;
    if (!this.claim) return;
    const steps = ui.consumeWheel(CALM_WHEEL_OWNER);
    if (steps && opts.length > 1 && id) {
      const picked = this.selected(id);
      const cur = picked ? opts.findIndex((o) => keyOf(o) === keyOf(picked)) : 0;
      this.index = (((Math.max(cur, 0) + Math.sign(steps)) % opts.length) + opts.length) % opts.length;
      this.key = keyOf(opts[this.index]!);
    }
  }

  /** A hold completed or was abandoned: let the wheel go and start the next prompt from the cheapest. */
  finish(): void {
    this.reset(this.focusId);
  }

  /** True while the wheel is claimed (tests). */
  get claimed(): boolean {
    return this.claim !== null;
  }

  dispose(): void {
    this.drop();
    this.sources.clear();
  }

  private reset(id: string | null): void {
    this.focusId = id;
    this.index = 0;
    this.key = null;
    this.frozen = null;
    this.drop();
  }

  private drop(): void {
    const c = this.claim;
    this.claim = null;
    c?.();
  }
}

const keyOf = (o: CalmOption): string => (o.kind === 'item' ? o.itemId : o.kind);
