import * as THREE from 'three';
import type { DamageResult } from '../../actors/DamageResolver';
import type { StatusService } from '../../actors/status';
import type { PlayerAvatar } from '../../characters/PlayerAvatar';
import type { AnimationEvent } from '../../characters/AnimationEvents';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import { getItem } from '../../inventory/items';
import { sfxKey } from '../../music/sfxSynth';
import { SFX } from '../../music/sfxLayers';
import { registerClassSkills } from '../../progression/skills';
import { ProjectileSystem } from '../../spells/Projectile';
import { createProjectileHost } from '../../spells/projectileHost';
import type { Vec3 } from '../../vfx/ports';
import type { VfxService } from '../../vfx/types';
import { DEFAULT_KITS } from '../kits';
import '../types';
import { Ammo } from './Ammo';
import { Crossbow } from './Crossbow';
import { Marks } from './Marks';
import { SceneFx } from './SceneFx';
import { createPathfinderSurge } from './Surge';
import { Traps } from './Traps';
import { LightStep, NetLauncher, emberQuarrelHandler } from './tier3';
import { buildPathfinderSkills } from './skills';
import { PATHFINDER_STRINGS_EN } from './strings.en';
import { PATHFINDER_ATTACKS, PATHFINDER_HEAVY_INDEX, PF } from './tuning';

/** Fixed-phase order inside the `rules` band reserved for classes (500..549); thread 12 holds 510. */
const ORDER = 520;
const TRIPWIRE_SEEN_FLAG = 'pathfinder.tripwireSeen';
const CODEX = [
  { tab: 'howto', id: 'pathfinder-crossbow', nameKey: 'codex.howto.pathfinder-crossbow.name', bodyKey: 'codex.howto.pathfinder-crossbow.body' },
  { tab: 'lore', id: 'pathfinder-kestrel', nameKey: 'codex.lore.pathfinder-kestrel.name', bodyKey: 'codex.lore.pathfinder-kestrel.body' },
] as const;
const CODEX_RETRY_SECONDS = 1;

/** Where the crossbow's muzzle is, relative to the crossbow node (the long axis is +Z, design 9.5). */
export const CROSSBOW_TIP = { x: 0, y: 0.07, z: 1.16 } as const;

/** The Pathfinder's readers (thread 8's bolt counter). */
export interface PathfinderService {
  /** Bolts in the pouch and the stack size; null when the class is not the Pathfinder or the bolt item is not defined yet. */
  ammo(): { count: number; max: number } | null;
}
declare module '../../core/Services' {
  interface GameServices {
    pathfinder: PathfinderService;
  }
}

type Loose = { get(name: string): unknown };
type CodexPort = { register(entries: readonly unknown[]): () => void };
type InventoryPort = { count(id: string): number; remove(id: string, n: number): boolean };
type ProgressionPort = { classId?: string | null; learned?(id: string): boolean };

const pathfinderPlugin: GamePlugin = {
  id: 'pathfinder',
  dependsOn: ['core', 'combat-verbs', 'classes', 'spells', 'progression'],
  setup(ctx: GameContext) {
    // A second setup without a dispose in between (a reload) first releases the previous run.
    cleanup?.();
    const loose = ctx.services as unknown as Loose;
    const svc = <T>(name: string): T | undefined => loose.get(name) as T | undefined;
    const offs: Array<() => void> = [];
    let disposed = false;
    let simTime = 0;
    const playerId = (): string => ctx.actors.player.id;
    const isPathfinder = (): boolean => svc<ProgressionPort>('progression')?.classId === PF.classId;
    const learned = (id: string): boolean => svc<ProgressionPort>('progression')?.learned?.(id) === true;
    offs.push(ctx.strings.register('en', PATHFINDER_STRINGS_EN));
    const toast = (textKey: string): void => ctx.events.emit('hud.toast', { textKey });

    // ---- skills, kit, attack set, Surge form
    const skills = registerClassSkills(PF.classId, buildPathfinderSkills());
    if (!skills.ok && skills.reason !== 'duplicate-class') console.warn(`pathfinder: skills refused (${skills.reason})`);
    const classes = svc<{ registerKit(k: unknown): { ok: boolean; dispose?: () => void; reason?: string } }>('classes');
    const kit = classes?.registerKit({ ...DEFAULT_KITS.pathfinder, tip: CROSSBOW_TIP });
    if (kit?.ok && kit.dispose) offs.push(kit.dispose);
    else if (kit) console.warn(`pathfinder: kit refused (${kit.reason})`);

    // ---- helpers over the game
    const avatar = (): PlayerAvatar | null => ctx.player.avatar;
    const chest = (out: THREE.Vector3): THREE.Vector3 => out.set(ctx.player.feet.x, ctx.player.feet.y + 1.3, ctx.player.feet.z);
    const muzzle = (out: THREE.Vector3): THREE.Vector3 => {
      const tip = avatar()?.weaponTip;
      if (!tip) return chest(out);
      tip.updateWorldMatrix(true, false);
      return tip.getWorldPosition(out);
    };
    const headOf = (id: string): Vec3 | null => {
      const a = ctx.actors.get(id);
      if (!a || a.dead) return null;
      const p = a.worldPosition(new THREE.Vector3());
      return { x: p.x, y: p.y + 1.6, z: p.z };
    };
    const camDir = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    /** Aim sources, in order: the lock-on target's chest, the camera ray (to a collider or 60 m), the player's facing. */
    const aim = (from: Vec3): Vec3 => {
      const lockId = svc<{ targetId: string | null }>('lockOn')?.targetId ?? null;
      const target = lockId ? ctx.actors.get(lockId) : undefined;
      let point: THREE.Vector3 | null = null;
      if (target && !target.dead) point = target.worldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 0));
      else if (ctx.camera) {
        ctx.camera.getWorldPosition(camPos);
        ctx.camera.getWorldDirection(camDir);
        // Start past the player so the ray does not end on their own collider.
        const t0 = Math.max(0, (ctx.player.feet.x - camPos.x) * camDir.x + (ctx.player.feet.y + 1.3 - camPos.y) * camDir.y + (ctx.player.feet.z - camPos.z) * camDir.z) + 1;
        const o = camPos.clone().addScaledVector(camDir, t0);
        const hit = ctx.physics.raycast(o, camDir, 60);
        point = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : o.addScaledVector(camDir, 60);
      }
      const d = point ? point.sub(new THREE.Vector3(from.x, from.y, from.z)) : null;
      if (d && d.lengthSq() > 1e-4) return d.normalize();
      if (ctx.camera) return ctx.camera.getWorldDirection(new THREE.Vector3());
      const yaw = ctx.player.facingYaw;
      return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    };

    // ---- the parts
    const fx = new SceneFx(ctx.scene, headOf, () => ctx.player.feet);
    const audio = svc<{ playAt(key: string, at: Vec3): unknown }>('audio');
    const sound = (id: string, at: Vec3): void => {
      try {
        audio?.playAt(sfxKey(id as never, 0), at);
      } catch {
        // an unregistered key must not break a shot
      }
    };
    const host = createProjectileHost(ctx);
    const projectiles = new ProjectileSystem(host);
    const inventory = (): InventoryPort | undefined => svc<InventoryPort>('inventory');
    let warnedAmmo = false;
    const ammo = new Ammo({
      itemKnown: () => {
        const known = getItem(PF.ammoItem) !== undefined && inventory() !== undefined;
        if (!known && !warnedAmmo) {
          warnedAmmo = true;
          console.warn(`pathfinder: item "${PF.ammoItem}" is not defined yet; shots are free until it is`);
        }
        return known;
      },
      count: () => inventory()?.count(PF.ammoItem) ?? 0,
      remove: (n) => inventory()?.remove(PF.ammoItem, n) ?? false,
    });
    offs.push(
      ctx.services.provide('pathfinder', {
        ammo: () => {
          const def = getItem(PF.ammoItem);
          if (!isPathfinder() || !def || !inventory()) return null;
          return { count: Math.max(0, inventory()!.count(PF.ammoItem)), max: def.stackMax };
        },
      }),
    );
    const marks = new Marks({
      actors: ctx.actors,
      now: () => simTime,
      added: (id) => fx.markAdded(id),
      removed: (id) => fx.markRemoved(id),
    });
    const traps = new Traps({
      actors: ctx.actors,
      damage: ctx.damage as never,
      status: () => svc<StatusService>('status'),
      now: () => simTime,
      playerId,
      added: (id, kind, at) => fx.trapAdded(id, kind, at),
      removed: (id) => fx.trapRemoved(id),
      burst: (at, radius) => fx.burst(at, radius),
    });
    const crossbow = new Crossbow({
      playerId,
      muzzle,
      aim,
      attackHeld: () => ctx.input.actions.down('attack1'),
      learned,
      actors: ctx.actors,
      damage: ctx.damage as never,
      projectiles,
      ammo,
      marks,
      fx: {
        tracer: (a, b) => fx.tracer(a, b),
        shot: (at) => sound(SFX.boltShot, at),
        hit: (at) => sound(SFX.boltHit, at),
      },
      toast,
      now: () => simTime,
    });
    offs.push(ctx.damage.addModifier('pathfinder.crossbow', (req) => crossbow.cancelMelee(req), -190));

    const verbs = svc<{ registerAttackSet(classId: string, set: unknown): { ok: boolean; dispose?: () => void; reason?: string } }>('combatVerbs');
    const attackSet = verbs?.registerAttackSet(PF.classId, { attacks: PATHFINDER_ATTACKS, heavyIndex: PATHFINDER_HEAVY_INDEX });
    if (attackSet?.ok && attackSet.dispose) offs.push(attackSet.dispose);
    else if (attackSet) console.warn(`pathfinder: attack set refused (${attackSet.reason})`);

    const spells = svc<{ registerSurgeForm(classId: string, zone: string, impl: unknown): { ok: boolean; dispose?: () => void; reason?: string } }>('spells');
    const surge = createPathfinderSurge({
      projectiles,
      muzzle,
      aim,
      tracer: (a, b) => fx.tracer(a, b),
      burst: (at, r) => fx.burst(at, r),
      isDisposed: () => disposed,
    });
    for (const zone of ['warm', 'blaze', 'cinder']) {
      const r = spells?.registerSurgeForm(PF.classId, zone, surge);
      if (r?.ok && r.dispose) offs.push(r.dispose);
      else if (r) console.warn(`pathfinder: Surge form ${zone} refused (${r.reason})`);
    }

    // ---- tier 3 (Act 2): Ember Quarrel, Net Launcher, Light Step
    const pf = (id: string): boolean => isPathfinder() && learned(id);
    const trigger = (id: string) => (): void => void svc<{ reportTrigger?(id: string): boolean }>('abilities')?.reportTrigger?.(id);
    const vfx = (): VfxService | undefined => svc<VfxService>('vfx');
    const warn = (m: string): void => console.warn(m);
    const statusOf = () => svc<StatusService>('status');
    const ember = emberQuarrelHandler({
      playerId,
      active: () => pf(PF.skillIds.emberQuarrel),
      status: statusOf,
      warn,
      fx: (at) => void vfx()?.spawnEffect('ember-quarrel', { position: at }),
      triggered: trigger(PF.skillIds.emberQuarrel),
    });
    offs.push(ctx.events.on('damage.dealt', (r: DamageResult) => ember(r)));
    const net = new NetLauncher({
      actors: ctx.actors,
      playerId,
      status: statusOf,
      origin: chest,
      aim,
      lockTarget: () => svc<{ targetId: string | null }>('lockOn')?.targetId ?? null,
      blocked: (from, to) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-3) return false;
        const hit = ctx.physics.raycast(from, { x: dx / len, y: dy / len, z: dz / len }, len, ctx.world.player.controller.collider);
        return hit !== null && hit !== undefined && hit.distance < len - 1;
      },
      fx: (at) => void vfx()?.spawnEffect('net-launcher', { position: at }, { radius: 1.2 }),
      triggered: trigger(PF.skillIds.netLauncher),
    });
    const lightStep = new LightStep({
      active: () => pf(PF.skillIds.lightStep) && !ctx.actors.player.dead,
      controller: () => ctx.world.player.controller,
      feetY: () => ctx.player.feet.y,
      fx: () => void vfx()?.spawnEffect('light-step', { position: { x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z } }),
      triggered: trigger(PF.skillIds.lightStep),
    });
    offs.push(() => lightStep.reset());

    // ---- active skills (the abilities service spends the Ember and starts the cooldown after an ok)
    let handlersBound = false;
    const bindHandlers = (): void => {
      const abilities = svc<{ registerHandler(id: string, h: (a: unknown) => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?: () => void } }>('abilities');
      if (handlersBound || !abilities) return;
      handlersBound = true;
      const reg = (id: string, h: () => { ok: true } | { ok: false; reason: string }): void => {
        const r = abilities.registerHandler(id, h);
        if (r.ok && r.dispose) offs.push(r.dispose);
      };
      reg(PF.skillIds.cinderTrap, () => {
        const f = ctx.player.feet;
        const yaw = ctx.player.facingYaw;
        const at = { x: f.x - Math.sin(yaw) * PF.cinderTrap.placeDistance, y: f.y, z: f.z - Math.cos(yaw) * PF.cinderTrap.placeDistance };
        return traps.placeCinder(at) ? { ok: true } : { ok: false, reason: 'trap-limit' };
      });
      reg(PF.skillIds.netLauncher, () => net.cast());
      reg(PF.skillIds.falconEye, () => {
        if (marks.cast(ctx.player.feet) === 0) return { ok: false, reason: 'no-targets' };
        fx.hawk(PF.falconEye.seconds);
        return { ok: true };
      });
    };
    bindHandlers();

    // ---- the player's controller: shots and dodges
    let bound: AnimationControllerLike | null = null;
    let offController: (() => void) | null = null;
    let wasDodging = false;
    const onAnim = (e: AnimationEvent): void => {
      if (!isPathfinder()) return;
      if (e.type === 'clipStart') {
        const i = PATHFINDER_ATTACKS.findIndex((a) => a.clip === e.clip);
        if (i >= 0) crossbow.swingStarted(i);
      } else if (e.type === 'attackProgress') {
        if (PATHFINDER_ATTACKS.some((a) => a.clip === e.clip)) crossbow.progress(e.previousNormalizedTime, e.normalizedTime);
      } else if (e.type === 'clipEnd') {
        if (PATHFINDER_ATTACKS.some((a) => a.clip === e.clip)) crossbow.swingEnded();
      }
    };
    const bindController = (): void => {
      const c = (avatar()?.controller ?? null) as AnimationControllerLike | null;
      if (c === bound) return;
      offController?.();
      offController = null;
      bound = c;
      wasDodging = false;
      crossbow.swingEnded();
      if (c) offController = c.events.subscribe(onAnim);
    };
    offs.push(() => offController?.());

    // ---- Trailblaze
    let offTrail: (() => void) | null = null;
    const syncTrailblaze = (): void => {
      const want = isPathfinder() && learned(PF.skillIds.trailblaze) && ctx.input.actions.down('sprint') && ctx.player.moving;
      if (want && !offTrail) offTrail = ctx.player.addMoveModifier('pathfinder.trailblaze', { speedScale: PF.trailblazeScale });
      else if (!want && offTrail) {
        offTrail();
        offTrail = null;
      }
    };
    offs.push(() => offTrail?.());

    // ---- codex (thread 8's `codex.register`, bound lazily; its return removes the entries)
    let offCodex: (() => void) | null = null;
    let codexTimer = CODEX_RETRY_SECONDS;
    const bindCodex = (): void => {
      if (offCodex) return;
      const codex = svc<CodexPort>('codex');
      if (typeof codex?.register === 'function') offCodex = codex.register(CODEX);
    };
    offs.push(() => offCodex?.());

    const reset = (): void => {
      traps.clear();
      marks.clear();
      fx.clear();
      projectiles.clear(true);
      crossbow.swingEnded();
    };
    // Every tier 3 skill's state: Light Step's controller fields (Ember Quarrel and the net keep none; their statuses live on the foes).
    const resetTier3 = (): void => lightStep.reset();
    offs.push(ctx.events.on('class.changed', () => (reset(), resetTier3())));
    offs.push(ctx.events.on('save.loaded', () => (reset(), resetTier3())));
    offs.push(ctx.events.on('actor.died', (e) => void (e.actorId === playerId() && resetTier3())));
    offs.push(ctx.events.on('player.avatar', () => bindController()));

    offs.push(
      ctx.systems.add({
        id: 'pathfinder',
        fixedPhase: 'rules',
        order: ORDER,
        fixedUpdate(dt) {
          if (!(dt > 0)) return;
          simTime += dt;
          bindHandlers();
          bindController();
          const active = isPathfinder();
          if (active) {
            const dodging = bound?.currentAction === 'dodge';
            if (dodging && !wasDodging && learned(PF.skillIds.tripwire) && traps.dodgeStarted(ctx.player.feet)) {
              if (ctx.state.getFlag(TRIPWIRE_SEEN_FLAG) !== true) {
                ctx.state.setFlag(TRIPWIRE_SEEN_FLAG, true);
                toast('pathfinder.tripwire.hint');
              }
            }
            wasDodging = dodging;
          } else if (traps.count() > 0 || marks.count > 0) reset();
          syncTrailblaze();
          lightStep.tick(dt);
          projectiles.update(dt);
          traps.update();
          marks.update();
          fx.update(dt);
          codexTimer -= dt;
          if (codexTimer <= 0) {
            codexTimer = CODEX_RETRY_SECONDS;
            bindCodex();
          }
        },
      }),
    );

    cleanup = () => {
      cleanup = null;
      disposed = true;
      crossbow.dispose();
      reset();
      for (const off of offs.splice(0).reverse()) off();
    };
  },
  dispose() {
    cleanup?.();
  },
};

interface AnimationControllerLike {
  currentAction: string | null;
  events: { subscribe(fn: (e: AnimationEvent) => void): () => void };
}

let cleanup: (() => void) | null = null;

export default pathfinderPlugin;
