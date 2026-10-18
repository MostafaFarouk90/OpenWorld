// In-memory stand-in for thread 0's GameContext, used by the region and npcs tests until the real
// core merges. Records every registration so tests can assert on it and on teardown.
import * as THREE from 'three';
import type {
  ActorInit,
  ActorLike,
  Anchor,
  CoreContext,
  GameSystem,
  Interactable,
  TriggerDef,
} from '../coreTypes';

export interface FakeCore {
  ctx: CoreContext;
  scene: THREE.Scene;
  anchors: Map<string, Anchor>;
  triggers: Map<string, TriggerDef>;
  interactables: Map<string, Interactable>;
  actors: Map<string, ActorLike>;
  systems: Map<string, GameSystem>;
  services: Map<string, unknown>;
  strings: Map<string, string>;
  flags: Map<string, boolean | number | string>;
  colliders: Set<object>;
  emitted: Array<{ type: string; payload: unknown }>;
  targets: unknown[];
  /** Mutable: tests move the player by assigning x, y, z. */
  playerFeet: { x: number; y: number; z: number };
  /** Fires every listener of `type`. */
  /** Gives the fake physics a real Rapier module (after `await physicsWorld.init()`). */
  useRapier(rapier: CoreContext['physics']['rapier']): void;
  fire(type: string, payload?: unknown): void;
  /** Runs fixedUpdate of every system of a phase, ascending order. */
  tick(phase: GameSystem['fixedPhase'], dt?: number): void;
}

export function createFakeCore(): FakeCore {
  const scene = new THREE.Scene();
  const anchors = new Map<string, Anchor>();
  const triggers = new Map<string, TriggerDef>();
  const interactables = new Map<string, Interactable>();
  const actors = new Map<string, ActorLike>();
  const systems = new Map<string, GameSystem>();
  const services = new Map<string, unknown>();
  const strings = new Map<string, string>();
  const flags = new Map<string, boolean | number | string>();
  const colliders = new Set<object>();
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const targets: unknown[] = [];
  const listeners = new Map<string, Set<(p: any) => void>>();
  const counters = new Map<string, number>();
  const playerFeet = { x: 0, y: 0, z: 0 };

  const unique = <T>(map: Map<string, T>, id: string, what: string, value: T): (() => void) => {
    if (map.has(id)) throw new Error(`duplicate ${what} "${id}"`);
    map.set(id, value);
    return () => {
      map.delete(id);
    };
  };

  const ctx: CoreContext = {
    scene,
    physics: {
      rapier: undefined as never,
      addStaticCollider(desc) {
        const c = { desc };
        colliders.add(c);
        return c as never;
      },
      removeCollider(c) {
        colliders.delete(c as never);
      },
    },
    anchors: {
      define(a) {
        unique(anchors, a.id, 'anchor', a);
      },
      get(id) {
        const a = anchors.get(id);
        if (!a) throw new Error(`unknown anchor "${id}"`);
        return a;
      },
      find: (id) => anchors.get(id),
      withTag: (tag) => [...anchors.values()].filter((a) => a.tags?.includes(tag)),
    },
    triggers: { add: (def) => unique(triggers, def.id, 'trigger', def) },
    interaction: { register: (i) => unique(interactables, i.id, 'interactable', i) },
    actors: {
      spawn(init: ActorInit) {
        const n = (counters.get(init.kind) ?? 0) + 1;
        counters.set(init.kind, n);
        const id = init.id ?? `${init.kind}#${n}`;
        const actor: ActorLike = {
          id,
          kind: init.kind,
          team: init.team,
          hittable: init.hittable ?? true,
          immortal: init.immortal ?? false,
          dead: false,
          root: init.root ?? null,
          data: {},
        };
        actors.set(id, actor);
        return actor;
      },
      despawn(id) {
        actors.delete(id);
      },
      bindOwner: () => () => {},
    },
    events: {
      emit(type, payload) {
        emitted.push({ type, payload });
        for (const l of [...(listeners.get(type) ?? [])]) l(payload);
      },
      on(type, l) {
        const set = listeners.get(type) ?? new Set();
        set.add(l);
        listeners.set(type, set);
        return () => set.delete(l);
      },
    },
    state: {
      getBool: (key, fallback = false) => {
        const v = flags.get(key);
        return typeof v === 'boolean' ? v : fallback;
      },
      setFlag(key, value) {
        flags.set(key, value);
      },
    },
    services: {
      get: (name) => services.get(name),
      provide: (name, impl) => unique(services, name, 'service', impl),
    },
    strings: {
      register(_locale, table) {
        for (const [k, v] of Object.entries(table)) {
          if (strings.has(k)) throw new Error(`duplicate string key "${k}"`);
          strings.set(k, v);
        }
      },
      t: (key) => strings.get(key) ?? key,
    },
    systems: { add: (s) => unique(systems, s.id, 'system', s) },
    combat: { addTarget: (t) => void targets.push(t) },
    player: { feet: playerFeet },
  };

  return {
    ctx,
    scene,
    anchors,
    triggers,
    interactables,
    actors,
    systems,
    services,
    strings,
    flags,
    colliders,
    emitted,
    targets,
    playerFeet,
    useRapier(rapier) {
      (ctx.physics as { rapier: unknown }).rapier = rapier;
    },
    fire(type, payload) {
      for (const l of [...(listeners.get(type) ?? [])]) l(payload);
    },
    tick(phase, dt = 1 / 60) {
      [...systems.values()]
        .filter((s) => s.fixedPhase === phase)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach((s) => s.fixedUpdate?.(dt));
    },
  };
}
