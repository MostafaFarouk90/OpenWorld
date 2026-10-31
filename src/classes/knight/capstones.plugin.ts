import type * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { looseService } from '../../vfx/ports';
import { BannerOfTheSunforge, HeartshardSmite, UnbrokenOath, type SmiteBlade } from './capstones';
import { HEARTSHARD_SMITE, SKILL_IDS, SUNFORGE, UNBROKEN_OATH } from './tuning';

type Loose = { get(name: string): unknown };
interface ControllerLike {
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
  pulseScreen?(strength: number, seconds: number, color?: number): void;
}
interface SpellsLike {
  plantBanner?(opts?: { radius?: number }): void;
  bannerInfo?(): { position: { x: number; y: number; z: number }; radius: number } | null;
  addEmberRegenMultiplier?(id: string, fn: () => number): () => void;
}
interface StatusLike {
  apply(actorId: string, spec: { id: string; kind: 'ignite'; dps: number; seconds: number; sourceId: string | null }): boolean;
}

let cleanup: (() => void) | null = null;

/**
 * Knight tier 5 capstones (Act 3, K11 PR 3): Unbroken Oath, Heartshard Smite (a passive) and Banner of the Sunforge. The Knight plays
 * with a null class before M07, so every handler accepts null or 'knight'. The rows (and the master-book gate) are in
 * progression/skills.ts. Two additive hooks of the spells plugin carry the banner: `plantBanner({ radius })` and
 * `addEmberRegenMultiplier` (spells/BannerPlant.ts, spells/Ember.ts).
 *
 * Not done: the hurt sound replaced by a ring tone (no sound hook on the player's hurt) and the doubled sword trail (the trail driver
 * has no multiplier); the blade effect and the scaled blade stand in for both.
 */
const knightCapstonesPlugin: GamePlugin = {
  id: 'knight-capstones',
  dependsOn: ['core', 'progression', 'combat-verbs', 'knight-act3'],
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
    const spells = () => svc<SpellsLike>('spells');
    const trigger = (id: string) => svc<{ reportTrigger?(id: string): void }>('abilities')?.reportTrigger?.(id);
    // Banner of the Sunforge keeps the busy gate. The Oath is an emergency defensive that plays no clip and moves nothing, so (like
    // Bastion Wall) it is refused only when dead or staggered, never while blocking or flinching.
    const blockedNow = (withBusy = true): string | null => {
      if (ctx.actors.player.dead) return 'dead';
      if (verbs()?.staggered) return 'staggered';
      if (withBusy && (verbs()?.busy || controller()?.currentAction)) return 'busy';
      return null;
    };

    try {
      // Unbroken Oath
      const oath = new UnbrokenOath({
        now: () => ctx.clock.seconds,
        tick: () => ctx.clock.tick,
        playerId,
        classId,
        learned: () => learnedId(SKILL_IDS.unbrokenOath),
        dead: () => ctx.actors.player.dead,
        blockedReason: () => blockedNow(false),
        stamina: () => ctx.actors.player.stamina,
        restoreStamina: (n) => ctx.actors.player.restoreStamina(n),
        shell: () => {
          // With `attach` the preset adds the root's world position itself, so the offset is zero.
          const attach = ctx.player.avatar?.root;
          const h = vfx()?.spawnEffect?.(
            UNBROKEN_OATH.fx,
            { position: attach ? { x: 0, y: 0, z: 0 } : ctx.player.feet, attach },
            { seconds: UNBROKEN_OATH.seconds },
          );
          vfx()?.pulseScreen?.(UNBROKEN_OATH.vignetteStrength, UNBROKEN_OATH.vignetteSeconds, UNBROKEN_OATH.vignetteColor);
          return h ? () => h.stop() : null;
        },
        heartbeat: () => vfx()?.pulseScreen?.(UNBROKEN_OATH.vignetteStrength, UNBROKEN_OATH.vignetteSeconds, UNBROKEN_OATH.vignetteColor),
        reportTrigger: trigger,
        skillId: SKILL_IDS.unbrokenOath,
      });
      offs.push(() => oath.clear());
      offs.push(ctx.damage.addLethalHandler(UNBROKEN_OATH.handlerId, (target, result) => {
        if (!oath.lethal(target.id, result.kind)) return false;
        target.health = Math.min(1, target.maxHealth);
        return true;
      }, UNBROKEN_OATH.handlerOrder));

      // Heartshard Smite
      const smite = new HeartshardSmite({
        now: () => ctx.clock.seconds,
        playerId,
        classId,
        learned: () => learnedId(SKILL_IDS.heartshardSmite),
        dead: () => ctx.actors.player.dead,
        blade: () => {
          const a = ctx.player.avatar as unknown as { weapon?: THREE.Object3D; weaponHilt?: THREE.Object3D; weaponTip?: THREE.Object3D } | undefined;
          return a?.weapon && a.weaponHilt && a.weaponTip ? ({ weapon: a.weapon, hilt: a.weaponHilt, tip: a.weaponTip } satisfies SmiteBlade) : null;
        },
        foe: (id) => (ctx.actors.get(id) as never) ?? null,
        ignite: (id, spec) => svc<StatusLike>('status')?.apply(id, spec) ?? false,
        fx: (weapon, reach) => {
          // `attach` adds the weapon's world position to the offset: {0,0,0}.
          const h = vfx()?.spawnEffect?.(HEARTSHARD_SMITE.fx, { position: { x: 0, y: 0, z: 0 }, attach: weapon }, { seconds: HEARTSHARD_SMITE.seconds, length: reach });
          return h ? () => h.stop() : null;
        },
      });
      offs.push(() => smite.clear());
      offs.push(ctx.damage.addModifier(HEARTSHARD_SMITE.modifierId, (req) => smite.modify(req as never), HEARTSHARD_SMITE.modifierOrder));

      // Banner of the Sunforge
      const sunforge = new BannerOfTheSunforge({
        playerId,
        classId,
        learned: () => learnedId(SKILL_IDS.bannerOfTheSunforge),
        blockedReason: blockedNow,
        plant: (radius) => {
          const s = spells();
          if (!s?.plantBanner) return false;
          s.plantBanner({ radius });
          return true;
        },
        banner: () => spells()?.bannerInfo?.() ?? null,
        dead: () => ctx.actors.player.dead,
        feet: () => ctx.player.feet,
        fx: (position, radius, seconds) => void vfx()?.spawnEffect?.(SUNFORGE.fx, { position }, { radius, seconds }),
        reportTrigger: trigger,
        skillId: SKILL_IDS.bannerOfTheSunforge,
      });
      // The spells service may appear after this plugin; the multiplier binds as soon as it is there (checked each fixed tick).
      let offRegen: (() => void) | null = null;
      offs.push(() => {
        offRegen?.();
        offRegen = null;
      });
      const bindRegen = (): void => {
        if (offRegen) return;
        offRegen = spells()?.addEmberRegenMultiplier?.(SUNFORGE.multiplierId, () => sunforge.regenFactor()) ?? null;
      };
      bindRegen();

      const abilities = looseService(ctx.services, 'abilities');
      const reg = (id: string, fn: () => { ok: true } | { ok: false; reason: string }, label: string) => {
        const r = abilities?.registerHandler(id, fn);
        if (r?.ok) offs.push(r.dispose);
        else warn(`knight: ${label} handler not registered (${r ? r.reason : 'no abilities service'})`);
      };
      reg(SKILL_IDS.unbrokenOath, () => oath.cast(), 'Unbroken Oath');
      reg(SKILL_IDS.bannerOfTheSunforge, () => sunforge.cast(), 'Banner of the Sunforge');

      const clearAll = () => {
        oath.clear();
        smite.clear();
      };
      offs.push(
        ctx.events.on('player.parried', () => oath.onParried()),
        ctx.events.on('damage.dealt', (r) => {
          oath.onDealt(r);
          smite.onDealt(r);
        }),
        ctx.events.on('spell.released', (e) => void smite.onReleased(e.casterId, e.spellId)),
        ctx.events.on('player.avatar', () => smite.clear()),
        ctx.events.on('actor.died', (e) => {
          if (e.actorId === playerId()) clearAll();
        }),
        ctx.events.on('class.changed', clearAll),
        ctx.events.on('save.loaded', clearAll),
        ctx.systems.add({
          id: 'knight.capstones.fixed',
          fixedPhase: 'afterCombat',
          order: 128,
          fixedUpdate() {
            if (!offRegen && ctx.clock.tick % 30 === 0) bindRegen();
            oath.tick();
            smite.tick();
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

export default knightCapstonesPlugin;
