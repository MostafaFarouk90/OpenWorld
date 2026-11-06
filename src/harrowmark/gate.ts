import type { FlagGates } from '../state/FlagGates';

/** `closed`: portcullis down. `guarded`: open but watched (M06's stealth route goes through). `open`: guards stand down. */
export type GateState = 'closed' | 'guarded' | 'open';

/** Written by thread 6 at M06's start and when o2 resolves by any route. */
export const M06_STARTED_FLAG = 'story.m06.started';
/**
 * Raises the portcullis under guard (the density pass, batch 3): set once Cael has heard the queue (M06 `queue`, by
 * the quests' objective-flag bridge), so the gate stays shut until the route is chosen.
 */
export const M06_GUARDED_FLAG = 'story.m06.queueHeard';
export const M06_ROUTE_FLAG = 'story.m06.route';

/** Set at the end of Act 1: the River Gate's shutter opens while it holds. */
export const RIVER_GATE_FLAG = 'story.gate.a2';

/** `held` (Act 4, L2: the occupied city from `story.m38.complete`) shuts the gate whatever the Act 1 flags say. */
export const gateStateFor = (started: boolean, route: boolean, held = false): GateState => (held ? 'closed' : route ? 'open' : started ? 'guarded' : 'closed');

/** Act 4 (L2): an optional flag that shuts a gate while it holds, on top of the gate's own rule. */
export interface GateHold {
  closedWhen?: string;
}

export interface SouthGate {
  state(): GateState;
  /** Forces a state (thread 21's story gate, debug); `null` goes back to the flags. */
  override(state: GateState | null): void;
  dispose(): void;
}

/** Derives the South Gate's state from the two flags through ctx.gates, so a loaded save re-derives it. */
export function watchSouthGate(gates: Pick<FlagGates, 'flag'>, apply: (state: GateState) => void, hold: GateHold = {}): SouthGate {
  let started = false;
  let route = false;
  let held = false;
  let forced: GateState | null = null;
  let last: GateState | null = null;
  // The two init callbacks arrive one after the other: hold the first push until both flags are read.
  let ready = false;
  const current = (): GateState => forced ?? gateStateFor(started, route, held);
  const push = (): void => {
    if (!ready) return;
    const s = current();
    if (s === last) return;
    last = s;
    apply(s);
  };
  const offs = [
    gates.flag(M06_GUARDED_FLAG, (on) => {
      started = on;
      push();
    }),
    gates.flag(M06_ROUTE_FLAG, (on) => {
      route = on;
      push();
    }),
    ...(hold.closedWhen
      ? [
          gates.flag(hold.closedWhen, (on) => {
            held = !!on;
            push();
          }),
        ]
      : []),
  ];
  ready = true;
  push();
  return {
    state: current,
    override(state) {
      forced = state;
      push();
    },
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}

export interface RiverGate {
  open(): boolean;
  dispose(): void;
}

/** Derives the River Gate's shutter from the Act 1 flag through ctx.gates, so a loaded Act 1 save closes it again. `apply` runs once at the start and then only on change. */
export function watchRiverGate(gates: Pick<FlagGates, 'flag'>, apply: (open: boolean) => void, hold: GateHold = {}): RiverGate {
  return watchShutter(gates, RIVER_GATE_FLAG, apply, hold);
}

/** Set when Act 3 opens (K0): the North-west Gate's shutter opens onto the Fen Road (Act 3 thread K1). */
export const NORTHWEST_GATE_FLAG = 'story.gate.a3';

/** The North-west Gate's shutter, derived like the River Gate's, so a loaded Act 2 save closes it again. */
export function watchNorthwestGate(gates: Pick<FlagGates, 'flag'>, apply: (open: boolean) => void, hold: GateHold = {}): RiverGate {
  return watchShutter(gates, NORTHWEST_GATE_FLAG, apply, hold);
}

/**
 * A shutter open while one flag holds and, with `hold.closedWhen`, that flag does not. `apply` runs once at the start
 * and then only on change. Exported for L1's north-east gate (Act 4), which adds its own opening flag.
 */
export function watchShutter(gates: Pick<FlagGates, 'flag'>, flag: string, apply: (open: boolean) => void, hold: GateHold = {}): RiverGate {
  let on = false;
  let held = false;
  let ready = false;
  let last: boolean | null = null;
  const open = (): boolean => on && !held;
  const push = (): void => {
    if (!ready || open() === last) return;
    last = open();
    apply(last);
  };
  const offs = [
    gates.flag(flag, (v) => {
      on = !!v;
      push();
    }),
    ...(hold.closedWhen
      ? [
          gates.flag(hold.closedWhen, (v) => {
            held = !!v;
            push();
          }),
        ]
      : []),
  ];
  ready = true;
  push();
  return {
    open,
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
