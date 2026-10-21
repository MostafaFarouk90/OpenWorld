import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { heightAt } from '../../terrain/heightfield';
import { looseService } from '../../vfx/ports';
import { KNIGHT_TIER3_STRINGS_EN } from './strings.en';
import { HalvardCharge, Oathward, SquiresResolve } from './tier3';
import { HALVARD, OATHWARD, SKILL_IDS, SQUIRE } from './tuning';

type Loose = { get(name: string): unknown };
interface ControllerLike {
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  readonly currentAction?: string | null;
}
interface VerbsLike {
  readonly busy: boolean;
  readonly staggered: boolean;
  holdForcedMove(owner: string, move: { x: number; z: number; speed: number } | null): void;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; scale?: number; yaw?: number; attach?: unknown },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
}

let cleanup: (() => void) | null = null;

/**
 * Knight tier 3 (Act 2): Oathward, Charge of the Halvard and Squire's Resolve. The Knight plays with a null class before M07, so
 * every handler accepts null or 'knight'. The skills themselves are the Knight's rows in progression/skills.ts.
 */
const knightTier3Plugin: GamePlugin = {
  id: 'knight-tier3',
  dependsOn: ['core', 'progression', 'combat-verbs'],
  setup(ctx: GameContext) {
    cleanup?.();
    const offs: Array<() => void> = [];
    const loose = ctx.services as unknown as Loose;
    const svc = <T>(name: string): T | undefined => loose.get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const progression = () => looseService(ctx.services, 'progression');
    const learnedId = (id: string): boolean => progression()?.learned(id) === true;
    const classId = (): string | null => progression()?.classId ?? null;
    const verbs = () => svc<VerbsLike>('combatVerbs');
    const controller = () => ctx.player.avatar?.controller as unknown as ControllerLike | undefined;
    const playerId = () => ctx.actors.player.id;
    const vfx = () => svc<VfxLike>('vfx');

    try {
      const strings = ctx.strings.register('en', KNIGHT_TIER3_STRINGS_EN, { override: true });
      if (typeof strings === 'function') offs.push(strings);

      // Oathward
      const oath = new Oathward({
        now: () => ctx.clock.seconds,
        playerId,
        classId,
        learned: () => learnedId(SKILL_IDS.oathward),
        dead: () => ctx.actors.player.dead,
        feet: () => ctx.player.feet,
        bubble: () => {
          const h = vfx()?.spawnEffect?.(OATHWARD.bubbleFx, { position: ctx.player.feet, attach: ctx.player.avatar?.root }, { seconds: OATHWARD.seconds });
          return h ? () => h.stop() : null;
        },
        burst: (at) => void vfx()?.spawnEffect?.(OATHWARD.burstFx, { position: { x: at.x, y: at.y + 1, z: at.z } }),
      });
      offs.push(() => oath.clear());
      offs.push(ctx.damage.addModifier(OATHWARD.modifierId, (req, target) => oath.absorb(req, target.id), OATHWARD.modifierOrder));

      // Charge of the Halvard
      const charge = new HalvardCharge(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          classId,
          learned: () => learnedId(SKILL_IDS.chargeOfTheHalvard),
          heightAt: (x, z) => heightAt(x, z),
          feet: () => ctx.player.feet,
          facingYaw: () => ctx.player.facingYaw,
          blockedReason: () => {
            if (ctx.actors.player.dead) return 'dead';
            if (verbs()?.staggered) return 'staggered';
            if (verbs()?.busy || controller()?.currentAction) return 'busy';
            return null;
          },
          playClip: (clip) => controller()?.playOneShot?.(clip, { lockMove: true }) === true,
          hold: (move) => verbs()?.holdForcedMove(HALVARD.holdOwner, move),
          interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || controller()?.currentAction === 'dodge',
          reportTrigger: (id) => svc<{ reportTrigger?(id: string): void }>('abilities')?.reportTrigger?.(id),
          fx: (at, yaw) => void vfx()?.spawnEffect?.(HALVARD.fx, { position: at, yaw }),
          skillId: SKILL_IDS.chargeOfTheHalvard,
        },
        playerId,
      );
      offs.push(() => charge.cancel());

      // Squire's Resolve
      const squire = new SquiresResolve({
        now: () => ctx.clock.seconds,
        playerId,
        feet: () => ctx.player.feet,
        classId,
        learned: () => learnedId(SKILL_IDS.squiresResolve),
        fx: (at) => void vfx()?.spawnEffect?.(SQUIRE.fx, { position: at }),
        alive: (id) => {
          const a = ctx.actors.get(id);
          return !!a && !a.dead;
        },
      });
      offs.push(() => squire.reset());
      offs.push(ctx.damage.addLethalHandler(SQUIRE.handlerId, (target) => squire.lethal(target as never), SQUIRE.handlerOrder));

      const abilities = looseService(ctx.services, 'abilities');
      const reg = (id: string, fn: () => { ok: true } | { ok: false; reason: string }, label: string) => {
        const r = abilities?.registerHandler(id, fn);
        if (r?.ok) offs.push(r.dispose);
        else warn(`knight: ${label} handler not registered (${r ? r.reason : 'no abilities service'})`);
      };
      reg(SKILL_IDS.oathward, () => oath.cast(), 'Oathward');
      reg(SKILL_IDS.chargeOfTheHalvard, () => charge.start(), 'Charge of the Halvard');

      offs.push(
        ctx.events.on('ai.aggro', (e) => squire.onAggro(e.actorId, ctx.actors.get(e.actorId)?.team)),
        ctx.events.on('damage.dealt', (e) =>
          squire.onDamage(e.attackerId ? ctx.actors.get(e.attackerId)?.team : undefined, ctx.actors.get(e.targetId)?.team),
        ),
        ctx.events.on('ai.calm', (e) => squire.fight.gone(e.actorId)),
        ctx.events.on('actor.despawned', (e) => squire.fight.gone(e.actorId)),
        ctx.events.on('actor.died', (e) => {
          squire.onDied(e.actorId);
          if (e.actorId === playerId()) {
            oath.clear();
            charge.cancel();
          }
        }),
        ctx.events.on('class.changed', () => {
          oath.clear();
          charge.cancel();
          squire.reset();
        }),
        ctx.events.on('save.loaded', () => {
          oath.clear();
          charge.cancel();
          squire.reset();
        }),
        ctx.systems.add({
          id: 'knight.tier3.fixed',
          fixedPhase: 'afterCombat',
          order: 125,
          fixedUpdate() {
            if (charge.charging && !learnedId(SKILL_IDS.chargeOfTheHalvard)) charge.cancel();
            oath.tick();
            charge.tick();
            squire.tick();
          },
        }),
      );
    } catch (err) {
      for (const off of offs.splice(0).reverse()) off();
      throw err;
    }
    cleanup = () => {
      cleanup = null;
      for (const off of offs.splice(0).reverse()) off();
    };
  },
  dispose() {
    cleanup?.();
  },
};

export default knightTier3Plugin;
