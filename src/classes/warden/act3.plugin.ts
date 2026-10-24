import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import { looseService } from '../../vfx/ports';
import { Earthroot, FrenziedHearth, Skullsplitter, StaggerWatch } from './skills.act3';
import { EARTHROOT, FRENZIED_HEARTH, SKILL_IDS, SKULLSPLITTER, WARDEN_CLASS_ID } from './tuning';

type Loose = { get(name: string): unknown };
interface ControllerLike {
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  readonly currentAction?: string | null;
}
interface VerbsLike {
  readonly busy: boolean;
  readonly staggered: boolean;
}
type FxHandle = { stop?(): void } | undefined;
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; scale?: number; yaw?: number; attach?: unknown },
    params?: Record<string, number | string | boolean>,
  ): FxHandle | unknown;
  shake?(amplitude: number, seconds: number): void;
}

let cleanup: (() => void) | null = null;

/**
 * Warden tier 4 (Act 3, K11 PR 1): Skullsplitter, Earthroot and Frenzied Hearth. The rows already exist in skills.ts (K0); this
 * plugin only binds the behaviour in skills.act3.ts to the services, like warden.plugin.ts does for tier 3.
 *
 * Earthroot and the dodge: `lockMove` only zeroes the move vector in Player.fixedUpdate's normal branch (characters/Player.ts
 * lines 314-316); a dodge runs as a forced move (Player.ts line 302, the `forced` branch, which ignores lockMove) and
 * CombatVerbs.tryDodge (player/CombatVerbs.ts lines 348 and 404-415) never reads a move modifier. So the dodge stays reachable
 * under a plain lockMove, and Earthroot ends on the rising edge of `controller.currentAction === 'dodge'`.
 */
const wardenAct3Plugin: GamePlugin = {
  id: 'warden-act3',
  dependsOn: ['core', 'progression', 'combat-verbs', 'warden'],
  setup(ctx: GameContext) {
    cleanup?.();
    const offs: Array<() => void> = [];
    const loose = ctx.services as unknown as Loose;
    const svc = <T>(name: string): T | undefined => loose.get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const learned = (id: string): boolean => looseService(ctx.services, 'progression')?.learned(id) === true;
    /** A null class is not a Warden (unlike the Knight, who plays with a null class before M07). */
    const isWarden = (): boolean => looseService(ctx.services, 'progression')?.classId === WARDEN_CLASS_ID;
    const verbs = () => svc<VerbsLike>('combatVerbs');
    const controller = () => ctx.player.avatar?.controller as unknown as ControllerLike | undefined;
    const playerId = () => ctx.actors.player.id;
    const vfx = () => svc<VfxLike>('vfx');
    const trigger = (id: string) => svc<{ reportTrigger?(id: string): void }>('abilities')?.reportTrigger?.(id);
    const feetAt = () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z });
    const blockedNow = (): string | null => {
      if (ctx.actors.player.dead) return 'dead';
      if (verbs()?.staggered) return 'staggered';
      if (verbs()?.busy || controller()?.currentAction) return 'busy';
      return null;
    };
    const stopper = (h: FxHandle | unknown): (() => void) | undefined => {
      const s = (h as FxHandle)?.stop;
      return s ? () => s.call(h) : undefined;
    };

    try {
      const stagger = new StaggerWatch({
        events: ctx.events,
        actors: ctx.actors as never,
        now: () => ctx.clock.seconds,
        enemyState: (id) => svc<{ view?(id: string): { state?: string } | undefined }>('enemies')?.view?.(id)?.state,
      });
      offs.push(() => stagger.dispose());

      const chop = new Skullsplitter(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          stagger,
          now: () => ctx.clock.seconds,
          feet: () => ctx.player.feet,
          facingYaw: () => ctx.player.facingYaw,
          isWarden,
          learned: () => learned(SKILL_IDS.skullsplitter),
          blockedReason: blockedNow,
          playClip: (clip) => controller()?.playOneShot?.(clip, { lockMove: true }) === true,
          // currentAction reads null during a playOneShot (AnimationController.currentAction hides the 'oneShot' kind), so any
          // non-null action (a flinch, stagger, block, dodge) means the chop clip was replaced.
          interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || (controller()?.currentAction ?? null) !== null,
          reportTrigger: trigger,
          fx: {
            chop: (at, yaw, staggered) => {
              vfx()?.spawnEffect?.(
                SKULLSPLITTER.effect,
                { position: { x: at.x - Math.sin(yaw) * 1.6, y: at.y, z: at.z - Math.cos(yaw) * 1.6 }, yaw },
                { staggered, reach: SKULLSPLITTER.reach },
              );
              vfx()?.shake?.(SKULLSPLITTER.shakeAmplitude, SKULLSPLITTER.shakeSeconds);
            },
          },
          skillId: SKILL_IDS.skullsplitter,
        },
        playerId,
      );
      offs.push(() => chop.cancel());

      const root = new Earthroot(
        {
          events: ctx.events,
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          now: () => ctx.clock.seconds,
          isWarden,
          learned,
          feet: () => ctx.player.feet,
          blockedReason: blockedNow,
          lockMove: () => ctx.player.addMoveModifier(EARTHROOT.moveSource, { lockMove: true }),
          dodging: () => controller()?.currentAction === 'dodge',
          fx: (seconds) => stopper(vfx()?.spawnEffect?.(EARTHROOT.effect, { position: feetAt() }, { seconds })),
          shockFx: (at) => void vfx()?.spawnEffect?.(EARTHROOT.shockEffect, { position: { x: at.x, y: at.y, z: at.z } }, { radius: EARTHROOT.shockRadius }),
          reportTrigger: trigger,
          skillId: SKILL_IDS.earthroot,
        },
        playerId,
      );
      offs.push(() => root.dispose());
      // Order -30: after the guard (-50) and Oathward (-40) of the defender band, ahead of the buffs band.
      offs.push(ctx.damage.addModifier(EARTHROOT.modifierId, (req, target) => root.modify(req, target.id), EARTHROOT.order));

      const hearth = new FrenziedHearth(
        {
          events: ctx.events,
          actor: () => ctx.actors.player as never,
          tick: () => ctx.clock.tick,
          isWarden,
          learned,
          heal: (id, amount) => ctx.damage.heal(id, amount),
          // Not done (design 11.5): the red vignette (no continuous screen-fx API; ScreenFx.pulse is timed) and "hit-stop disabled
          // for incoming hits" (no hit-stop hook to veto). Only shoulder steam that rides the player is drawn. With `attach` the
          // preset adds the root's world position itself (effects/index.ts origin), so the offset is zero.
          fx: () => {
            const attach = ctx.player.avatar?.root;
            return stopper(vfx()?.spawnEffect?.(FRENZIED_HEARTH.effect, { position: attach ? { x: 0, y: 0, z: 0 } : feetAt(), attach }));
          },
          skillId: SKILL_IDS.frenziedHearth,
        },
        playerId,
      );
      offs.push(() => hearth.dispose());
      // Order 10: buffs band (0..49), after the guard and block have settled the outcome.
      offs.push(ctx.damage.addModifier(FRENZIED_HEARTH.modifierId, (req, target) => hearth.modify(req, target.id), FRENZIED_HEARTH.order));

      const abilities = looseService(ctx.services, 'abilities');
      const h1 = abilities?.registerHandler(SKILL_IDS.skullsplitter, () => chop.start());
      if (h1?.ok) offs.push(h1.dispose);
      else warn(`warden: Skullsplitter handler not registered (${h1 ? h1.reason : 'no abilities service'})`);
      const h2 = abilities?.registerHandler(SKILL_IDS.earthroot, () => root.start());
      if (h2?.ok) offs.push(h2.dispose);
      else warn(`warden: Earthroot handler not registered (${h2 ? h2.reason : 'no abilities service'})`);

      const clearAll = (): void => {
        chop.cancel();
        root.reset();
        hearth.reset();
      };
      offs.push(
        ctx.events.on('class.changed', clearAll),
        ctx.events.on('save.loaded', clearAll),
        ctx.events.on('actor.died', (e) => {
          if (e.actorId === playerId()) clearAll();
        }),
        ctx.systems.add({
          id: 'warden.act3.fixed',
          fixedPhase: 'afterCombat',
          order: 125,
          fixedUpdate() {
            if (chop.chopping && !learned(SKILL_IDS.skullsplitter)) chop.cancel();
            chop.tick();
            root.tick();
            hearth.tick();
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

export default wardenAct3Plugin;
