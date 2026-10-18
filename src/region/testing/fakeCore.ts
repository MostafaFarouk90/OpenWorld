import * as THREE from 'three';
import type { ActorInit, Anchor, GameSystem, Interactable, TriggerDef, CoreContext } from '../coreTypes';
import type { Actor as ActorLike } from '../../actors/Actor';

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

  // A partial stand-in: it implements what the region and npcs code calls, typed loosely on purpose.
  const impl = {
    scene,
    physics: {
      rapier: undefined as never,
      addStaticCollider(desc: object) {
        const c = { desc };
        colliders.add(c);
        return c as never;
      },
      removeCollider(c: object) {
        colliders.delete(c as never);
      },
    },
    anchors: {
      define: (a: Anchor) => unique(anchors, a.id, 'anchor', a),
      get(id: string) {
        const a = anchors.get(id);
        if (!a) throw new Error(`unknown anchor "${id}"`);
        return a;
      },
      find: (id: string) => anchors.get(id),
      withTag: (tag: string) => [...anchors.values()].filter((a) => a.tags?.includes(tag)),
    },
    triggers: { add: (def: TriggerDef) => unique(triggers, def.id, 'trigger', def) },
    interaction: { register: (i: Interactable) => unique(interactables, i.id, 'interactable', i) },
    actors: {
      spawn(init: ActorInit) {
        const n = (counters.get(init.kind) ?? 0) + 1;
        counters.set(init.kind, n);
        const id = init.id ?? `${init.kind}#${n}`;
        const actor = {
          id,
          kind: init.kind,
          team: init.team,
          hittable: init.hittable ?? true,
          immortal: init.immortal ?? false,
          dead: false,
          root: init.root ?? null,
          data: {},
        } as unknown as ActorLike;
        actors.set(id, actor);
        return actor;
      },
      despawn(id: string) {
        actors.delete(id);
      },
      bindOwner: () => () => {},
    },
    events: {
      emit(type: string, payload: unknown) {
        emitted.push({ type, payload });
        for (const l of [...(listeners.get(type) ?? [])]) l(payload);
      },
      on(type: string, l: (p: any) => void) {
        const set = listeners.get(type) ?? new Set();
        set.add(l);
        listeners.set(type, set);
        return () => set.delete(l);
      },
    },
    state: {
      getBool: (key: string, fallback = false) => {
        const v = flags.get(key);
        return typeof v === 'boolean' ? v : fallback;
      },
      setFlag(key: string, value: boolean | number | string) {
        flags.set(key, value);
      },
    },
    services: {
      get: (name: string) => services.get(name),
      provide: (name: string, service: unknown) => unique(services, name, 'service', service),
    },
    strings: {
      register(_locale: string, table: Record<string, string>) {
        const added: string[] = [];
        try {
          for (const [k, v] of Object.entries(table)) {
            if (strings.has(k)) throw new Error(`duplicate string key "${k}"`);
            strings.set(k, v);
            added.push(k);
          }
        } catch (err) {
          for (const k of added) strings.delete(k);
          throw err;
        }
        return () => added.forEach((k) => strings.delete(k));
      },
      t: (key: string) => strings.get(key) ?? key,
    },
    systems: { add: (s: GameSystem) => unique(systems, s.id, 'system', s) },
    combat: {
      addTarget(t: unknown, actorId?: string) {
        targets.push(t);
        void actorId;
        return () => {
          const i = targets.indexOf(t);
          if (i >= 0) targets.splice(i, 1);
        };
      },
    },
    assets: null,
    player: { feet: playerFeet },
  };
  const ctx = impl as unknown as CoreContext;

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
      (impl.physics as { rapier: unknown }).rapier = rapier;
    },
    fire(type, payload) {
      for (const l of [...(listeners.get(type) ?? [])]) l(payload);
    },
    tick(phase, dt = 1 / 60) {
      [...systems.values()]
        .filter((s) => s.fixedPhase === phase)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach((s) => s.fixedUpdate?.(dt, ctx));
    },
  };
}
