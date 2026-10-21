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
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'mount', 'interact', 'mercy', 'sneak',
];

/**
 * The `status` service (contracts/actors-and-damage.md section 10): bleed, ignite, stun and slow.
 *
 * Ticks go through the damage bus as `kind: 'status'`; stun and slow reach enemies through
 * `actor.data['status']` (an `ActorStatusView`) and the player through a move modifier. Statuses are not saved.
 */
let cleanup: (() => void) | null = null;

const statusPlugin: GamePlugin = {
  id: 'status',
  dependsOn: ['core'],
  dispose() {
    cleanup?.();
    cleanup = null;
  },
  setup(ctx: GameContext) {
    const playerId = (): ActorId => ctx.player.actor.id;
    let playerMod: { stunned: boolean; rooted: boolean; slow: number; off: (() => void) | null } = { stunned: false, rooted: false, slow: 0, off: null };

    const syncPlayer = (view: ActorStatusView | null): void => {
      const stunned = view?.stunned ?? false;
      const rooted = view?.rooted === true;
      const slow = view?.slow ?? 0;
      if (playerMod.off && playerMod.stunned === stunned && playerMod.rooted === rooted && playerMod.slow === slow) return;
      playerMod.off?.();
      playerMod = { stunned, rooted, slow, off: null };
      if (!stunned && !rooted && slow === 0) return;
      // v0.6 root: speed 0, actions (attacks, spells, dodge-in-place) stay free.
      playerMod.off = ctx.player.addMoveModifier('status', stunned
        ? { speedScale: 0, lockMove: true, lockActions: STUN_LOCKED_ACTIONS }
        : { speedScale: rooted ? 0 : 1 - slow });
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

    cleanup = () => {
      // The scope removes listeners and the service; the views on actors are ours to take down.
      engine.clearAll();
    };

    ctx.systems.add({
      id: 'status',
      fixedPhase: 'rules',
      order: 30,
      fixedUpdate: (dt) => engine.update(dt),
    });
  },
};

export default statusPlugin;
