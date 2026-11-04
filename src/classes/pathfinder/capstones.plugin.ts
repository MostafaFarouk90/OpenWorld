import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { StatusService } from '../../actors/status';
import { FIXED_TIMESTEP } from '../../config/constants';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { DragonbaneBolt, HuntersWeb, SkyhawkStrike, YieldFloor } from './capstones';
import type { PathfinderService } from './pathfinder.plugin';
import type { FoeView } from './skills.act3';
import { KestrelDive } from './SceneFx';
import { terrainBlocked } from './tier3';
import { PF } from './tuning';

type Loose = { get(name: string): unknown };
interface VerbsLike {
  readonly busy?: boolean;
  readonly staggered?: boolean;
  addInvulnerability?(source: string, seconds: number): () => void;
}
interface ControllerLike {
  readonly currentAction?: string | null;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; yaw?: number; scale?: number; attach?: THREE.Object3D },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
  shake?(amplitude: number, seconds: number): void;
}

let cleanup: (() => void) | null = null;
const scratch = new THREE.Vector3();

/**
 * Pathfinder tier 5 capstones (Act 3, K11 PR 4): Dragonbane Bolt, Hunter's Web, Skyhawk Strike. The tier 5 rows already exist in
 * `skills.ts` (no second registration); this wires their behaviour. Services of other threads are read loosely and at use, so a
 * missing one is a refusal or a warning. The bolt flies through `pathfinder.launchBolt` (the Pathfinder plugin owns the projectile
 * system and the ammo), so this plugin depends on it.
 *
 * Modifier: `pathfinder.capstones.yieldFloor` at order 98 (buffs band, last word before Ashblade's 99): a capstone hit never kills
 * a foe that can yield, it leaves 1 HP so the poise break reaches the Brain's yield rule.
 *
 * Not done from design 11.5: the screen tint and bloom (no helper), so the Web and the Bolt rely on shakes and rings. Hit-stop only
 * when `ctx.clock.hitStop` exists (it does not today, so the Bolt's 100 ms hit-stop is dormant).
 */
const pathfinderCapstonesPlugin: GamePlugin = {
  id: 'pathfinder-capstones',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes', 'pathfinder', 'pathfinder-act3'],
  setup(ctx: GameContext) {
    cleanup?.();
    const offs: Array<() => void> = [];
    try {
      const svc = <T>(name: string): T | undefined => (ctx.services as unknown as Loose).get(name) as T | undefined;
      const warn = (m: string) => console.warn(m);
      const playerId = () => ctx.actors.player.id;
      const learned = (id: string) => svc<{ learned(id: string): boolean }>('progression')?.learned(id) === true;
      const verbs = () => svc<VerbsLike>('combatVerbs');
      const controller = () => ctx.world.avatar?.controller as unknown as ControllerLike | undefined;
      const vfx = () => svc<VfxLike>('vfx');
      const interiors = () => svc<{ interiorAt(p: unknown): string | null }>('interiors');
      const containment = () => svc<{ isOpen(x: number, z: number): boolean; clamp<T extends { x: number; z: number }>(at: T): T }>('containment');
      const status = () => svc<StatusService>('status');

      const isBoss = (actorId: string): boolean => {
        const bosses = ctx.bosses;
        if (!bosses?.active) return false;
        for (const b of bosses.active()) if (bosses.state(b)?.actorId === actorId) return true;
        return false;
      };
      function* foes(): Iterable<FoeView> {
        for (const a of ctx.actors.all()) {
          if (a.team !== 'hostile' || a.dead || !a.hittable || !a.root) continue;
          a.worldPosition(scratch);
          yield { id: a.id, x: scratch.x, y: scratch.y, z: scratch.z, live: true, mercy: a.mercyState?.(), boss: isBoss(a.id) };
        }
      }
      const mercyOf = (id: string): string | undefined => ctx.actors.get(id)?.mercyState?.();

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
      const raycast = (origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number) => {
        const hit = ctx.physics.raycast(origin, dir, max, ctx.world.player.controller.collider);
        return hit ? { distance: hit.distance, point: hit.point } : null;
      };

      // One segment of the leap's arc: fixed colliders only (a moving body in the way is stepped past), the player's own collider ignored.
      const arcBlocked = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-6) return false;
        const dir = { x: dx / len, y: dy / len, z: dz / len };
        let start = from;
        let left = len;
        for (let i = 0; i < 6 && left > 0; i++) {
          const hit = ctx.physics.raycast(start, dir, left, ctx.world.player.controller.collider);
          if (!hit) return false;
          if (hit.collider.parent()?.isFixed() ?? true) return true;
          const adv = hit.distance + 0.05;
          start = { x: start.x + dir.x * adv, y: start.y + dir.y * adv, z: start.z + dir.z * adv };
          left -= adv;
        }
        return false;
      };

      // ---- Yield floor (shared by the three)
      const yieldFloor = new YieldFloor({
        playerId,
        canYield: (actorId) => {
          const enemies = svc<{ mercyUnlocked?(v: 'spare'): boolean; ground?: { get?(id: string): { def?: { mercy?: { when?: string } } } | undefined } }>('enemies');
          if (typeof enemies?.mercyUnlocked !== 'function' || enemies.mercyUnlocked('spare') !== true) return false;
          return enemies.ground?.get?.(actorId)?.def?.mercy?.when === 'yielding';
        },
      });
      offs.push(ctx.damage.addModifier(PF.yieldFloor.modifierId, yieldFloor.modify, PF.yieldFloor.order));

      // ---- Dragonbane Bolt
      const muzzle = (): { x: number; y: number; z: number } => {
        const f = ctx.player.feet;
        const tip = ctx.player.avatar?.weaponTip;
        if (tip) {
          tip.updateWorldMatrix(true, false);
          const p = tip.getWorldPosition(new THREE.Vector3());
          // The weapon tip when it sits at a shooting height near her (a tip at her feet or off the model, as a weaponless rig has, would put the bolt in the ground).
          if (Number.isFinite(p.y) && p.y >= f.y + 0.6 && p.y <= f.y + 2.4 && Math.hypot(p.x - f.x, p.z - f.z) < 2) return { x: p.x, y: p.y, z: p.z };
        }
        return { x: f.x, y: f.y + 1.3, z: f.z };
      };
      const dragonbane = new DragonbaneBolt({
        ...base,
        muzzle,
        // The lock-on target's chest, else the way the player faces.
        aim: (from) => {
          const lockId = svc<{ targetId: string | null }>('lockOn')?.targetId ?? null;
          const target = lockId ? ctx.actors.get(lockId) : undefined;
          if (target && !target.dead) {
            const p = target.worldPosition(new THREE.Vector3());
            const d = new THREE.Vector3(p.x - from.x, p.y + 1.1 - from.y, p.z - from.z);
            if (d.lengthSq() > 1e-4) return d.normalize();
          }
          const yaw = ctx.player.facingYaw;
          return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
        },
        launch: (spec) => svc<PathfinderService>('pathfinder')?.launchBolt?.(spec) ?? null,
        mercy: mercyOf,
        apply: (req) => ctx.damage.apply(req),
        shake: (amplitude, seconds) => vfx()?.shake?.(amplitude, seconds),
        hitStop: (seconds) => (ctx.clock as unknown as { hitStop?(s: number): void }).hitStop?.(seconds),
      });

      // ---- Hunter's Web
      const web = new HuntersWeb({
        ...base,
        foes,
        status: (id, spec) => status()?.apply(id, spec) ?? false,
        apply: (req) => ctx.damage.apply(req),
        shake: (amplitude, seconds) => vfx()?.shake?.(amplitude, seconds),
      });

      // ---- Skyhawk Strike
      const kestrel = new KestrelDive(ctx.scene);
      const skyhawk = new SkyhawkStrike({
        ...base,
        foes,
        lockTarget: () => svc<{ targetId: string | null }>('lockOn')?.targetId ?? null,
        blocked: (from, to) => terrainBlocked(ctx.physics as never, ctx.world.player.controller.collider)(from, to),
        mode: () => svc<{ current?: string }>('movementMode')?.current ?? 'walk',
        mounted: () => svc<{ mounted?(): boolean }>('mount')?.mounted?.() === true,
        isOpen: (x, z) => containment()?.isOpen(x, z) ?? true,
        clamp: (at) => containment()?.clamp(at) ?? at,
        interiorAt: (p) => interiors()?.interiorAt(p) ?? null,
        raycast,
        arcBlocked,
        mercy: mercyOf,
        leap: (o) => ctx.player.leap(o),
        invulnerable: (seconds) => verbs()?.addInvulnerability?.(PF.skyhawk.invulnerableSource, seconds) ?? null,
        apply: (req) => ctx.damage.apply(req),
        status: (id, spec) => status()?.apply(id, spec) ?? false,
        isBoss,
        dive: (from, to, seconds) => {
          kestrel.start(from, to, seconds);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dz = to.z - from.z;
          const flat = Math.hypot(dx, dz);
          base.effect(PF.skyhawk.diveEffectId, from, Math.atan2(-dx, -dz), { length: Math.hypot(dx, dy, dz), pitch: Math.atan2(dy, flat), seconds });
        },
        clearDive: () => kestrel.clear(),
        carryEffect: (seconds) => {
          const attach = ctx.player.avatar?.root;
          try {
            const h = vfx()?.spawnEffect?.(PF.skyhawk.carryEffectId, { position: attach ? { x: 0, y: 0, z: 0 } : base.feet(), attach }, { seconds });
            return h && typeof h.stop === 'function' ? () => h.stop() : null;
          } catch {
            return null;
          }
        },
        warn,
      });

      const resetAll = (): void => {
        dragonbane.reset();
        web.end();
        skyhawk.reset();
      };
      offs.push(
        resetAll,
        () => kestrel.clear(),
        ctx.events.on('save.loaded', resetAll),
        ctx.events.on('class.changed', resetAll),
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
          [PF.skillIds.dragonbaneBolt, () => dragonbane.cast()],
          [PF.skillIds.huntersWeb, () => web.cast()],
          [PF.skillIds.skyhawkStrike, () => skyhawk.cast()],
        ];
        for (const [id, fn] of handlers) {
          if (bound.has(id)) continue;
          bound.add(id);
          const r = abilities.registerHandler(id, fn);
          if (r.ok && r.dispose) offs.push(() => r.dispose?.());
          else if (!r.ok) warn(`pathfinder: the ${id} handler is already registered`);
        }
      };
      bind();
      offs.push(
        ctx.systems.add({
          id: 'pathfinder.capstones.fixed',
          fixedPhase: 'afterCombat',
          order: 127,
          fixedUpdate() {
            if (ctx.clock.tick % 30 === 0) bind();
            web.update();
            skyhawk.update();
            kestrel.update(FIXED_TIMESTEP);
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

export default pathfinderCapstonesPlugin;
