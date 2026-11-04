import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { StatusService } from '../../actors/status';
import { FIXED_TIMESTEP } from '../../config/constants';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { GolemBody } from '../../enemies/golem/GolemBody';
import { GOLEM_DIMS } from '../../enemies/golem/params';
import { BreathOfTheKeepers, ColossusOfSlag, NovaYieldFloor, SunfireNova, colossusNoKill, type AllyView, type ColossusBody } from './capstones';
import type { FoeView } from './skills.act3';
import { CAPSTONE_SKILL, COLOSSUS, KEEPERS_BREATH, SUNFIRE_NOVA } from './tuning';

type Loose = { get(name: string): unknown };
interface VerbsLike {
  readonly busy?: boolean;
  readonly staggered?: boolean;
}
interface ControllerLike {
  readonly currentAction?: string | null;
  readonly state?: string;
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; yaw?: number; scale?: number; attach?: THREE.Object3D },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
  shake?(amplitude: number, seconds: number): void;
  pulseScreen?(strength: number, seconds: number, color?: number): void;
}

let cleanup: (() => void) | null = null;
const scratch = new THREE.Vector3();

/**
 * Emberwright tier 5 capstones (Act 3, K11 PR 4): Sunfire Nova, Colossus of Slag, Breath of the Keepers. The tier 5 rows already
 * exist in `skills.ts` (no second registration); this wires their behaviour in `capstones.ts` to the services, as the Ashblade and
 * Warden capstone plugins do. Services of other threads (`abilities`, `status`, `vfx`, `allyEngagement`, `enemies`) are read loosely
 * and at use, so a missing one is a refusal or a no-op, not a crash.
 *
 * The golem's no-kill floor is a lethal handler at `Number.MIN_SAFE_INTEGER + 1` (right after the core's ally floor, as the
 * companions'), keyed to any actor whose id starts with `colossus:`. Not done from design 11.5: the golem's heat haze is a stand-in
 * (translucent drifting cards, effect `colossus-slag`), and the Nova's bloom boost has no helper (the flash is a screen pulse).
 */
const emberwrightCapstonesPlugin: GamePlugin = {
  id: 'emberwright-capstones',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes', 'emberwright', 'emberwright-act3'],
  setup(ctx: GameContext) {
    cleanup?.();
    const offs: Array<() => void> = [];
    const svc = <T>(name: string): T | undefined => (ctx.services as unknown as Loose).get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const playerId = () => ctx.actors.player.id;
    const learned = (id: string) => svc<{ learned(id: string): boolean }>('progression')?.learned(id) === true;
    const verbs = () => svc<VerbsLike>('combatVerbs');
    const controller = () => ctx.world.avatar?.controller as unknown as ControllerLike | undefined;
    const vfx = () => svc<VfxLike>('vfx');
    const status = () => svc<StatusService>('status');

    const foeView = (id: string): FoeView | null => {
      const a = ctx.actors.get(id);
      if (!a || !a.root) return null;
      a.worldPosition(scratch);
      return { id: a.id, x: scratch.x, y: scratch.y, z: scratch.z, live: a.team === 'hostile' && !a.dead && a.hittable, mercy: a.mercyState?.() };
    };
    function* foes(): Iterable<FoeView> {
      for (const a of ctx.actors.all()) {
        if (a.team !== 'hostile' || a.dead || !a.hittable || !a.root) continue;
        const v = foeView(a.id);
        if (v) yield v;
      }
    }
    function* allies(): Iterable<AllyView> {
      for (const a of ctx.actors.all()) {
        if (a.team !== 'ally' || a.dead || !a.root) continue;
        a.worldPosition(scratch);
        yield { id: a.id, x: scratch.x, y: scratch.y, z: scratch.z };
      }
    }

    const base = {
      playerId,
      isEmberwright: () => svc<ClassesService>('classes')?.current() === 'emberwright',
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
    const fx = {
      shake: (amplitude: number, seconds: number) => vfx()?.shake?.(amplitude, seconds),
      pulse: (strength: number, seconds: number, color: number) => vfx()?.pulseScreen?.(strength, seconds, color),
    };
    const igniteIo = {
      foe: foeView,
      ignite: (id: string, spec: Parameters<StatusService['apply']>[1]) => status()?.apply(id, spec) ?? false,
      statuses: (id: string) => status()?.list(id) ?? [],
    };
    /**
     * A charge or a channel is broken by death, a stagger, a dodge, a block or another action. A flinch (a light hit, which real
     * fights deal constantly) is ridden out, so the controller's action is read first. The cast clip is a one-shot (state 'oneShot'),
     * so `verbs.busy` cannot be used; an attack (state 'attack') is the other action.
     */
    const interrupted = (): boolean => {
      if (ctx.actors.player.dead || verbs()?.staggered === true) return true;
      const c = controller();
      const action = c?.currentAction ?? null;
      if (action === 'flinch') return false;
      return action !== null || c?.state === 'attack';
    };
    const lockMove = (source: string) => () => ctx.player.addMoveModifier(source, { lockMove: true });
    const playClip = (clip: string) => void controller()?.playOneShot?.(clip, { lockMove: false });
    const refund = (n: number) => void svc<{ restoreEmber?(n: number): number }>('spells')?.restoreEmber?.(n);

    // The closest fixed collider on a ray (a moving body in the way is stepped past), the player's own collider ignored.
    const staticHit = (origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number): { distance: number } | null => {
      let start = origin;
      let left = max;
      let travelled = 0;
      for (let i = 0; i < 6 && left > 0; i++) {
        const hit = ctx.physics.raycast(start, dir, left, ctx.world.player.controller.collider);
        if (!hit) return null;
        if (hit.collider.parent()?.isFixed() ?? true) return { distance: travelled + hit.distance };
        const adv = hit.distance + 0.05;
        start = { x: start.x + dir.x * adv, y: start.y + dir.y * adv, z: start.z + dir.z * adv };
        left -= adv;
        travelled += adv;
      }
      return null;
    };
    const blocked = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean => {
      const dir = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
      const dist = Math.hypot(dir.x, dir.y, dir.z);
      if (dist < 1e-6) return false;
      const hit = staticHit(from, { x: dir.x / dist, y: dir.y / dist, z: dir.z / dist }, dist);
      return !!hit && hit.distance < dist - 0.3;
    };
    const groundY = (x: number, z: number, fromY: number): number | null => {
      const hit = staticHit({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, COLOSSUS.groundProbeAbove + 8);
      return hit ? fromY - hit.distance : null;
    };

    try {
      const nova = new SunfireNova({
        ...base,
        ...igniteIo,
        foes,
        apply: (req) => ctx.damage.apply(req),
        blocked,
        interrupted,
        lockMove: lockMove(SUNFIRE_NOVA.moveSource),
        playClip,
        refund,
        fx,
      });
      const breath = new BreathOfTheKeepers({
        ...base,
        ...igniteIo,
        foes,
        allies,
        apply: (req) => ctx.damage.apply(req),
        heal: (id, fraction) => {
          const a = ctx.actors.get(id);
          return a && !a.dead ? ctx.damage.heal(id, a.maxHealth * fraction) : 0;
        },
        blocked,
        interrupted,
        lockMove: lockMove(KEEPERS_BREATH.moveSource),
        fx,
      });
      const colossus = new ColossusOfSlag({
        ...base,
        foe: foeView,
        foes,
        groundY,
        taken: (id) => !!ctx.actors.get(id),
        stillThere: (id, body) => ctx.actors.get(id) === (body.actor as unknown),
        mayEngage: (id) => svc<{ mayEngage(id: string): boolean }>('allyEngagement')?.mayEngage(id) ?? false,
        apply: (req) => ctx.damage.apply(req),
        spawn: (id, at): ColossusBody | null => {
          const golem = new GolemBody({ scale: COLOSSUS.scale }, { warn });
          const root = golem.root;
          root.position.set(at.x, at.y - GOLEM_DIMS.height * COLOSSUS.scale, at.z);
          golem.setTelegraph(COLOSSUS.veinGlow, COLOSSUS.veinColor);
          golem.play('Idle', { loop: true });
          const free = (): void => {
            ctx.scene.remove(root);
            golem.dispose();
          };
          ctx.scene.add(root);
          let stopSlag: (() => void) | null = null;
          try {
            const actor = ctx.actors.spawn({ id, kind: COLOSSUS.kind, team: 'ally', maxHealth: COLOSSUS.health, hittable: false, untargetable: true, root });
            // A taunter while it lives, like the Iron Familiar: nearby enemies target it for `tauntSeconds` (enemies/taunts.ts).
            const untaunt = svc<{ taunts?: { register(s: unknown): () => void } }>('enemies')?.taunts?.register({
              id, radius: COLOSSUS.tauntRadius, seconds: COLOSSUS.tauntSeconds,
              position: () => (root.parent ? root.position : null),
              alive: () => !actor.dead,
            });
            const slag = vfx()?.spawnEffect?.(COLOSSUS.slagEffect, { position: { x: 0, y: 0, z: 0 }, attach: root }, { seconds: COLOSSUS.seconds, scale: COLOSSUS.scale });
            stopSlag = slag && typeof slag.stop === 'function' ? () => slag.stop() : null;
            let clip = 'Idle';
            return {
              actor: actor as never,
              place: (x, y, z, yaw, rise) => {
                root.position.set(x, y - (1 - rise) * GOLEM_DIMS.height * COLOSSUS.scale, z);
                root.rotation.y = yaw;
              },
              play: (c) => {
                if (c === clip) return;
                clip = c;
                golem.play(c, { loop: c !== 'Slam' });
              },
              step: (dt, speed) => {
                golem.setSpeed(speed);
                golem.fixedUpdate(dt);
              },
              dispose: () => {
                stopSlag?.();
                untaunt?.();
                ctx.actors.despawn(id);
                free();
              },
            };
          } catch (err) {
            stopSlag?.();
            free();
            console.warn('[emberwright] colossus spawn failed', err);
            return null;
          }
        },
      });

      // The Nova's mercy floor (order 98, as the Pathfinder capstones'): the ring never takes a foe that can yield from alive to dead.
      const novaFloor = new NovaYieldFloor({
        playerId,
        canYield: (actorId) => {
          const enemies = svc<{ mercyUnlocked?(v: 'spare'): boolean; ground?: { get?(id: string): { def?: { mercy?: { when?: string } } } | undefined } }>('enemies');
          if (typeof enemies?.mercyUnlocked !== 'function' || enemies.mercyUnlocked('spare') !== true) return false;
          return enemies.ground?.get?.(actorId)?.def?.mercy?.when === 'yielding';
        },
      });
      offs.push(ctx.damage.addModifier(SUNFIRE_NOVA.yieldFloorId, novaFloor.modify, SUNFIRE_NOVA.yieldFloorOrder));

      // The golem's no-kill floor: right after the core's ally floor (and the companions'), before anything that spends a resource.
      offs.push(
        ctx.damage.addLethalHandler(
          COLOSSUS.noKillId,
          colossusNoKill((attackerId) => typeof attackerId === 'string' && attackerId.startsWith(COLOSSUS.idPrefix)),
          Number.MIN_SAFE_INTEGER + 1,
        ),
      );

      const resetAll = (): void => {
        nova.end();
        breath.end();
        colossus.end();
      };
      offs.push(
        resetAll,
        ctx.events.on('save.loaded', resetAll),
        ctx.events.on('class.changed', resetAll),
        ctx.events.on('ability.used', (e) => breath.onSkillUsed(e.skillId)),
        ctx.events.on('spell.cast', (e) => {
          if (e.casterId === playerId()) breath.onSpellCast();
        }),
        ctx.events.on('actor.died', (e) => {
          if (e.actorId === playerId()) resetAll();
        }),
      );

      // The abilities service may appear after this plugin (it is read loosely), so binding is retried twice a second.
      const bound = new Set<string>();
      const bind = (): void => {
        const abilities = svc<{ registerHandler(id: string, h: () => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?(): void } }>('abilities');
        if (!abilities) return;
        const handlers: Array<[string, () => { ok: true } | { ok: false; reason: string }]> = [
          [CAPSTONE_SKILL.sunfireNova, () => nova.cast()],
          [CAPSTONE_SKILL.colossusOfSlag, () => colossus.cast()],
          [CAPSTONE_SKILL.breathOfTheKeepers, () => breath.cast()],
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
          id: 'emberwright.capstones.fixed',
          fixedPhase: 'afterCombat',
          order: 128,
          fixedUpdate() {
            if (ctx.clock.tick % 30 === 0) bind();
            nova.update(FIXED_TIMESTEP);
            breath.update(FIXED_TIMESTEP);
            colossus.update(FIXED_TIMESTEP);
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

export default emberwrightCapstonesPlugin;
