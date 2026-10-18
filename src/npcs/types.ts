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
  /** Current facing, radians (0 = +Z, pi/2 = +X). */
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
