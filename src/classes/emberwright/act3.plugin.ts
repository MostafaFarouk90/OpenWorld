import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { StatusService } from '../../actors/status';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { heightAt } from '../../terrain/heightfield';
import { CinderRain, TemperWeapon, Updraft, type CompanionView, type FoeView } from './skills.act3';
import { SKILL } from './skills';
import { CLASS_ID, IRON_FAMILIAR, TEMPER_WEAPON } from './tuning';

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
interface CompanionsLike {
  active(): string[];
  actorId(id: string): string | null;
}
interface BossesLike {
  active(): string[];
  state(bossId: string): { actorId: string } | null;
}

let cleanup: (() => void) | null = null;
const scratch = new THREE.Vector3();

/**
 * Emberwright tier 4 (Act 3, K11 PR 2): Cinder Rain, Temper Weapon, Updraft. The tier 4 rows already exist in `skills.ts` (no second
 * registration); this wires their behaviour. Services of other threads (`abilities`, `status`, `lockOn`, `companions`) are read
 * loosely and at use, so a missing one is a refusal or a no-op, not a crash.
 */
const emberwrightAct3Plugin: GamePlugin = {
  id: 'emberwright-act3',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes', 'emberwright'],
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
    const status = () => svc<StatusService>('status');

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
    const isFamiliar = (a: { id: string; kind: string }): boolean => a.kind === IRON_FAMILIAR.kind || a.id.startsWith(IRON_FAMILIAR.idPrefix);
    function* companions(): Iterable<CompanionView> {
      for (const a of ctx.actors.all()) {
        if (a.team !== 'ally' || a.dead || a.id === playerId() || isFamiliar(a) || !a.root) continue;
        a.worldPosition(scratch);
        yield { id: a.id, x: scratch.x, y: scratch.y, z: scratch.z };
      }
    }
    /** Alive, an ally, and (when the companions service is there) still in the active party. */
    const companionHere = (id: string): boolean => {
      const a = ctx.actors.get(id);
      if (!a || a.dead || a.team !== 'ally') return false;
      const c = svc<CompanionsLike>('companions');
      return c ? c.active().some((cid) => c.actorId(cid) === id) : true;
    };
    const isBoss = (actorId: string): boolean => {
      const b = ctx.bosses as unknown as BossesLike | undefined;
      if (!b || typeof b.active !== 'function') return false;
      for (const bossId of b.active()) if (b.state(bossId)?.actorId === actorId) return true;
      return false;
    };

    const base = {
      playerId,
      isEmberwright: () => svc<ClassesService>('classes')?.current() === CLASS_ID,
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
          // `attach` ADDS the offset to the root's world position, so an attached effect gets {0,0,0}.
          const attach = attachTo ? (ctx.actors.get(attachTo)?.root ?? undefined) : undefined;
          const where = attachTo && !attach ? { x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z } : attach ? { x: 0, y: 0, z: 0 } : { ...at };
          const h = vfx()?.spawnEffect?.(id, { position: where, yaw, attach }, params);
          return h && typeof h.stop === 'function' ? () => h.stop() : null;
        } catch {
          return null;
        }
      },
      reportTrigger: (id: string) => void svc<{ reportTrigger?(id: string): boolean }>('abilities')?.reportTrigger?.(id),
    };

    const rain = new CinderRain({
      ...base,
      lockTarget: () => svc<{ targetId: string | null }>('lockOn')?.targetId ?? null,
      foe: foeView,
      foes,
      heightAt,
      apply: (req) => ctx.damage.apply(req),
      ignite: (id, spec) => status()?.apply(id, spec) ?? false,
    });
    const temper = new TemperWeapon({
      ...base,
      companions,
      companionHere,
      foe: foeView,
      statuses: (id) => status()?.list(id) ?? [],
      ignite: (id, spec) => status()?.apply(id, spec) ?? false,
    });
    const updraft = new Updraft({
      ...base,
      foes,
      apply: (req) => ctx.damage.apply(req),
      stun: (id, spec) => status()?.apply(id, spec) ?? false,
      isBoss,
    });

    offs.push(ctx.damage.addModifier(TEMPER_WEAPON.modifierId, temper.modifier, TEMPER_WEAPON.order));
    const resetAll = (): void => {
      rain.end();
      temper.end();
    };
    offs.push(
      resetAll,
      ctx.events.on('save.loaded', resetAll),
      ctx.events.on('class.changed', resetAll),
      ctx.events.on('damage.dealt', (r) => temper.onDealt(r)),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === playerId()) resetAll();
        else temper.onGone(e.actorId);
      }),
      ctx.events.on('actor.despawned', (e) => temper.onGone(e.actorId)),
      ctx.events.on('companion.left', (e) => temper.onGone(e.actorId)),
      ctx.events.on('party.changed', () => temper.update()),
    );

    // The abilities service may appear after this plugin (it is read loosely), so binding is retried twice a second.
    const bound = new Set<string>();
    const bind = (): void => {
      const abilities = svc<{ registerHandler(id: string, h: () => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?(): void } }>('abilities');
      if (!abilities) return;
      const handlers: Array<[string, () => { ok: true } | { ok: false; reason: string }]> = [
        [SKILL.cinderRain, () => rain.cast()],
        [SKILL.temperWeapon, () => temper.cast()],
        [SKILL.updraft, () => updraft.cast()],
      ];
      for (const [id, fn] of handlers) {
        if (bound.has(id)) continue;
        bound.add(id);
        const r = abilities.registerHandler(id, fn);
        if (r.ok && r.dispose) offs.push(() => r.dispose?.());
        else if (!r.ok) warn(`emberwright: the ${id} handler is already registered`);
      }
    };
    bind();
    offs.push(
      ctx.systems.add({
        id: 'emberwright.act3.fixed',
        fixedPhase: 'afterCombat',
        order: 127,
        fixedUpdate() {
          if (ctx.clock.tick % 30 === 0) bind();
          rain.update();
          temper.update();
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

export default emberwrightAct3Plugin;
