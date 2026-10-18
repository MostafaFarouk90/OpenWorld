import type * as THREE from 'three';
import type { ActorLike, Vec3 } from '../region/coreTypes';

export type NpcModelId = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'rogueHooded';

export interface NpcDef {
  id: string;
  nameKey: string;
  model: NpcModelId;
  scale: number;
  /** Colour the materials are pulled toward; null leaves the model's own colours. */
  tint: number | null;
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
