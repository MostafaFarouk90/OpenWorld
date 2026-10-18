import { ACTIONS, ACTION_DEFS, bindingEquals, isAction, isBinding } from './actions';
import type { Action, Binding, InputContext } from './actions';

export type RebindResult =
  | { ok: true; swappedWith?: Action }
  | { ok: false; reason: 'conflict'; conflictWith: Action; slot: 0 | 1 }
  | { ok: false; reason: 'reserved' | 'unknown-action' | 'invalid-binding' };

type Pair = readonly [Binding | null, Binding | null];
type Storageish = Pick<Storage, 'getItem' | 'setItem'>;

export const BINDINGS_STORAGE_KEY = 'owg.bindings.v1';

export function safeLocalStorage(): Storageish | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const share = (a: readonly InputContext[], b: readonly InputContext[]): boolean => a.some((c) => b.includes(c));

/** Reserved bindings: Escape, F1..F12, and left mouse for anything but attack1 / dialogueNext. */
function isReserved(action: Action, b: Binding): boolean {
  if (b.device === 'key') return b.code === 'Escape' || /^F([1-9]|1[0-2])$/.test(b.code);
  return b.button === 0 && action !== 'attack1' && action !== 'dialogueNext';
}

const KEY_GLYPHS: Record<string, string> = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};
const MOUSE_GLYPHS = ['LMB', 'MMB', 'RMB', 'Mouse4', 'Mouse5'];

function glyphOf(b: Binding): string {
  if (b.device === 'mouse') return MOUSE_GLYPHS[b.button] ?? '?';
  if (KEY_GLYPHS[b.code]) return KEY_GLYPHS[b.code];
  const m = /^(?:Key|Digit)(.)$/.exec(b.code);
  if (m) return m[1];
  const n = /^Numpad(.+)$/.exec(b.code);
  if (n) return `Num${n[1]}`;
  return b.code;
}

export class InputBindings {
  private readonly map = new Map<Action, [Binding | null, Binding | null]>();
  private readonly listeners = new Set<() => void>();
  private storageFailed = false;

  constructor(
    private readonly storage: Storageish | null = safeLocalStorage(),
    private readonly warn: (...args: unknown[]) => void = console.warn,
  ) {
    this.setDefaults();
    this.load();
  }

  get(action: Action): readonly [Binding | null, Binding | null] {
    const p = this.map.get(action);
    return p ? [p[0], p[1]] : [null, null];
  }

  rebind(action: Action, slot: 0 | 1, binding: Binding, opts: { swap?: boolean } = {}): RebindResult {
    if (!isAction(action)) return { ok: false, reason: 'unknown-action' };
    if (slot !== 0 && slot !== 1) return { ok: false, reason: 'invalid-binding' };
    if (!ACTION_DEFS[action].rebindable) return { ok: false, reason: 'reserved' };
    if (!isBinding(binding)) return { ok: false, reason: 'invalid-binding' };
    if (isReserved(action, binding)) return { ok: false, reason: 'reserved' };
    const mine = this.map.get(action)!;
    if (bindingEquals(mine[slot], binding)) return { ok: true };

    const conflicts: { action: Action; slot: 0 | 1 }[] = [];
    for (const other of ACTIONS) {
      if (other === action || !share(ACTION_DEFS[other].contexts, ACTION_DEFS[action].contexts)) continue;
      const p = this.map.get(other)!;
      for (const s of [0, 1] as const) if (bindingEquals(p[s], binding)) conflicts.push({ action: other, slot: s });
    }

    let swappedWith: Action | undefined;
    if (conflicts.length) {
      const first = conflicts[0];
      if (!opts.swap || conflicts.length > 1) {
        return { ok: false, reason: 'conflict', conflictWith: first.action, slot: first.slot };
      }
      const old = mine[slot];
      const other = this.map.get(first.action)!;
      const legal = old !== null && !isReserved(first.action, old) && !this.conflictsFor(first.action, old, action).length;
      other[first.slot] = legal ? old : null;
      swappedWith = first.action;
    }
    mine[slot] = binding;
    // The same binding in both slots of one action is pointless: keep the new slot only.
    const otherSlot = slot === 0 ? 1 : 0;
    if (bindingEquals(mine[otherSlot], binding)) mine[otherSlot] = null;
    this.changed();
    return swappedWith ? { ok: true, swappedWith } : { ok: true };
  }

  clear(action: Action, slot: 0 | 1): void {
    const p = this.map.get(action);
    if (!p || !ACTION_DEFS[action].rebindable || (slot !== 0 && slot !== 1) || p[slot] === null) return;
    p[slot] = null;
    this.changed();
  }

  resetToDefaults(): void {
    this.setDefaults();
    this.changed();
  }

  glyph(action: Action): string {
    const p = this.map.get(action);
    const b = p?.[0] ?? p?.[1];
    return b ? glyphOf(b) : '?';
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  actionsFor(binding: Binding, context?: InputContext): Action[] {
    return ACTIONS.filter((a) => {
      if (context && !ACTION_DEFS[a].contexts.includes(context)) return false;
      const p = this.map.get(a)!;
      return bindingEquals(p[0], binding) || bindingEquals(p[1], binding);
    });
  }

  /** Every distinct bound key code (used for the keyboard lock). */
  boundKeyCodes(): string[] {
    const out = new Set<string>();
    for (const p of this.map.values()) for (const b of p) if (b?.device === 'key') out.add(b.code);
    return [...out];
  }

  private conflictsFor(action: Action, binding: Binding, ignore?: Action): Action[] {
    return ACTIONS.filter((o) => {
      if (o === action || o === ignore || !share(ACTION_DEFS[o].contexts, ACTION_DEFS[action].contexts)) return false;
      const p = this.map.get(o)!;
      return bindingEquals(p[0], binding) || bindingEquals(p[1], binding);
    });
  }

  private setDefaults(): void {
    for (const a of ACTIONS) this.map.set(a, [...ACTION_DEFS[a].defaults]);
  }

  private changed(): void {
    this.save();
    for (const l of [...this.listeners]) l();
  }

  private overrides(): Record<string, Pair> {
    const out: Record<string, Pair> = {};
    for (const a of ACTIONS) {
      const p = this.map.get(a)!;
      const d = ACTION_DEFS[a].defaults;
      if (!bindingEquals(p[0], d[0]) || !bindingEquals(p[1], d[1])) out[a] = [p[0], p[1]];
    }
    return out;
  }

  private save(): void {
    if (!this.storage || this.storageFailed) return;
    try {
      this.storage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(this.overrides()));
    } catch (e) {
      this.storageFailed = true;
      this.warn('Could not save key bindings; they last for this session only.', e);
    }
  }

  private load(): void {
    if (!this.storage) return;
    let raw: string | null;
    try {
      raw = this.storage.getItem(BINDINGS_STORAGE_KEY);
    } catch (e) {
      this.storageFailed = true;
      this.warn('Could not read key bindings; using defaults for this session.', e);
      return;
    }
    if (raw === null || raw === undefined) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      this.warn('Stored key bindings are corrupt; using defaults.');
      return;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      this.warn('Stored key bindings are malformed; using defaults.');
      return;
    }
    const applied: Action[] = [];
    for (const [name, value] of Object.entries(data)) {
      if (!isAction(name)) {
        this.warn(`Dropping stored binding for unknown action "${name}".`);
        continue;
      }
      if (!ACTION_DEFS[name].rebindable) {
        this.warn(`Dropping stored binding for fixed action "${name}".`);
        continue;
      }
      const ok =
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((b) => b === null || (isBinding(b) && !isReserved(name, b)));
      if (!ok) {
        this.warn(`Dropping invalid stored binding for "${name}".`);
        continue;
      }
      const v = value as unknown as Pair;
      this.map.set(name, [v[0] ? ({ ...v[0] } as Binding) : null, v[1] ? ({ ...v[1] } as Binding) : null]);
      applied.push(name);
    }
    // Revert overrides that clash with another action until the whole set is conflict free.
    for (let guard = 0; guard < ACTIONS.length * 2; guard++) {
      const bad = applied.find((a) => this.hasConflict(a));
      if (!bad) break;
      this.warn(`Dropping stored binding for "${bad}": it conflicts with another action.`);
      this.map.set(bad, [...ACTION_DEFS[bad].defaults]);
      applied.splice(applied.indexOf(bad), 1);
    }
  }

  private hasConflict(action: Action): boolean {
    const p = this.map.get(action)!;
    return p.some((b) => b !== null && this.conflictsFor(action, b).length > 0);
  }
}
