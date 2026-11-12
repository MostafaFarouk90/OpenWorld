/**
 * G2 gamepad layout: W3C "standard" mapping indices, button names (Xbox layout, design taste call) and the default
 * chords per action (plans/g2-gamepad.md, design sections 2 and 9).
 */
import type { Action } from '../actions';

export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
} as const;
export const PAD_BUTTON_COUNT = 17;

export const PAD_NAMES: readonly string[] = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'LS', 'RS', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home',
];

/** `lb`: the button is pressed while LB is held (the ability layer). */
export type PadLayer = 'base' | 'lb';
export interface PadChord {
  button: number;
  layer: PadLayer;
}

/** Buttons that can never be bound: Start (fixed menu), Home, LB (the layer modifier), RB and View (the radials). */
export const RESERVED_PAD_BUTTONS: readonly number[] = [PAD.START, PAD.HOME, PAD.LB, PAD.RB, PAD.VIEW];

/** Actions that a pad press toggles on and off instead of holding (sprint also ends when the stick is centred). */
export const PAD_TOGGLE_ACTIONS: readonly Action[] = ['sprint', 'sneak'];

/** Actions moved by the left stick (never bound to a button on the pad). */
export const STICK_ACTIONS: readonly Action[] = ['moveForward', 'moveBack', 'moveLeft', 'moveRight'];

const b = (button: number): PadChord => ({ button, layer: 'base' });
const lb = (button: number): PadChord => ({ button, layer: 'lb' });

/** Default pad chords. `null`: reached through a radial (or the stick) only. Start opens the menu and is fixed. */
export const PAD_DEFAULTS: Readonly<Record<Action, PadChord | null>> = {
  moveForward: null, moveBack: null, moveLeft: null, moveRight: null,
  sprint: b(PAD.LS),
  jump: b(PAD.A),
  interact: b(PAD.X),
  mercy: b(PAD.UP),
  attack1: b(PAD.RT),
  attack2: b(PAD.Y),
  attack3: lb(PAD.RT),
  attack4: lb(PAD.LT),
  block: b(PAD.LT),
  dodge: b(PAD.B),
  lockOn: b(PAD.RS),
  surge: lb(PAD.UP),
  surgeLeap: b(PAD.LEFT),
  sneak: b(PAD.DOWN),
  mount: b(PAD.RIGHT),
  ability1: lb(PAD.A),
  ability2: lb(PAD.B),
  ability3: lb(PAD.X),
  ability4: lb(PAD.Y),
  ability5: lb(PAD.LEFT),
  ability6: lb(PAD.RIGHT),
  inventory: null, // tap View (the screens radial owns View)
  skills: null,
  journal: null,
  map: null,
  codex: null,
  party: null,
  menu: b(PAD.START),
  dialogueNext: b(PAD.A),
  dialogueChoice1: null, // dialogue choices: D-pad to highlight, A to pick (MenuNavigator)
  dialogueChoice2: null,
  dialogueChoice3: null,
  dialogueChoice4: null,
};

export const chordEquals = (a: PadChord | null, c: PadChord | null): boolean =>
  a === null || c === null ? a === c : a.button === c.button && a.layer === c.layer;

/** The ActionMap token of a chord: `p:base:0`, `p:lb:7`. */
export const chordToken = (c: PadChord): string => `p:${c.layer}:${c.button}`;
/** A token that presses exactly one action (radials). */
export const actionToken = (a: Action): string => `p:act:${a}`;
/** Left-stick direction tokens. */
export const STICK_TOKENS: Readonly<Record<string, string>> = {
  moveForward: 'p:stick:up', moveBack: 'p:stick:down', moveLeft: 'p:stick:left', moveRight: 'p:stick:right',
};

export function chordGlyph(c: PadChord): string {
  const name = PAD_NAMES[c.button] ?? `Button ${c.button}`;
  return c.layer === 'lb' ? `LB+${name}` : name;
}

export function isChord(v: unknown): v is PadChord {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.button === 'number' && Number.isInteger(o.button) && o.button >= 0 && o.button < PAD_BUTTON_COUNT &&
    (o.layer === 'base' || o.layer === 'lb')
  );
}
