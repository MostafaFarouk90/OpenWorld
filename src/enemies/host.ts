import type { GameContext } from '../core/Game';
import { heightAt as terrainHeightAt } from '../terrain/heightfield';
import { loudFromSpeed, makeSpeedMeter } from './ai/awareness';
import type { EnemyHost, EventsPort, InteractionPort, ServicesPort, TorchState } from './ports';
import './events';

/** Contact radius of the carried flame itself; the scarecrow adds its own `contactRadius`. */
export const TORCH_FLAME_RADIUS = 0.3;

/**
 * The carried torch as the enemies read it, from the quests service. The shipped service exposes
 * `torch(): {x,y,z} | null` (src/quests/service.ts); `carriedTorch()` was the shape guessed before it landed and
 * is still honoured when present. Reading only `carriedTorch` meant no torch ever ignited a scarecrow.
 */
export function torchFromQuests(quests: unknown): TorchState | null {
  const q = quests as { carriedTorch?: () => TorchState | null; torch?: () => { x: number; y: number; z: number } | null } | undefined;
  if (!q) return null;
  if (typeof q.carriedTorch === 'function') return q.carriedTorch() ?? null;
  if (typeof q.torch !== 'function') return null;
  const at = q.torch();
  if (!at) return null;
  return {
    lit: true,
    radius: TORCH_FLAME_RADIUS,
    position: (out) => {
      out.x = at.x;
      out.y = at.y;
      out.z = at.z;
      return out;
    },
  };
}

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
        ctx.gates.watch(
          (state) =>
            test(
              (k) => Boolean(state.getFlag(k)),
              (k) => {
                const v = state.getFlag(k);
                return typeof v === 'string' ? v : undefined;
              },
            ),
          listener,
          { keys },
        ),
    },
    // vfx (thread 7) and lockOn (thread 1) are optional: get() returns undefined until they merge.
    services: ctx.services as unknown as ServicesPort,
    bosses: ctx.bosses,
    calmUi: {
      focusedId: () => ctx.interaction.focusFor('mercy')?.id ?? null,
      holding: () => ctx.interaction.holdProgressFor('mercy') > 0,
      modalOpen: () => ctx.hud.modalOpen !== null,
      claimWheel: (owner) => ctx.input.claimWheel(owner),
      consumeWheel: (owner) => ctx.input.consumeWheel(owner),
      text: (key) => ctx.strings.t(key),
    },
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
      carried: () => torchFromQuests((ctx.services as unknown as ServicesPort).get('quests')),
    },
    heightAt: terrainHeightAt,
    warn,
  };
}
