/** Game actions and their default bindings (contracts/input-and-hud.md section 1, design section 2). */

export type InputContext = 'gameplay' | 'menu' | 'dialogue' | 'cutscene';
export const INPUT_CONTEXTS: readonly InputContext[] = ['gameplay', 'menu', 'dialogue', 'cutscene'];

export type Binding = { device: 'key'; code: string } | { device: 'mouse'; button: 0 | 1 | 2 | 3 | 4 };

export const ACTIONS = [
  'moveForward', 'moveBack', 'moveLeft', 'moveRight', 'sprint', 'jump', 'interact',
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'lockOn', 'surge', 'surgeLeap', 'sneak', 'mount',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
  'inventory', 'skills', 'journal', 'map', 'menu',
  'dialogueNext', 'dialogueChoice1', 'dialogueChoice2', 'dialogueChoice3', 'dialogueChoice4',
] as const;
export type Action = (typeof ACTIONS)[number];

export interface ActionDef {
  defaults: readonly [Binding | null, Binding | null];
  contexts: readonly InputContext[];
  /** Escape (menu) is fixed. */
  rebindable: boolean;
}

const key = (code: string): Binding => ({ device: 'key', code });
const mouse = (button: 0 | 1 | 2 | 3 | 4): Binding => ({ device: 'mouse', button });
const G: readonly InputContext[] = ['gameplay'];
const def = (a: Binding | null, b: Binding | null = null, contexts = G, rebindable = true): ActionDef => ({
  defaults: [a, b],
  contexts,
  rebindable,
});

export const ACTION_DEFS: Readonly<Record<Action, ActionDef>> = {
  moveForward: def(key('KeyW'), key('ArrowUp')),
  moveBack: def(key('KeyS'), key('ArrowDown')),
  moveLeft: def(key('KeyA'), key('ArrowLeft')),
  moveRight: def(key('KeyD'), key('ArrowRight')),
  sprint: def(key('ShiftLeft'), key('ShiftRight')),
  jump: def(key('Space')),
  interact: def(key('KeyF')),
  attack1: def(key('Digit1'), mouse(0)),
  attack2: def(key('Digit2')),
  attack3: def(key('Digit3')),
  attack4: def(key('Digit4')),
  block: def(mouse(2)),
  dodge: def(key('ControlLeft'), mouse(3)),
  lockOn: def(key('Tab')),
  surge: def(key('KeyG')),
  surgeLeap: def(key('KeyV')),
  sneak: def(key('AltLeft')),
  mount: def(key('KeyH')),
  ability1: def(key('KeyQ')),
  ability2: def(key('KeyE')),
  ability3: def(key('KeyR')),
  ability4: def(key('KeyZ')),
  ability5: def(key('KeyX')),
  ability6: def(key('KeyC')),
  inventory: def(key('KeyI'), null, ['gameplay', 'menu']),
  skills: def(key('KeyK'), null, ['gameplay', 'menu']),
  journal: def(key('KeyJ'), null, ['gameplay', 'menu']),
  map: def(key('KeyM'), null, ['gameplay', 'menu']),
  menu: def(key('Escape'), null, INPUT_CONTEXTS, false),
  dialogueNext: def(key('Space'), key('KeyF'), ['dialogue']),
  dialogueChoice1: def(key('Digit1'), null, ['dialogue']),
  dialogueChoice2: def(key('Digit2'), null, ['dialogue']),
  dialogueChoice3: def(key('Digit3'), null, ['dialogue']),
  dialogueChoice4: def(key('Digit4'), null, ['dialogue']),
};

/** Per-tick view of the actions (contracts/input-and-hud.md section 2). */
export interface ActionState {
  down(a: Action): boolean;
  pressed(a: Action): boolean;
  released(a: Action): boolean;
  heldTicks(a: Action): number;
  axis(neg: Action, pos: Action): -1 | 0 | 1;
}

/** An ActionState in which nothing is pressed (headless defaults, tests). */
export const NO_ACTIONS: ActionState = {
  down: () => false,
  pressed: () => false,
  released: () => false,
  heldTicks: () => 0,
  axis: () => 0,
};

/** The context stack (contracts/input-and-hud.md section 3); implemented in InputContexts.ts. */
export interface InputContextStack {
  push(ctx: InputContext, ownerId: string): () => void;
  top(): InputContext;
  onChange(listener: (top: InputContext) => void): () => void;
}

// ---- Helpers shared by InputBindings, ActionMap and InputManager ----

export const isAction = (a: unknown): a is Action => typeof a === 'string' && (ACTIONS as readonly string[]).includes(a);

export function isBinding(b: unknown): b is Binding {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  if (o.device === 'key') return typeof o.code === 'string' && o.code.length > 0;
  if (o.device === 'mouse') return typeof o.button === 'number' && Number.isInteger(o.button) && o.button >= 0 && o.button <= 4;
  return false;
}

export function bindingEquals(a: Binding | null, b: Binding | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.device === 'key') return b.device === 'key' && a.code === b.code;
  return b.device === 'mouse' && a.button === b.button;
}

/** A stable string for a physical input: `k:KeyW` or `m:0`. */
export const bindingToken = (b: Binding): string => (b.device === 'key' ? `k:${b.code}` : `m:${b.button}`);
