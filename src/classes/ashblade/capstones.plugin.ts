import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { DamageResult } from '../../actors/DamageResolver';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { FlickerStrike, GhostOfTheHearth, ThousandSparks, type SparkFoe } from './capstones';
import type { FoeView } from './skills.act3';
import type { StealthHooks } from './stealthSkills';
import { ASH_DRIFT, CLASS_ID, GHOST_OF_THE_HEARTH, SKILL } from './tuning';

type Loose = { get(name: string): unknown };
interface VerbsLike {
  readonly busy?: boolean;
  readonly staggered?: boolean;
  addInvulnerability?(source: string, seconds: number): () => void;
  holdForcedMove?(owner: string, move: { x: number; z: number; speed: number } | null): void;
}
interface ControllerLike {
  readonly currentAction?: string | null;
  readonly state?: string;
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; yaw?: number; scale?: number; attach?: THREE.Object3D },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | undefined;
  dissolve?(root: THREE.Object3D, seconds: number, opts?: { tint?: number; reverse?: boolean }): Promise<void>;
  pulseScreen?(strength: number, seconds: number, color?: number): void;
}

let cleanup: (() => void) | null = null;
const scratch = new THREE.Vector3();
const FLICKER_HOLD = 'ashblade.flickerStrike';

/**
 * Ashblade tier 5 capstones (Act 3, K11 PR 3): Death by a Thousand Sparks, Ghost of the Hearth, Flicker Strike. The tier 5 rows
 * already exist in `skills.ts` (no second registration); this wires their behaviour. Services of other threads are read
 * loosely and at use, so a missing one is a refusal or a warning.
 */
const ashbladeCapstonesPlugin: GamePlugin = {
  id: 'ashblade-capstones',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes', 'ashblade-act3'],
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
    const interiors = () => svc<{ interiorAt(p: unknown): string | null; current: string | null }>('interiors');
    const containment = () => svc<{ isOpen(x: number, z: number): boolean }>('containment');

    const facingOf = (root: THREE.Object3D): { x: number; z: number } | null => {
      const v = new THREE.Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
      const l = Math.hypot(v.x, v.z);
      return l < 1e-6 ? null : { x: v.x / l, z: v.z / l };
    };
    const view = (a: NonNullable<ReturnType<typeof ctx.actors.get>>): SparkFoe => {
      a.worldPosition(scratch);
      return {
        id: a.id,
        x: scratch.x,
        y: scratch.y,
        z: scratch.z,
        live: a.team === 'hostile' && !a.dead && a.hittable,
        mercy: a.mercyState?.(),
        facing: a.root ? facingOf(a.root) : null,
      };
    };
    function* foes(): Iterable<SparkFoe> {
      for (const a of ctx.actors.all()) {
        if (a.team !== 'hostile' || a.dead || !a.hittable || !a.root) continue;
        yield view(a);
      }
    }
    const isBoss = (actorId: string): boolean => {
      const bosses = ctx.bosses;
      if (!bosses?.active) return false;
      for (const b of bosses.active()) if (bosses.state(b)?.actorId === actorId) return true;
      return false;
    };

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
    const space = {
      interiorAt: (p: { x: number; y: number; z: number }) => interiors()?.interiorAt(p) ?? null,
      isOpen: (x: number, z: number) => containment()?.isOpen(x, z) ?? true,
      invulnerable: (source: string, seconds: number) => verbs()?.addInvulnerability?.(source, seconds) ?? null,
    };

    const sparks = new ThousandSparks({
      ...base,
      foes,
      interiorAt: space.interiorAt,
      currentInterior: () => interiors()?.current ?? null,
      isOpen: space.isOpen,
      raycast: (origin, dir, max) => {
        const hit = ctx.physics.raycast(origin, dir, max, ctx.world.player.controller.collider);
        return hit ? { distance: hit.distance, point: hit.point } : null;
      },
      teleport: (feet, yaw) => void ctx.player.teleport(feet, yaw),
      arrive: () => {
        const root = ctx.world.avatar?.root;
        if (root) vfx()?.dissolve?.(root, ASH_DRIFT.dissolveSeconds, { reverse: true })?.catch(() => undefined);
      },
      invulnerable: (seconds) => space.invulnerable('ashblade.thousandSparks', seconds),
      apply: (req) => ctx.damage.apply(req),
      screen: (strength, seconds, color) => vfx()?.pulseScreen?.(strength, seconds, color),
      warn,
    });
    const ghost = new GhostOfTheHearth({
      ...base,
      stealth: () => svc<StealthHooks>('stealth'),
      perception: () => svc<{ perception?: never }>('enemies')?.perception,
      // The controller is in an attack, or a one-shot clip (any skill that plays one): the rising edge is "the Ashblade began to act".
      swinging: () => {
        const s = controller()?.state;
        return s === 'attack' || s === 'oneShot';
      },
      isBoss,
      canYield: (actorId) => {
        const enemies = svc<{ mercyUnlocked?(v: 'spare'): boolean; ground?: { get?(id: string): { def?: { mercy?: { when?: string } } } | undefined } }>('enemies');
        if (typeof enemies?.mercyUnlocked !== 'function' || enemies.mercyUnlocked('spare') !== true) return false;
        return enemies.ground?.get?.(actorId)?.def?.mercy?.when === 'yielding';
      },
      warn,
    });
    const flicker = new FlickerStrike({
      ...base,
      foes: foes as () => Iterable<FoeView>,
      isOpen: space.isOpen,
      interiorAt: space.interiorAt,
      raycast: (origin, dir, max) => {
        const hit = ctx.physics.raycast(origin, dir, max, ctx.world.player.controller.collider);
        return hit ? { distance: hit.distance, point: hit.point } : null;
      },
      hold: (move) => verbs()?.holdForcedMove?.(FLICKER_HOLD, move),
      invulnerable: (seconds) => space.invulnerable('ashblade.flickerStrike', seconds),
      dodging: () => controller()?.currentAction === 'dodge',
      interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || controller()?.currentAction === 'dodge',
      apply: (req) => ctx.damage.apply(req),
      warn,
    });
    if (typeof verbs()?.holdForcedMove !== 'function') warn('ashblade: combatVerbs.holdForcedMove is absent, Flicker Strike has no dash');

    offs.push(ctx.damage.addModifier(GHOST_OF_THE_HEARTH.modifierId, ghost.modifier, GHOST_OF_THE_HEARTH.order));
    offs.push(ctx.damage.addModifier(GHOST_OF_THE_HEARTH.clampModifierId, ghost.clamp, GHOST_OF_THE_HEARTH.clampOrder));
    const resetAll = (): void => {
      sparks.end();
      ghost.end();
      flicker.reset();
    };
    offs.push(
      resetAll,
      ctx.events.on('save.loaded', resetAll),
      ctx.events.on('class.changed', resetAll),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === playerId()) resetAll();
      }),
      ctx.events.on('damage.dealt', (r: DamageResult) => ghost.onDealt(r)),
      ctx.events.on('ability.used', (e) => ghost.onSkillUsed(e.skillId)),
      ctx.events.on('spell.cast', (e) => {
        if (e.casterId === playerId()) ghost.onSpellCast();
      }),
    );

    // The abilities service may appear after this plugin (it is read loosely), so binding is retried twice a second.
    const bound = new Set<string>();
    const bind = (): void => {
      const abilities = svc<{ registerHandler(id: string, h: () => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?(): void } }>('abilities');
      if (!abilities) return;
      const handlers: Array<[string, () => { ok: true } | { ok: false; reason: string }]> = [
        [SKILL.deathByAThousandSparks, () => sparks.cast()],
        [SKILL.ghostOfTheHearth, () => ghost.cast()],
        [SKILL.flickerStrike, () => flicker.cast()],
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
        id: 'ashblade.capstones.fixed',
        fixedPhase: 'afterCombat',
        order: 127,
        fixedUpdate() {
          if (ctx.clock.tick % 30 === 0) bind();
          sparks.update();
          ghost.update();
          flicker.update();
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

export default ashbladeCapstonesPlugin;
