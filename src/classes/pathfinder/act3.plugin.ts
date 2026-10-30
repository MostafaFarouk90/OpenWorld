import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { StatusService } from '../../actors/status';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import { heightAt } from '../../terrain/heightfield';
import { CaltropField, SureFoot, TripleShot, type FoeView } from './skills.act3';
import { PF } from './tuning';

type Loose = { get(name: string): unknown };
interface VerbsLike {
  readonly busy?: boolean;
  readonly staggered?: boolean;
  addKnockbackFilter?(id: string, keep: (r: { kind: 'stagger' | 'break'; knockback: number }) => boolean): () => void;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; yaw?: number; scale?: number; attach?: THREE.Object3D },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
}
interface PathfinderLike {
  addSpread?(id: string, fn: (i: number, o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }) => readonly { yawDeg: number; scale: number }[] | null): () => void;
}

let cleanup: (() => void) | null = null;
const scratch = new THREE.Vector3();

/**
 * Pathfinder tier 4 (Act 3, K11 PR 2): Triple Shot, Caltrop Field, Sure Foot. The tier 4 rows already exist in `skills.ts` (no
 * second registration); this wires their behaviour. Triple Shot rides the Crossbow's `spread` port (through the `pathfinder`
 * service's `addSpread`) and Sure Foot the `combatVerbs` knockback filter; both are added when the services are there and
 * removed on dispose. Other threads' services are read loosely and at use.
 */
const pathfinderAct3Plugin: GamePlugin = {
  id: 'pathfinder-act3',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes', 'pathfinder'],
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

    /** A registered boss actor: the boss registry's ids, mapped to their actors (as `EnemyManager.isBoss` reads it). */
    const bossActors = (): Set<string> => {
      const out = new Set<string>();
      for (const b of ctx.bosses.active()) {
        const id = ctx.bosses.state(b)?.actorId;
        if (id) out.add(id);
      }
      return out;
    };
    function* foes(): Iterable<FoeView> {
      const bosses = bossActors();
      for (const a of ctx.actors.all()) {
        if (a.team !== 'hostile' || a.dead || !a.hittable || !a.root) continue;
        a.worldPosition(scratch);
        yield { id: a.id, x: scratch.x, y: scratch.y, z: scratch.z, live: true, mercy: a.mercyState?.(), boss: bosses.has(a.id) };
      }
    }

    const base = {
      playerId,
      isPathfinder: () => svc<ClassesService>('classes')?.current() === PF.classId,
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
      effect: (id: string, at: { x: number; y: number; z: number }, yaw: number, params: Record<string, number>) => {
        try {
          const h = vfx()?.spawnEffect?.(id, { position: { ...at }, yaw }, params);
          return h && typeof h.stop === 'function' ? () => h.stop() : null;
        } catch {
          return null;
        }
      },
      reportTrigger: (id: string) => void svc<{ reportTrigger?(id: string): boolean }>('abilities')?.reportTrigger?.(id),
    };

    const triple = new TripleShot(base);
    const field = new CaltropField({
      ...base,
      foes,
      slow: (id, spec) => svc<StatusService>('status')?.apply(id, spec) ?? false,
      heightAt: (x, z) => heightAt(x, z),
    });
    const sure = new SureFoot({
      ...base,
      moving: () => ctx.player.moving,
      mode: () => svc<{ current?: string }>('movementMode')?.current ?? 'walk',
    });

    const resetAll = (): void => field.end();
    offs.push(
      resetAll,
      ctx.events.on('save.loaded', resetAll),
      ctx.events.on('class.changed', resetAll),
      ctx.events.on('actor.died', (e) => void (e.actorId === playerId() && resetAll())),
    );

    // Services that may appear after this plugin (read loosely) are bound twice a second until they are there.
    let offSpread: (() => void) | null = null;
    let offFilter: (() => void) | null = null;
    let spreadHost: PathfinderLike | undefined;
    let filterHost: VerbsLike | undefined;
    const bound = new Set<string>();
    const bind = (): void => {
      // A service object replaced by a reload (its plugin set up again) loses our registration, so it is bound again.
      const pf = svc<PathfinderLike>('pathfinder');
      if (pf !== spreadHost) {
        offSpread?.();
        offSpread = null;
        spreadHost = pf;
        if (pf?.addSpread) offSpread = pf.addSpread(PF.skillIds.tripleShot, triple.spread);
      }
      const v = verbs();
      if (v !== filterHost) {
        offFilter?.();
        offFilter = null;
        filterHost = v;
        if (v?.addKnockbackFilter) offFilter = v.addKnockbackFilter(PF.sureFoot.filterId, sure.keep);
      }
      const abilities = svc<{ registerHandler(id: string, h: () => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?(): void } }>('abilities');
      if (abilities && !bound.has(PF.skillIds.caltropField)) {
        bound.add(PF.skillIds.caltropField);
        const r = abilities.registerHandler(PF.skillIds.caltropField, () => field.cast());
        if (r.ok && r.dispose) offs.push(() => r.dispose?.());
        else if (!r.ok) warn(`pathfinder: the ${PF.skillIds.caltropField} handler is already registered`);
      }
    };
    bind();
    offs.push(
      () => {
        offSpread?.();
        offFilter?.();
        offSpread = offFilter = null;
      },
      ctx.systems.add({
        id: 'pathfinder.act3.fixed',
        fixedPhase: 'afterCombat',
        order: 127,
        fixedUpdate() {
          if (ctx.clock.tick % 30 === 0) bind();
          field.update();
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

export default pathfinderAct3Plugin;
