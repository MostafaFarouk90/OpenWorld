// Aliases for the slices of the core API that the region and npcs code uses, so the rest of the code
// names what it needs (`Pick<CoreContext, 'scene' | 'anchors'>`) and tests can build a partial fake.
import type { Actor } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import type { Vec3 } from '../physics/PhysicsWorld';

export type { ActorInit } from '../actors/Actor';
export type { GamePlugin } from '../core/plugins';
export type { GameSystem } from '../core/systems';
export type { Anchor, AnchorRegistry as AnchorsApi } from '../layout/AnchorRegistry';
export type { TriggerDef } from '../layout/TriggerVolumes';
export type { Interactable } from '../interaction/InteractionSystem';
export type { Vec3 };
export type CoreContext = GameContext;
export type ActorLike = Actor;
