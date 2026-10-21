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

export const gateStateFor = (started: boolean, route: boolean): GateState => (route ? 'open' : started ? 'guarded' : 'closed');

export interface SouthGate {
  state(): GateState;
  /** Forces a state (thread 21's story gate, debug); `null` goes back to the flags. */
  override(state: GateState | null): void;
  dispose(): void;
}

/** Derives the South Gate's state from the two flags through ctx.gates, so a loaded save re-derives it. */
export function watchSouthGate(gates: Pick<FlagGates, 'flag'>, apply: (state: GateState) => void): SouthGate {
  let started = false;
  let route = false;
  let forced: GateState | null = null;
  let last: GateState | null = null;
  // The two init callbacks arrive one after the other: hold the first push until both flags are read.
  let ready = false;
  const current = (): GateState => forced ?? gateStateFor(started, route);
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
export function watchRiverGate(gates: Pick<FlagGates, 'flag'>, apply: (open: boolean) => void): RiverGate {
  let open = false;
  let last: boolean | null = null;
  const push = (): void => {
    if (open === last) return;
    last = open;
    apply(open);
  };
  const off = gates.flag(RIVER_GATE_FLAG, (on) => {
    open = !!on;
    push();
  });
  push();
  return { open: () => open, dispose: off };
}
