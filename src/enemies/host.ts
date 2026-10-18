import type { GameContext } from '../core/Game';
import { heightAt as terrainHeightAt } from '../terrain/heightfield';
import type { EnemyHost, EventsPort, InteractionPort, ServicesPort } from './ports';
import './events';

/**
 * Adapts the game core to the narrow ports the enemy code is written against. The casts are
 * structural: the ports are subsets of the core types (checked by tsc where the shapes overlap).
 */
export function hostFromContext(ctx: GameContext, warn: (m: string) => void): EnemyHost {
  const playerCollider = ctx.world.player.controller.collider;
  return {
    scene: ctx.scene,
    physics: ctx.physics,
    actors: ctx.actors as unknown as EnemyHost['actors'],
    damage: ctx.damage as unknown as EnemyHost['damage'],
    combat: {
      bus: ctx.world.combat.combat.bus,
      addAttacker: (id, tracer, window) => ctx.combat.addAttacker(id, tracer, window),
      addTarget: (hurtboxes, id) => ctx.combat.addTarget(hurtboxes, id),
    },
    events: ctx.events as unknown as EventsPort,
    anchors: ctx.anchors,
    interaction: ctx.interaction as unknown as InteractionPort,
    state: ctx.state,
    // vfx (thread 7) and lockOn (thread 1) are optional: get() returns undefined until they merge.
    services: ctx.services as unknown as ServicesPort,
    player: {
      get actor() {
        return ctx.player.actor as unknown as EnemyHost['player']['actor'];
      },
      get feet() {
        return ctx.player.feet;
      },
      collider: playerCollider,
      loud: () => ctx.input.actions.down('sprint') || ctx.player.avatar?.controller.activeAttack() != null,
      addMoveModifier: (source, mod) => ctx.player.addMoveModifier(source, mod),
    },
    torch: {
      // The quests service exposes the carried torch (plans/slice-2-quests.md); absent until it lands.
      carried: () => (ctx.services as unknown as ServicesPort).get('quests')?.carriedTorch?.() ?? null,
    },
    heightAt: terrainHeightAt,
    warn,
  };
}
