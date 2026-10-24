import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { StatusService } from '../../actors/status';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { CinderMark, DecoyFootprints, PhoenixRoll, type FoeView } from './skills.act3';
import type { StealthHooks } from './stealthSkills';
import { CINDER_MARK, CLASS_ID, SKILL } from './tuning';

type Loose = { get(name: string): unknown };
interface VerbsLike {
  readonly busy?: boolean;
  readonly staggered?: boolean;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; yaw?: number; scale?: number; attach?: THREE.Object3D },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
}

let cleanup: (() => void) | null = null;
const scratch = new THREE.Vector3();

/**
 * Ashblade tier 4 (Act 3, K11 PR 1): Cinder Mark, Decoy Footprints, Phoenix Roll. The tier 4 rows already exist in
 * `skills.ts` (no second registration); this wires their behaviour. Services of other threads (`abilities`, `status`,
 * `stealth`, `enemies.perception`, `lockOn`) are read loosely and at use, so a missing one is a refusal or a warning.
 */
const ashbladeAct3Plugin: GamePlugin = {
  id: 'ashblade-act3',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes'],
  setup(ctx: GameContext) {
    cleanup?.();
    const offs: Array<() => void> = [];
    const svc = <T>(name: string): T | undefined => (ctx.services as unknown as Loose).get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const playerId = () => ctx.actors.player.id;
    const learned = (id: string) => svc<{ learned(id: string): boolean }>('progression')?.learned(id) === true;
    const verbs = () => svc<VerbsLike>('combatVerbs');
    const controller = () => ctx.world.avatar?.controller as unknown as { currentAction?: string | null } | undefined;
    const vfx = () => svc<VfxLike>('vfx');

    const foeView = (id: string): FoeView | null => {
      const a = ctx.actors.get(id);
      if (!a || !a.root) return null;
      a.worldPosition(scratch);
      return {
        id: a.id,
        x: scratch.x,
        y: scratch.y,
        z: scratch.z,
        live: a.team === 'hostile' && !a.dead && a.hittable,
        mercy: a.mercyState?.(),
      };
    };
    function* foes(): Iterable<FoeView> {
      for (const a of ctx.actors.all()) {
        if (a.team !== 'hostile' || a.dead || !a.hittable || !a.root) continue;
        const v = foeView(a.id);
        if (v) yield v;
      }
    }

    const base = {
      playerId,
      isAshblade: () => svc<ClassesService>('classes')?.current() === CLASS_ID,
      learned,
      blockedReason: (): string | null => {
        if (ctx.actors.player.dead) return 'dead';
        if (verbs()?.staggered) return 'staggered';
        if (verbs()?.busy || controller()?.currentAction) return 'busy';
        return null;
      },
      now: () => ctx.clock.seconds,
      feet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
      facingYaw: () => ctx.player.facingYaw,
      effect: (id: string, at: { x: number; y: number; z: number }, yaw: number, attachTo: string | null, params: Record<string, number>) => {
        try {
          const attach = attachTo ? (ctx.actors.get(attachTo)?.root ?? undefined) : undefined;
          const h = vfx()?.spawnEffect?.(id, { position: attach ? { x: 0, y: 0, z: 0 } : { ...at }, yaw, attach }, params);
          return h && typeof h.stop === 'function' ? () => h.stop() : null;
        } catch {
          return null;
        }
      },
      reportTrigger: (id: string) => void svc<{ reportTrigger?(id: string): boolean }>('abilities')?.reportTrigger?.(id),
    };

    const mark = new CinderMark({
      ...base,
      lockTarget: () => svc<{ targetId: string | null }>('lockOn')?.targetId ?? null,
      foe: foeView,
      foes,
    });
    const decoy = new DecoyFootprints({
      ...base,
      stealth: () => svc<StealthHooks>('stealth'),
      perception: () => svc<{ perception?: never }>('enemies')?.perception,
      warn,
    });
    const phoenix = new PhoenixRoll({
      ...base,
      statuses: (id) => svc<StatusService>('status')?.list(id) ?? [],
      clearStatus: (id, statusId) => svc<StatusService>('status')?.clear(id, statusId),
      dodging: () => controller()?.currentAction === 'dodge',
      foes,
      foe: foeView,
      apply: (req) => ctx.damage.apply(req),
      ignite: (id, spec) => svc<StatusService>('status')?.apply(id, spec) ?? false,
    });

    offs.push(ctx.damage.addModifier(CINDER_MARK.modifierId, mark.modifier, CINDER_MARK.order));
    const resetAll = (): void => {
      mark.end();
      decoy.end();
      phoenix.reset();
    };
    offs.push(
      resetAll,
      ctx.events.on('save.loaded', resetAll),
      ctx.events.on('class.changed', resetAll),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === playerId()) resetAll();
        else mark.onGone(e.actorId);
      }),
      ctx.events.on('actor.despawned', (e) => mark.onGone(e.actorId)),
      ctx.events.on('ai.calm', (e) => mark.onGone(e.actorId)),
    );

    // The abilities service may appear after this plugin (it is read loosely), so binding is retried twice a second.
    const bound = new Set<string>();
    const bind = (): void => {
      const abilities = svc<{ registerHandler(id: string, h: () => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?(): void } }>('abilities');
      if (!abilities) return;
      const handlers: Array<[string, () => { ok: true } | { ok: false; reason: string }]> = [
        [SKILL.cinderMark, () => mark.cast()],
        [SKILL.decoyFootprints, () => decoy.cast()],
      ];
      for (const [id, fn] of handlers) {
        if (bound.has(id)) continue;
        bound.add(id);
        const r = abilities.registerHandler(id, fn);
        if (r.ok && r.dispose) offs.push(() => r.dispose?.());
        else if (!r.ok) warn(`ashblade: the ${id} handler is already registered`);
      }
    };
    bind();
    offs.push(
      ctx.systems.add({
        id: 'ashblade.act3.fixed',
        fixedPhase: 'afterCombat',
        order: 126,
        fixedUpdate() {
          if (ctx.clock.tick % 30 === 0) bind();
          mark.update();
          decoy.update();
          phoenix.update();
        },
      }),
    );

    cleanup = () => {
      cleanup = null;
      for (const off of offs.splice(0).reverse()) off();
    };
  },
  dispose() {
    cleanup?.();
  },
};

export default ashbladeAct3Plugin;
