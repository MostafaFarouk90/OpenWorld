import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { NPC_DEFS } from './npcDefs';
import { NpcManager } from './NpcManager';
import { NPC_STRINGS_EN } from './strings.en';
import type { NpcModelLoader } from './types';

let manager: NpcManager | null = null;
let offs: Array<() => void> = [];

function isLoader(x: unknown): x is NpcModelLoader {
  const l = x as Partial<NpcModelLoader> | null | undefined;
  return !!l && typeof l.load === 'function' && typeof l.instantiate === 'function' && typeof l.animations === 'function';
}

/** The player's simulated feet (PlayerHandle.feet in the core context). */
function playerPositionFrom(ctx: CoreContext): () => { x: number; z: number } | null {
  return () => {
    const v = ctx.player?.feet;
    return v && Number.isFinite(v.x) && Number.isFinite(v.z) ? { x: v.x, z: v.z } : null;
  };
}

function teardown(): void {
  offs.forEach((o) => o());
  offs = [];
  manager?.dispose();
  manager = null;
}

export default {
  id: 'npcs',
  dependsOn: ['core', 'region'],
  setup(ctx) {
    try {
      ctx.strings.register('en', NPC_STRINGS_EN);
      const assets = ctx.services.get('assets');
      manager = new NpcManager(ctx, {
        layoutNpcs: BRIGHTWATER_LAYOUT.npcs,
        defs: NPC_DEFS,
        loader: isLoader(assets) ? assets : undefined,
        playerPosition: playerPositionFrom(ctx),
      });
      const m = manager;
      m.spawnAll();
      offs.push(ctx.services.provide('npcs', m));
      offs.push(
        ctx.systems.add({ id: 'npcs-behaviour', fixedPhase: 'intent', order: -50, fixedUpdate: (dt) => m.fixedUpdateBehaviour(dt) }),
        ctx.systems.add({ id: 'npcs-anim', fixedPhase: 'animation', order: 150, fixedUpdate: (dt) => m.fixedUpdateAnimation(dt) }),
      );
      void m.loadModels();
    } catch (err) {
      teardown();
      throw err;
    }
  },
  dispose: teardown,
} satisfies GamePlugin;
