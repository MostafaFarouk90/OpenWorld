import type * as THREE from 'three';
import type { Vec3 } from '../physics/PhysicsWorld';
import type { Brain, BrainIntent, Senses } from './ai/Brain';
import type { EnemyBody } from './body';
import type { ActorId, EnemyHost } from './ports';
import type { CalmContext } from './calm';
import type { EnemyDef, MoveDef, SpawnOptions } from './types';

/**
 * Behaviour overlays (Act 2): per-kind rules layered on the shared enemy stack without `Enemy.ts` importing them. A
 * kind's `def.behaviour` id is looked up here when the enemy spawns; the overlay's hooks are optional and every one
 * that is absent leaves today's behaviour unchanged, so Act 1 kinds (no overlay) behave exactly as before.
 *
 * Owner: thread A6a (the wyrm's `wyrm-flight` and the wyrmling's `skittish`). Other threads register their own ids
 * (A6b's golem and crawler) with `registerBehaviour` from their own module, imported by their plugin.
 */

/** What an overlay may read and do on its enemy. One object per enemy; valid until the overlay's `dispose`. */
export interface BehaviourContext {
  readonly def: EnemyDef;
  readonly actorId: ActorId;
  /** K6b: the enemy's slug (`<kind>-<n>`), for interactable ids (`drag:<slug>`). */
  readonly slug: string;
  readonly spawnerId: string | null;
  /** The spawner slot (null for a loose spawn). */
  readonly slot: number | null;
  readonly options: Readonly<SpawnOptions>;
  readonly host: EnemyHost;
  readonly body: EnemyBody;
  readonly brain: Brain;
  /** Simulated feet this tick. */
  feet(): Readonly<Vec3>;
  yaw(): number;
  /** Where this enemy aims: the taunter it is drawn to, else the player (absent in test hosts: the player). */
  aim?(): Readonly<Vec3>;
  /** The enemy's random source (seeded per manager). */
  rng(): number;
  /**
   * Physics on: `fly(true)` moves the enemy onto the heightfield path with its collider disabled; `fly(false, at)`
   * lands it at `at` (default: where it is) with the collider back. Without physics only the landing point applies.
   */
  fly(on: boolean, at?: Vec3): void;
  /** A ray against the static world that ignores this enemy and the player; null without physics or without a hit. */
  raycast(origin: Vec3, dir: Vec3, length: number): { distance: number; point: Vec3 } | null;
  /** Inside an interior (a nav grid under the feet, or the interiors service's current interior). */
  indoors(): boolean;
  /** Plays a one-shot clip held for `seconds` (the stagger clip from touchdown, a roar). */
  playOneShot(clip: string, seconds: number): void;
  /** Moves this tick with `velocity` (m/s), turning toward it: for a `leave` override, which steers itself. */
  move(velocity: { x: number; z: number }, dt: number): void;
  /** Leaves the fight without a mercy (no credit, no loot, slot spent): the enemy goes into its `leave` as 'retired'. False when it is not alive (already leaving, calmed, dead). */
  retire(): boolean;
  /** Ends a leave: despawns now. */
  finish(): void;
}

/** The optional hooks. Each runs at the named point of `Enemy`; see the call sites for the exact order. */
export interface BehaviourOverlay {
  /** `think`, after the brain's step: adjust the intent in place (a flier's circle goal, a skitter's back-off). */
  intent?(dt: number, intent: BrainIntent, senses: Readonly<Senses>): void;
  /** `think`, before the brain's step: override whether the target is noticed this tick (a peaceful sleeper, a skitterer). */
  notices?(noticed: boolean, senses: Readonly<Senses>): boolean;
  /** Move choice: false removes a move from this tick's pick (a flier's air and ground moves). */
  allowMove?(move: MoveDef): boolean;
  /** `think`, after steering: clamp the velocity in place (a tether). */
  clampVelocity?(velocity: { x: number; z: number }, dt: number): void;
  /** `animate`, before the body's tick: feed the body (altitude, chain). */
  animate?(dt: number): void;
  /** Loco clip override (a resting wyrm's `Rest`); null keeps the normal choice. */
  loco?(): string | null;
  /** Mercy gates: given the brain's own answer, return the enemy's. Absent: the brain's answer. */
  mercyOpen?(brainOpen: boolean): boolean;
  calmOpen?(brainOpen: boolean): boolean;
  warmHandOpen?(brainOpen: boolean): boolean;
  /** K6b: what the Calm prompt knows from the overlay (the shambler's `pulledOut`, a flyer's `grounded`), merged over the manager's. */
  calmContext?(): Partial<CalmContext>;
  /** `actor.staggered` on this enemy: true when the overlay handled it (the brain is not told). */
  staggered?(byId: ActorId | null): boolean;
  /** A status stun: true when the overlay handled it. */
  stunned?(seconds: number): boolean;
  /** A move telegraphed (the dive locks its target here). */
  telegraphed?(move: MoveDef, swingId: number): void;
  /** Where a leap move lands, when the overlay locked it; null for today's straight leap. */
  leapPoint?(move: MoveDef): { x: number; z: number } | null;
  /** The actor's world position (lock-on, aims) when it is not the feet; leave `out` untouched to keep the feet. */
  actorPosition?(out: THREE.Vector3): void;
  /** `actor.pulled`: true refuses the pull (an airborne flier). */
  refusesPull?(): boolean;
  /** Leaving after a mercy, or retired: true when the overlay moved (or held) the enemy this tick itself. */
  leave?(dt: number, how: 'calmed' | 'spared' | 'retired'): boolean;
  /** Before the enemy goes dormant (a flier lands first). */
  sleep?(): void;
  /** A hit landed (outcome hit, not a status tick). */
  hit?(attackerId: ActorId | null): void;
  /** Brain state change, after `Enemy`'s own handling. */
  stateChanged?(from: string, to: string): void;
  dispose?(): void;
}

export type BehaviourFactory = (ctx: BehaviourContext) => BehaviourOverlay;

const REGISTRY = new Map<string, BehaviourFactory>();

/**
 * Registers the overlay for a `def.behaviour` id; returns the remover. A second registration of the same id replaces
 * the first (hot reload, tests), and the remover then removes only its own factory.
 */
export function registerBehaviour(id: string, factory: BehaviourFactory): () => void {
  REGISTRY.set(id, factory);
  return () => {
    if (REGISTRY.get(id) === factory) REGISTRY.delete(id);
  };
}

/** The overlay for a def's behaviour, or null (no behaviour, an unregistered id, or `circle-rush`, which lives in the brain). */
export function makeBehaviour(ctx: BehaviourContext): BehaviourOverlay | null {
  const id = ctx.def.behaviour;
  if (!id) return null;
  const factory = REGISTRY.get(id);
  return factory ? factory(ctx) : null;
}

/** Registered ids (tests). */
export function registeredBehaviours(): string[] {
  return [...REGISTRY.keys()];
}
