import * as THREE from 'three';
import { ActorRegistry } from '../actors/ActorRegistry';
import { GameEvents } from '../core/events';
import type { Action, ActionState, InputContext, InputContextStack } from '../input/actions';
import { NO_ACTIONS } from '../input/actions';
import { WorldState } from '../state/WorldState';

/** Test helpers shared by the interaction tests. */
export function makeWorld() {
  const events = new GameEvents((m, e) => {
    throw new Error(`${m} ${String(e)}`);
  });
  const actors = new ActorRegistry(events);
  const state = new WorldState(events);
  return { events, actors, state };
}

export function fakeActions() {
  const s = { down: new Set<Action>(), pressed: new Set<Action>() };
  const actions: ActionState = {
    ...NO_ACTIONS,
    down: (a) => s.down.has(a),
    pressed: (a) => s.pressed.has(a),
  };
  return {
    actions,
    /** Key goes down this tick (pressed edge + down). */
    press() {
      s.down.add('interact');
      s.pressed.add('interact');
    },
    /** Next tick: still held, no edge. */
    hold() {
      s.pressed.clear();
      s.down.add('interact');
    },
    release() {
      s.pressed.clear();
      s.down.delete('interact');
    },
  };
}

export function fakeContexts(initial: InputContext = 'gameplay') {
  let top = initial;
  const ls = new Set<(t: InputContext) => void>();
  const stack: InputContextStack = {
    push: () => () => {},
    top: () => top,
    onChange: (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
  return {
    stack,
    set(t: InputContext) {
      if (t === top) return;
      top = t;
      for (const l of [...ls]) l(t);
    },
  };
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
