import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { heightAt } from '../terrain/heightfield';
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
  const pending = offs;
  offs = [];
  for (const o of pending) {
    try {
      o();
    } catch (err) {
      console.warn('npcs: teardown step failed', err);
    }
  }
  manager?.dispose();
  manager = null;
}

export default {
  id: 'npcs',
  dependsOn: ['core', 'region'],
  setup(ctx) {
    try {
      ctx.strings.register('en', NPC_STRINGS_EN);
      const assets = ctx.assets;
      manager = new NpcManager(ctx, {
        layoutNpcs: BRIGHTWATER_LAYOUT.npcs,
        defs: NPC_DEFS,
        loader: assets && isLoader(assets) ? assets : undefined,
        playerPosition: playerPositionFrom(ctx),
        heightAt,
      });
      const m = manager;
      m.spawnAll();
      offs.push(ctx.services.provide('npcs', m));
      offs.push(
        ctx.systems.add({ id: 'npcs-behaviour', fixedPhase: 'intent', order: -50, fixedUpdate: (dt) => m.fixedUpdateBehaviour(dt) }),
        ctx.systems.add({ id: 'npcs-anim', fixedPhase: 'animation', order: 150, fixedUpdate: (dt) => m.fixedUpdateAnimation(dt) }),
      );
      // GLBs download by proximity (NpcManager.loadNear), never in setup: the 10 s plugin timeout and the first-load budget.
    } catch (err) {
      teardown();
      throw err;
    }
  },
  dispose: teardown,
} satisfies GamePlugin;
