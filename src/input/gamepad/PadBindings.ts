import { ACTIONS, ACTION_DEFS, isAction } from '../actions';
import type { Action, InputContext } from '../actions';
import { safeLocalStorage } from '../InputBindings';
import {
  PAD_DEFAULTS, RESERVED_PAD_BUTTONS, STICK_ACTIONS, STICK_TOKENS, actionToken, chordEquals, chordGlyph, chordToken, isChord,
} from './padLayout';
import type { PadChord } from './padLayout';

export type PadRebindResult =
  | { ok: true; swappedWith?: Action }
  | { ok: false; reason: 'conflict'; conflictWith: Action }
  | { ok: false; reason: 'reserved' | 'unknown-action' | 'invalid-binding' };

type Storageish = Pick<Storage, 'getItem' | 'setItem'>;

export const PAD_BINDINGS_STORAGE_KEY = 'owg.padBindings.v1';

/** Actions opened from the View radial when they have no chord of their own. */
const SCREEN_RADIAL: readonly Action[] = ['skills', 'journal', 'map', 'codex', 'party'];

const share = (a: readonly InputContext[], b: readonly InputContext[]): boolean => a.some((c) => b.includes(c));

/** A pad action that cannot be rebound: the stick moves, Start is the fixed menu. */
const fixedOnPad = (a: Action): boolean => !ACTION_DEFS[a].rebindable || STICK_ACTIONS.includes(a);

/**
 * Gamepad chords per action (G2). Kept apart from the two key slots of `InputBindings` so the key model and the
 * Controls tab's key columns stay as they are; G1's Controls tab adds a "Controller" column from this.
 */
export class PadBindings {
  private readonly map = new Map<Action, PadChord | null>();
  private readonly listeners = new Set<() => void>();
  private tokens = new Map<Action, string[]>();
  private storageFailed = false;

  constructor(
    private readonly storage: Storageish | null = safeLocalStorage(),
    private readonly warn: (...args: unknown[]) => void = console.warn,
  ) {
    this.setDefaults();
    this.load();
    this.reindex();
  }

  get(action: Action): PadChord | null {
    const c = this.map.get(action);
    return c ? { ...c } : null;
  }

  /** True when the action can be given a chord (the Controls tab greys the rest). */
  rebindable(action: Action): boolean {
    return isAction(action) && !fixedOnPad(action);
  }

  rebind(action: Action, chord: PadChord, opts: { swap?: boolean } = {}): PadRebindResult {
    if (!isAction(action)) return { ok: false, reason: 'unknown-action' };
    if (fixedOnPad(action)) return { ok: false, reason: 'reserved' };
    if (!isChord(chord)) return { ok: false, reason: 'invalid-binding' };
    if (RESERVED_PAD_BUTTONS.includes(chord.button)) return { ok: false, reason: 'reserved' };
    const mine = this.map.get(action) ?? null;
    if (chordEquals(mine, chord)) return { ok: true };
    const conflicts = this.conflictsFor(action, chord);
    let swappedWith: Action | undefined;
    if (conflicts.length) {
      if (!opts.swap || conflicts.length > 1) return { ok: false, reason: 'conflict', conflictWith: conflicts[0] };
      const other = conflicts[0];
      const legal = mine !== null && this.conflictsFor(other, mine, action).length === 0;
      this.map.set(other, legal ? mine : null);
      swappedWith = other;
    }
    this.map.set(action, { button: chord.button, layer: chord.layer });
    this.changed();
    return swappedWith ? { ok: true, swappedWith } : { ok: true };
  }

  clear(action: Action): void {
    if (!isAction(action) || fixedOnPad(action) || this.map.get(action) == null) return;
    this.map.set(action, null);
    this.changed();
  }

  resetToDefaults(): void {
    this.setDefaults();
    this.changed();
  }

  /** The pad label for an action, as prompts show it while the pad is the active device. */
  glyph(action: Action): string {
    const c = this.map.get(action);
    if (c) return chordGlyph(c);
    if (STICK_ACTIONS.includes(action)) return 'Left stick';
    if (action === 'inventory') return 'View';
    if (SCREEN_RADIAL.includes(action)) return 'Hold View';
    if (/^ability[1-6]$/.test(action) || action === 'surge' || action === 'surgeLeap') return 'RB';
    if (/^dialogueChoice[1-4]$/.test(action)) return 'A';
    return '?';
  }

  /** ActionMap tokens that hold `action` (its chord, its radial token, its stick direction). */
  tokensFor(action: Action): readonly string[] {
    return this.tokens.get(action) ?? [];
  }

  /** Actions bound to `chord` that are live in `context`. */
  actionsFor(chord: PadChord, context?: InputContext): Action[] {
    return ACTIONS.filter((a) => (!context || ACTION_DEFS[a].contexts.includes(context)) && chordEquals(this.map.get(a) ?? null, chord));
  }

  /** True when some action uses `button` on the LB layer (otherwise LB+button falls back to the base chord). */
  hasLbLayer(button: number): boolean {
    for (const c of this.map.values()) if (c && c.layer === 'lb' && c.button === button) return true;
    return false;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private conflictsFor(action: Action, chord: PadChord, ignore?: Action): Action[] {
    return ACTIONS.filter(
      (o) =>
        o !== action && o !== ignore && share(ACTION_DEFS[o].contexts, ACTION_DEFS[action].contexts) &&
        chordEquals(this.map.get(o) ?? null, chord),
    );
  }

  private setDefaults(): void {
    for (const a of ACTIONS) {
      const d = PAD_DEFAULTS[a];
      this.map.set(a, d ? { ...d } : null);
    }
  }

  private reindex(): void {
    const t = new Map<Action, string[]>();
    for (const a of ACTIONS) {
      const list = [actionToken(a)];
      const c = this.map.get(a);
      if (c) list.push(chordToken(c));
      const stick = STICK_TOKENS[a];
      if (stick) list.push(stick);
      t.set(a, list);
    }
    this.tokens = t;
  }

  private changed(): void {
    this.reindex();
    this.save();
    for (const l of [...this.listeners]) l();
  }

  private save(): void {
    if (!this.storage || this.storageFailed) return;
    const out: Record<string, PadChord | null> = {};
    for (const a of ACTIONS) if (!chordEquals(this.map.get(a) ?? null, PAD_DEFAULTS[a])) out[a] = this.map.get(a) ?? null;
    try {
      this.storage.setItem(PAD_BINDINGS_STORAGE_KEY, JSON.stringify(out));
    } catch (e) {
      this.storageFailed = true;
      this.warn('Could not save controller bindings; they last for this session only.', e);
    }
  }

  private load(): void {
    if (!this.storage) return;
    let raw: string | null;
    try {
      raw = this.storage.getItem(PAD_BINDINGS_STORAGE_KEY);
    } catch (e) {
      this.storageFailed = true;
      this.warn('Could not read controller bindings; using defaults for this session.', e);
      return;
    }
    if (raw === null || raw === undefined) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      this.warn('Stored controller bindings are corrupt; using defaults.');
      return;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      this.warn('Stored controller bindings are malformed; using defaults.');
      return;
    }
    const applied: Action[] = [];
    for (const [name, value] of Object.entries(data)) {
      if (!isAction(name) || fixedOnPad(name)) {
        this.warn(`Dropping stored controller binding for "${name}".`);
        continue;
      }
      if (value !== null && (!isChord(value) || RESERVED_PAD_BUTTONS.includes(value.button))) {
        this.warn(`Dropping invalid stored controller binding for "${name}".`);
        continue;
      }
      this.map.set(name, value ? { button: value.button, layer: value.layer } : null);
      applied.push(name);
    }
    for (let guard = 0; guard < ACTIONS.length * 2; guard++) {
      const bad = applied.find((a) => {
        const c = this.map.get(a);
        return c != null && this.conflictsFor(a, c).length > 0;
      });
      if (!bad) break;
      this.warn(`Dropping stored controller binding for "${bad}": it conflicts with another action.`);
      const d = PAD_DEFAULTS[bad];
      this.map.set(bad, d ? { ...d } : null);
      applied.splice(applied.indexOf(bad), 1);
    }
  }
}
