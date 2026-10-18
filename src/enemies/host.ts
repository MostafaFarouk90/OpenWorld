import type { GameContext } from '../core/Game';
import { heightAt as terrainHeightAt } from '../terrain/heightfield';
import { loudFromSpeed, makeSpeedMeter } from './ai/awareness';
import type { EnemyHost, EventsPort, InteractionPort, ServicesPort } from './ports';
import './events';

/**
 * Adapts the game core to the narrow ports the enemy code is written against. The casts are
 * structural: the ports are subsets of the core types (checked by tsc where the shapes overlap).
 */
export function hostFromContext(ctx: GameContext, warn: (m: string) => void): EnemyHost {
  const playerCollider = ctx.world.player.controller.collider;
  const speed = makeSpeedMeter(() => ctx.player.feet, () => ctx.clock.seconds);
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
    gates: {
      watch: (test, listener, keys) =>
        ctx.gates.watch((state) => test((k) => Boolean(state.getFlag(k))), listener, { keys }),
    },
    // vfx (thread 7) and lockOn (thread 1) are optional: get() returns undefined until they merge.
    services: ctx.services as unknown as ServicesPort,
    bosses: ctx.bosses,
    player: {
      get actor() {
        return ctx.player.actor as unknown as EnemyHost['player']['actor'];
      },
      get feet() {
        return ctx.player.feet;
      },
      collider: playerCollider,
      // Measured pace, not the sprint key: Shift held while standing still is quiet.
      loud: () => loudFromSpeed(speed(), ctx.player.avatar?.controller.activeAttack() != null),
      speed,
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
