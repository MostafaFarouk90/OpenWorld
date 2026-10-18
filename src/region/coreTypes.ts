// TEMPORARY shim: the narrow slice of thread 0's core API (contracts/game-events-and-flags.md section 3,
// world-layout-and-npcs.md, actors-and-damage.md) that the region and npcs plugins use. Thread 0's
// branch is not on GitHub yet, so this repo-local copy lets both compile and be tested with fakes.
// When thread 0's PR merges, delete this file and import the real types; every use goes through
// the `CoreContext` interface below, so that is a one-file change plus the adapter in coreAdapter.ts.
import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Anchor {
  id: string;
  /** y is absolute. */
  position: Vec3;
  yaw: number;
  tags?: string[];
}

export interface AnchorsApi {
  define(anchor: Anchor): void;
  get(id: string): Anchor;
  find(id: string): Anchor | undefined;
  withTag(tag: string): Anchor[];
}

export type InteractKind = 'talk' | 'door' | 'chest' | 'pickup' | 'waystone' | 'lever' | 'kneel' | 'release' | 'use';

export interface Interactable {
  id: string;
  kind: InteractKind;
  position(out: THREE.Vector3): THREE.Vector3;
  radius?: number;
  promptKey?: string;
  name?: string;
  holdSeconds?: number;
  priority?: number;
  enabled?(): boolean;
  onInteract(actor: ActorLike): void;
}

export interface InteractionApi {
  register(i: Interactable): () => void;
}

export type TriggerDef = {
  id: string;
  who?: 'player' | 'any-actor';
  once?: boolean;
  shape:
    | { type: 'sphere'; center: Vec3; radius: number }
    | { type: 'box'; center: Vec3; half: Vec3; yaw?: number };
};

export interface TriggersApi {
  add(def: TriggerDef): () => void;
}

export type Team = 'player' | 'ally' | 'neutral' | 'hostile';

export interface ActorInit {
  kind: string;
  team: Team;
  level?: number;
  maxHealth: number;
  immortal?: boolean;
  hittable?: boolean;
  root?: THREE.Object3D;
  owner?: unknown;
  id?: string;
}

export interface ActorLike {
  readonly id: string;
  readonly kind: string;
  team: Team;
  hittable: boolean;
  readonly immortal: boolean;
  readonly dead: boolean;
  root: THREE.Object3D | null;
  data: Record<string, unknown>;
}

export interface ActorsApi {
  spawn(init: ActorInit): ActorLike;
  despawn(id: string): void;
  bindOwner(actor: ActorLike, owner: unknown): () => void;
}

export interface EventsApi {
  emit(type: string, payload: unknown): void;
  on(type: string, listener: (payload: any) => void): () => void;
}

export interface StateApi {
  getBool(key: string, fallback?: boolean): boolean;
  setFlag(key: string, value: boolean | number | string): void;
}

export interface ServicesApi {
  get(name: string): unknown;
  provide(name: string, impl: unknown): () => void;
}

export interface StringsApi {
  register(locale: string, table: Record<string, string>, opts?: { override?: boolean }): void;
  t(key: string, params?: Record<string, string | number>): string;
}

export interface PhysicsApi {
  addStaticCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider;
  removeCollider(collider: RAPIER.Collider): void;
}

export type FixedPhase = 'input' | 'intent' | 'animation' | 'afterCombat' | 'rules' | 'late';
export type RenderPhase = 'world' | 'afterCamera' | 'hud';

export interface GameSystem {
  id: string;
  fixedPhase?: FixedPhase;
  renderPhase?: RenderPhase;
  order?: number;
  fixedUpdate?(dt: number): void;
  render?(alpha: number, frameTime: number): void;
  dispose?(): void;
}

export interface SystemsApi {
  add(system: GameSystem): () => void;
}

export interface CombatApi {
  addTarget(hurtboxes: unknown): void;
  removeTarget?(hurtboxes: unknown): void;
}

/** The pieces of GameContext the region and npcs plugins read. */
export interface CoreContext {
  scene: THREE.Scene;
  physics: PhysicsApi;
  anchors: AnchorsApi;
  triggers: TriggersApi;
  interaction: InteractionApi;
  actors: ActorsApi;
  events: EventsApi;
  state: StateApi;
  services: ServicesApi;
  strings: StringsApi;
  systems: SystemsApi;
  combat: CombatApi;
}

export interface GamePlugin {
  id: string;
  dependsOn?: string[];
  setup(ctx: CoreContext): void | Promise<void>;
  dispose?(): void;
}
