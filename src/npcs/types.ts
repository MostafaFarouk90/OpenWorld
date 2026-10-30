import type * as THREE from 'three';
import type { ActorLike, Vec3 } from '../region/coreTypes';
import type { NpcSpec } from '../region/layoutTypes';

/** The KayKit Adventurers bodies. */
export type KayKitBodyId = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'rogueHooded';

/**
 * Generated townsfolk bodies (GLB-Viewer character generator, townsfolk game set: chibi look, KayKit size and skeleton).
 * They carry no clips; the NPC loaders take Knight.glb's (see withTownsfolkClips). Which NPC wears which is the single
 * table in townsfolkBodies.ts.
 */
export const TOWN_BODY_IDS = [
  'town-villager-a', 'town-villager-b', 'town-villager-c', 'town-farmer-a', 'town-farmer-b', 'town-merchant-a',
  'town-merchant-b', 'town-blacksmith-a', 'town-guard-a', 'town-priest-a', 'town-miner-a', 'town-miner-b',
  'town-survivor-a',
] as const;
export type TownBodyId = (typeof TOWN_BODY_IDS)[number];

export type NpcModelId = KayKitBodyId | TownBodyId;

export interface NpcDef {
  id: string;
  nameKey: string;
  model: NpcModelId;
  scale: number;
  /** Colour the materials are pulled toward; null leaves the model's own colours. */
  tint: number | null;
  /** How far (0..1) the tint pulls; defaults to NPC_TUNING.tintStrength. */
  tintStrength?: number;
  /** The def to use when this def's GLB fails to load (a generated townsfolk body's KayKit original). */
  fallback?: NpcDef;
  dialogueId: string;
  idleClip: string;
  /** Props that belong to the NPC (a cloak, a lute); built once per spawn, facing -Z like yaw 0, and kept across the GLB swap. */
  extras?: () => THREE.Object3D;
  /** Runs on the cloned GLB after the tint (Tobb's green cape). */
  decorate?: (model: THREE.Object3D) => void;
}

/** The slice of AssetLoader the NPCs use; tests pass stand-ins. */
export interface NpcModelLoader {
  load(id: NpcModelId): Promise<unknown>;
  instantiate(id: NpcModelId): THREE.Object3D;
  animations(id: NpcModelId): THREE.AnimationClip[];
}

export interface NpcHandle {
  readonly id: string;
  readonly def: NpcDef;
  readonly root: THREE.Object3D;
  readonly actor: ActorLike;
  /** Current facing, radians (0 = -Z, pi/2 = -X: forward is (-sin yaw, -cos yaw)). */
  readonly yaw: number;
  /** True once the GLB has replaced the placeholder. */
  readonly hasModel: boolean;
}

/** Published as the 'npcs' service. */
export interface NpcsService {
  /** Moves an NPC to another anchor instantly; false (and no change) for an unknown npc or anchor. */
  place(id: string, anchorId: string): boolean;
  get(id: string): NpcHandle | undefined;
  position(id: string): Vec3 | undefined;
  /**
   * Adds a later region's NPCs (one spec and one def each, validated as a set). Returns a remover; a failure throws
   * and leaves the NPCs already spawned untouched.
   */
  register(specs: NpcSpec[], defs: NpcDef[]): () => void;
  /**
   * Act 2 (A5, additive): hides an NPC's figure and turns its talk prompt off while a stand-in plays it (Gaut on his
   * escort horse, Hrolf in his trial). Not saved; every hide clears on `save.loaded`. False for an unknown id.
   */
  setHidden(id: string, hidden: boolean): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    /** Provided by the npcs plugin (thread 4). */
    npcs: NpcsService;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    /** A talk interactable was used while no dialogue service exists (thread 3 not merged or failed). */
    'npc.talk-unavailable': { npcId: string };
  }
}
