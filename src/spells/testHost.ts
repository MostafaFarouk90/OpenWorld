// Fakes for the spell tests. Not exported from the plugin.
import * as THREE from 'three';
import type {
  ActorId, ActorLike, ActorsLike, ClockLike, DamageLike, DamageResultLike, EventsLike, GameSystem, PluginContext, PlayerLike,
  VfxEventMap, VfxEventType,
} from '../vfx/ports';
import type { SpellsService } from './types';
import { Ember } from './Ember';
import type { SpellHost } from './SpellCaster';

export class FakeEvents implements EventsLike {
  log: Array<{ type: string; payload: unknown }> = [];
  private listeners = new Map<string, Set<(p: never) => void>>();
  on<K extends VfxEventType>(type: K, fn: (p: VfxEventMap[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => void set!.delete(fn as (p: never) => void);
  }
  emit<K extends VfxEventType>(type: K, payload: VfxEventMap[K]): void {
    this.log.push({ type, payload });
    for (const fn of [...(this.listeners.get(type) ?? [])]) (fn as (p: VfxEventMap[K]) => void)(payload);
  }
  types(): string[] { return this.log.map((l) => l.type); }
  count(): number { let n = 0; for (const s of this.listeners.values()) n += s.size; return n; }
}

export class FakeActor implements ActorLike {
  kind = 'npc';
  hittable = true;
  root = null;
  health: number;
  stamina: number;
  private _dead = false;
  pos = new THREE.Vector3();
  constructor(public readonly id: string, public team: ActorLike['team'] = 'hostile', x = 0, z = 0, public maxHealth = 100, public maxStamina = 100) {
    this.pos.set(x, 0, z);
    this.health = maxHealth;
    this.stamina = 0;
  }
  get dead(): boolean { return this._dead; }
  kill(): void { this._dead = true; this.health = 0; }
  worldPosition(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.pos); }
  restoreStamina(n: number): void { this.stamina = Math.min(this.maxStamina, this.stamina + n); }
}

export class FakeActors implements ActorsLike {
  map = new Map<string, FakeActor>();
  constructor(public readonly player: FakeActor) { this.map.set(player.id, player); }
  add(a: FakeActor): FakeActor { this.map.set(a.id, a); return a; }
  get(id: ActorId): FakeActor | undefined { return this.map.get(id); }
  all(): Iterable<ActorLike> { return this.map.values(); }
}

export class FakePlayer implements PlayerLike {
  feet = new THREE.Vector3();
  facingYaw = 0;
  avatar = null;
  modifiers = new Map<number, { source: string; mod: Parameters<PlayerLike['addMoveModifier']>[1] }>();
  private nextId = 1;
  constructor(public readonly actor: FakeActor) {}
  addMoveModifier(source: string, mod: Parameters<PlayerLike['addMoveModifier']>[1]): () => void {
    const id = this.nextId++;
    this.modifiers.set(id, { source, mod });
    return () => void this.modifiers.delete(id);
  }
}

export class FakeDamage implements DamageLike {
  applied: Array<Parameters<DamageLike['apply']>[0]> = [];
  healed: Array<{ id: string; amount: number }> = [];
  constructor(private actors: FakeActors) {}
  apply(req: Parameters<DamageLike['apply']>[0]): DamageResultLike | null {
    this.applied.push(req);
    return null;
  }
  stagger(): boolean { return false; }
  heal(id: string, amount: number): number {
    this.healed.push({ id, amount });
    const a = this.actors.get(id);
    if (!a || a.dead) return 0;
    const before = a.health;
    a.health = Math.min(a.maxHealth, a.health + amount);
    return a.health - before;
  }
}

export class FakeClock implements ClockLike {
  tick = 0;
  seconds = 0;
  hitStops: number[] = [];
  hitStop(s: number): void { this.hitStops.push(s); }
}

export interface World {
  events: FakeEvents;
  player: FakePlayer;
  actors: FakeActors;
  damage: FakeDamage;
  clock: FakeClock;
  ember: Ember;
  host: SpellHost & { staggered: boolean; busy: boolean; blocked: boolean; cancelReason: string | null; clipResult: boolean; clips: string[] };
}

export function makeWorld(): World {
  const events = new FakeEvents();
  const pa = new FakeActor('player', 'player');
  const actors = new FakeActors(pa);
  const player = new FakePlayer(pa);
  const ember = new Ember();
  const host = {
    events, player, actors, ember,
    staggered: false, busy: false, blocked: false, cancelReason: null as string | null, clipResult: true, clips: [] as string[],
    playClip(clip: string) { events.log.push({ type: 'clip', payload: clip }); host.clips.push(clip); return host.clipResult; },
    isStaggered() { return host.staggered; },
    isBusy() { return host.busy; },
    inputBlocked() { return host.blocked; },
    cancelRequested() { const r = host.cancelReason; host.cancelReason = null; return r; },
  };
  return { events, player, actors, damage: new FakeDamage(actors), clock: new FakeClock(), ember, host };
}

export interface FakeCtx {
  ctx: PluginContext;
  world: World;
  systems: GameSystem[];
  services: Record<string, unknown> & { spells?: SpellsService };
  persisted: Map<string, { key: string; version: number; serialize(): unknown; load(d: unknown, v: number): void }>;
  pressed: Set<string>;
  /** Runs the fixed systems in phase order for `ticks` ticks of dt. */
  tick(ticks?: number, dt?: number): void;
}

export function makeCtx(extra: Record<string, unknown> = {}): FakeCtx {
  const world = makeWorld();
  const systems: GameSystem[] = [];
  const services: Record<string, unknown> = { ...extra };
  const persisted: FakeCtx['persisted'] = new Map();
  const pressed = new Set<string>();
  const phases = ['input', 'intent', 'animation', 'afterCombat', 'rules', 'late'];
  const ctx = {
    scene: new THREE.Scene(),
    camera: null,
    events: world.events,
    clock: world.clock,
    player: world.player,
    actors: world.actors,
    damage: world.damage,
    services: {
      provide(name: string, impl: unknown) { services[name] = impl; return () => { delete services[name]; }; },
      get(name: string) { return services[name]; },
    },
    systems: { add(s: GameSystem) { systems.push(s); return () => void systems.splice(systems.indexOf(s), 1); } },
    persist: { register(p: FakeCtx['persisted'] extends Map<string, infer V> ? V : never) { persisted.set(p.key, p); return () => void persisted.delete(p.key); } },
    hud: { mount: () => () => undefined },
    input: { actions: { pressed: (a: string) => pressed.has(a) } },
  } as unknown as PluginContext;
  const f: FakeCtx = {
    ctx, world, systems, services, persisted, pressed,
    tick(ticks = 1, dt = 1 / 60) {
      for (let i = 0; i < ticks; i++) {
        const ordered = [...systems].sort((a, b) => phases.indexOf(a.fixedPhase ?? 'rules') - phases.indexOf(b.fixedPhase ?? 'rules') || (a.order ?? 0) - (b.order ?? 0));
        for (const s of ordered) s.fixedUpdate?.(dt, ctx);
        world.clock.seconds += dt;
      }
    },
  };
  return f;
}
