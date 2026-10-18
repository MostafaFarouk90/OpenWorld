import * as THREE from 'three';
import { vi } from 'vitest';
import type { PluginContext, GameSystem, VfxEventMap, VfxEventType } from './ports';

/** A fake PluginContext for plugin tests (not part of the shipped bundle). */
export function fakeContext(over: Partial<PluginContext> = {}) {
  const listeners = new Map<string, Array<(p: never) => void>>();
  const systems: GameSystem[] = [];
  const services = new Map<string, unknown>();
  const clock = { tick: 0, seconds: 0, frozen: false, hitStopRemaining: 0, hitStop: vi.fn() };
  const actors = new Map<string, { id: string; root: THREE.Object3D | null }>();
  const mounted: Array<{ slot: string; id: string }> = [];
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const ctx = {
    scene: new THREE.Scene(),
    camera,
    clock,
    events: {
      on(type: VfxEventType, fn: (p: never) => void) {
        const l = listeners.get(type) ?? [];
        l.push(fn);
        listeners.set(type, l);
        return () => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
      },
      emit<K extends VfxEventType>(type: K, payload: VfxEventMap[K]) {
        for (const fn of listeners.get(type) ?? []) fn(payload as never);
      },
    },
    actors: { get: (id: string) => actors.get(id), all: () => actors.values(), player: { id: 'player' } },
    damage: { apply: vi.fn(), stagger: vi.fn(), heal: vi.fn() },
    player: { actor: { id: 'player' }, feet: new THREE.Vector3(1, 0, 2), facingYaw: 0, avatar: null, addMoveModifier: vi.fn(() => () => {}) },
    services: {
      provide: (n: string, impl: unknown) => {
        if (services.has(n)) throw new Error(`service ${n} already provided`);
        services.set(n, impl);
        return () => services.delete(n);
      },
      get: (n: string) => services.get(n),
    },
    systems: { add: (s: GameSystem) => (systems.push(s), () => systems.splice(systems.indexOf(s), 1)) },
    persist: { register: vi.fn(() => () => {}) },
    hud: { mount: (slot: string, w: { id: string }) => (mounted.push({ slot, id: w.id }), () => {}) },
    ...over,
  } as unknown as PluginContext;
  return { ctx, listeners, systems, services, clock, actors, mounted, camera };
}
