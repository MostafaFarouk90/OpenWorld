import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { looseService } from '../../vfx/ports';
import { KNIGHT_ACT3_STRINGS_EN } from './strings.en';
import { BastionWall, ExecutionersArc, HearthfireWard } from './skills.act3';
import { BASTION_WALL, EXECUTIONERS_ARC, HEARTHFIRE_WARD, SKILL_IDS } from './tuning';

declare module '../../core/events' {
  interface GameEventMap {
    /** The planted banner's 3 s pulse (spells.plugin): its position and aura radius. Hearthfire Ward heals on it. */
    'banner.pulse': { position: { x: number; y: number; z: number }; radius: number };
  }
}

type Loose = { get(name: string): unknown };
interface ControllerLike {
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  readonly currentAction?: string | null;
}
interface VerbsLike {
  readonly busy: boolean;
  readonly staggered: boolean;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; scale?: number; yaw?: number; attach?: unknown },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
  shake?(amplitude: number, seconds: number): void;
}

let cleanup: (() => void) | null = null;

/**
 * Knight tier 4 (Act 3, K11): Bastion Wall, Executioner's Arc and Hearthfire Ward. The Knight plays with a null class before M07, so
 * every handler accepts null or 'knight'. The rows themselves (and the master-book gate) are in progression/skills.ts.
 */
const knightAct3Plugin: GamePlugin = {
  id: 'knight-act3',
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
    const trigger = (id: string) => svc<{ reportTrigger?(id: string): void }>('abilities')?.reportTrigger?.(id);

    try {
      const strings = ctx.strings.register('en', KNIGHT_ACT3_STRINGS_EN, { override: true });
      if (typeof strings === 'function') offs.push(strings);

      const blockedNow = (withBusy: boolean): string | null => {
        if (ctx.actors.player.dead) return 'dead';
        if (verbs()?.staggered) return 'staggered';
        if (withBusy && (verbs()?.busy || controller()?.currentAction)) return 'busy';
        return null;
      };

      // Bastion Wall. The guard (-50) emits player.guardBroken synchronously inside its modifier, before the wall (-45) runs.
      let guardBrokeTick = -1;
      offs.push(ctx.events.on('player.guardBroken', () => void (guardBrokeTick = ctx.clock.tick)));
      const wall = new BastionWall({
        now: () => ctx.clock.seconds,
        playerId,
        classId,
        learned: () => learnedId(SKILL_IDS.bastionWall),
        dead: () => ctx.actors.player.dead,
        feet: () => ctx.player.feet,
        facingYaw: () => ctx.player.facingYaw,
        blockHeld: () => ctx.input.actions.down('block'),
        // Raised while block is held, so the guard's own busy state must not refuse it.
        blockedReason: () => blockedNow(false),
        guardBrokeThisTick: () => guardBrokeTick === ctx.clock.tick,
        cone: () => {
          // With `attach` the preset adds the root's world position itself (effects/index.ts origin), so the offset is zero.
          const attach = ctx.player.avatar?.root;
          const h = vfx()?.spawnEffect?.(
            BASTION_WALL.fx,
            { position: attach ? { x: 0, y: 0, z: 0 } : ctx.player.feet, yaw: ctx.player.facingYaw, attach },
            { seconds: BASTION_WALL.seconds },
          );
          return {
            stop: () => h?.stop(),
            flicker: () => void vfx()?.spawnEffect?.(BASTION_WALL.fx, { position: ctx.player.feet, yaw: ctx.player.facingYaw }, { flicker: 1 }),
          };
        },
        reportTrigger: trigger,
        skillId: SKILL_IDS.bastionWall,
      });
      offs.push(() => wall.clear());
      offs.push(
        ctx.damage.addModifier(
          BASTION_WALL.modifierId,
          (req, target, attacker) => {
            const a = attacker ?? (req.attackerId ? ctx.actors.get(req.attackerId) : null);
            const pos = a ? a.worldPosition(new THREE.Vector3()) : null;
            return wall.cover(req as never, target as never, pos);
          },
          BASTION_WALL.modifierOrder,
        ),
      );

      // Executioner's Arc
      const arc = new ExecutionersArc(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          classId,
          learned: () => learnedId(SKILL_IDS.executionersArc),
          feet: () => ctx.player.feet,
          facingYaw: () => ctx.player.facingYaw,
          blockedReason: () => blockedNow(true),
          playClip: (clip) => controller()?.playOneShot?.(clip, { lockMove: true }) === true,
          interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || 
            // currentAction reads null during a playOneShot (AnimationController.currentAction hides the 'oneShot' kind), so any
            // non-null action (a flinch, stagger, block, dodge) means the chop clip was replaced.
            (controller()?.currentAction ?? null) !== null,
          reportTrigger: trigger,
          fx: (at, yaw) => {
            vfx()?.spawnEffect?.(EXECUTIONERS_ARC.fx, { position: at, yaw });
            vfx()?.shake?.(EXECUTIONERS_ARC.shakeAmplitude, EXECUTIONERS_ARC.shakeSeconds);
          },
          skillId: SKILL_IDS.executionersArc,
        },
        playerId,
      );
      offs.push(() => arc.cancel());

      // Hearthfire Ward
      const ward = new HearthfireWard({
        actors: ctx.actors as never,
        playerId,
        classId,
        learned: () => learnedId(SKILL_IDS.hearthfireWard),
        heal: (id, n) => ctx.damage.heal(id, n),
        fx: (banner, healed) => {
          vfx()?.spawnEffect?.(HEARTHFIRE_WARD.fx, { position: banner });
          for (const at of healed) vfx()?.spawnEffect?.(HEARTHFIRE_WARD.fx, { position: at }, { heart: 1 });
        },
      });

      const abilities = looseService(ctx.services, 'abilities');
      const reg = (id: string, fn: () => { ok: true } | { ok: false; reason: string }, label: string) => {
        const r = abilities?.registerHandler(id, fn);
        if (r?.ok) offs.push(r.dispose);
        else warn(`knight: ${label} handler not registered (${r ? r.reason : 'no abilities service'})`);
      };
      reg(SKILL_IDS.bastionWall, () => wall.cast(), 'Bastion Wall');
      reg(SKILL_IDS.executionersArc, () => arc.start(), "Executioner's Arc");

      const clearAll = () => {
        wall.clear();
        arc.cancel();
      };
      offs.push(
        ctx.events.on('banner.pulse', (e) => void ward.pulse(e.position, e.radius)),
        ctx.events.on('actor.died', (e) => {
          if (e.actorId === playerId()) clearAll();
        }),
        ctx.events.on('class.changed', clearAll),
        ctx.events.on('save.loaded', clearAll),
        ctx.systems.add({
          id: 'knight.act3.fixed',
          fixedPhase: 'afterCombat',
          order: 126,
          fixedUpdate() {
            if (arc.chopping && !learnedId(SKILL_IDS.executionersArc)) arc.cancel();
            wall.tick();
            arc.tick();
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

export default knightAct3Plugin;
