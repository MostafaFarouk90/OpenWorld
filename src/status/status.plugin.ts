import type { Actor, ActorId } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { Action } from '../input/actions';
import '../actors/status';
import { StatusEngine } from './StatusEngine';
import { STATUS_DATA_KEY, type ActorStatusView } from './view';

/** What a stunned player cannot do. Movement keys are covered by `lockMove`. */
const STUN_LOCKED_ACTIONS: readonly Action[] = [
  'sprint', 'jump', 'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'surge', 'surgeLeap',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'mount',
];

/**
 * The `status` service (contracts/actors-and-damage.md section 10): bleed, ignite, stun and slow.
 *
 * Ticks go through the damage bus as `kind: 'status'`; stun and slow reach enemies through
 * `actor.data['status']` (an `ActorStatusView`) and the player through a move modifier. Statuses are not saved.
 */
const statusPlugin: GamePlugin = {
  id: 'status',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    const playerId = (): ActorId => ctx.player.actor.id;
    let playerMod: { stunned: boolean; slow: number; off: (() => void) | null } = { stunned: false, slow: 0, off: null };

    const syncPlayer = (view: ActorStatusView | null): void => {
      const stunned = view?.stunned ?? false;
      const slow = view?.slow ?? 0;
      if (playerMod.off && playerMod.stunned === stunned && playerMod.slow === slow) return;
      playerMod.off?.();
      playerMod = { stunned, slow, off: null };
      if (!stunned && slow === 0) return;
      playerMod.off = ctx.player.addMoveModifier('status', stunned
        ? { speedScale: 0, lockMove: true, lockActions: STUN_LOCKED_ACTIONS }
        : { speedScale: 1 - slow });
    };

    const engine = new StatusEngine({
      actor: (id): Actor | undefined => ctx.actors.get(id),
      tick: (req) => ctx.damage.apply(req) !== null,
      applied: (actorId, id, kind) => ctx.events.emit('status.applied', { actorId, id, kind }),
      expired: (actorId, id, kind) => ctx.events.emit('status.expired', { actorId, id, kind }),
      view: (actorId, view) => {
        const actor = ctx.actors.get(actorId);
        if (actor) {
          if (view) actor.data[STATUS_DATA_KEY] = view;
          else delete actor.data[STATUS_DATA_KEY];
        }
        if (actorId === playerId()) syncPlayer(view);
      },
    });

    ctx.services.provide('status', {
      apply: (actorId, spec) => engine.apply(actorId, spec),
      clear: (actorId, id) => engine.clear(actorId, id),
      has: (actorId, kind) => engine.has(actorId, kind),
      list: (actorId) => engine.list(actorId),
    });

    ctx.events.on('actor.died', (e) => engine.clear(e.actorId));
    ctx.events.on('actor.despawned', (e) => engine.clear(e.actorId));
    // A bleeding Footman that yields, an ignited hound that is calmed: the player's statuses end with the mercy.
    ctx.events.on('mercy', (e) => {
      if (e.actorId) engine.clearPlayerSourced(e.actorId);
    });
    ctx.events.on('save.loaded', () => engine.clearAll());

    ctx.systems.add({
      id: 'status',
      fixedPhase: 'rules',
      order: 30,
      fixedUpdate: (dt) => engine.update(dt),
    });
  },
};

export default statusPlugin;
