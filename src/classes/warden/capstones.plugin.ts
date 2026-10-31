import type { StatusService } from '../../actors/status';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import { looseService } from '../../vfx/ports';
import { CrackedMarks, MountainUnmoved, VoiceOfTheMountain, Wyrmbreaker } from './capstones';
import { MOUNTAIN_UNMOVED, SKILL_IDS, VOICE_OF_THE_MOUNTAIN, WARDEN_CLASS_ID, WYRMBREAKER } from './tuning';

type Loose = { get(name: string): unknown };
interface ControllerLike {
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  readonly currentAction?: string | null;
}
interface VerbsLike {
  readonly busy: boolean;
  readonly staggered: boolean;
  addKnockbackFilter?(id: string, keep: (r: { kind: 'stagger' | 'break'; knockback: number }) => boolean): () => void;
}
interface BossesLike {
  active(): string[];
  state(bossId: string): { actorId: string } | null;
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
 * Warden tier 5 capstones (Act 3, K11 PR 3): Wyrmbreaker, Mountain Unmoved and Voice of the Mountain. The rows already exist in
 * skills.ts (K0) with their costs; this plugin binds the behaviour in capstones.ts to the services, like act3.plugin.ts does for
 * tier 4. Services of other threads (`abilities`, `status`, `vfx`) are read loosely and at use, so a missing one is a refusal or a
 * no-op, not a crash.
 *
 * Modifiers: the crack at -55 (defender band, ahead of the guard at -50 and Bastion Wall at -45) and Mountain Unmoved at 20 (buffs
 * band, after Frenzied Hearth at 10 and before Grit Teeth at 50). Not done from design 11.5: the camera shake damped to 0 under
 * Mountain Unmoved (CameraFx has no damping hook; shakes are simply left as they are) and the distortion refraction of the Voice
 * (no refraction shader; a ring and dust stand in).
 */
const wardenCapstonesPlugin: GamePlugin = {
  id: 'warden-capstones',
  dependsOn: ['core', 'progression', 'combat-verbs', 'warden', 'warden-act3'],
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
    const status = () => svc<StatusService>('status');
    const trigger = (id: string) => svc<{ reportTrigger?(id: string): void }>('abilities')?.reportTrigger?.(id);
    const feetAt = () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z });
    const isBoss = (actorId: string): boolean => {
      const b = (ctx as unknown as { bosses?: BossesLike }).bosses;
      if (!b?.active) return false;
      for (const bossId of b.active()) if (b.state(bossId)?.actorId === actorId) return true;
      return false;
    };
    // Mountain Unmoved is an emergency defensive that plays no clip and moves nothing: no busy gate (like Bastion Wall), so it can
    // be pressed while blocking or flinching. Wyrmbreaker and the Voice keep it.
    const blockedNow = (withBusy = true): string | null => {
      if (ctx.actors.player.dead) return 'dead';
      if (verbs()?.staggered) return 'staggered';
      if (withBusy && (verbs()?.busy || controller()?.currentAction)) return 'busy';
      return null;
    };
    const stopper = (h: FxHandle | unknown): (() => void) | undefined => {
      const s = (h as FxHandle)?.stop;
      return s ? () => s.call(h) : undefined;
    };

    try {
      const marks = new CrackedMarks({ events: ctx.events, now: () => ctx.clock.seconds });
      offs.push(() => marks.dispose());
      // Order -55: defender band, ahead of the guard (-50). The player is never marked, so the modifier never touches a hit on it.
      offs.push(ctx.damage.addModifier(WYRMBREAKER.crackModifierId, (req, target) => marks.modify(req, target.id), WYRMBREAKER.crackOrder));

      const wyrm = new Wyrmbreaker(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          marks,
          isWarden,
          learned: () => learned(SKILL_IDS.wyrmbreaker),
          blockedReason: blockedNow,
          feet: () => ctx.player.feet,
          facingYaw: () => ctx.player.facingYaw,
          playClip: (clip) => controller()?.playOneShot?.(clip, { lockMove: true }) === true,
          // During the charge a flinch (a light hit) is ridden out: in a real fight foes hit the Warden inside 0.8 s. A stagger, a
          // dodge, any other action or another attack (verbs.busy outside a flinch) breaks it. During the chop currentAction reads
          // null while the one-shot plays, so a non-null action means the clip was replaced.
          interrupted: (phase) => {
            if (ctx.actors.player.dead || verbs()?.staggered === true) return true;
            const action = controller()?.currentAction ?? null;
            if (phase === 'charge' && action === 'flinch') return false;
            return action !== null || (phase === 'charge' && verbs()?.busy === true);
          },
          flinching: () => controller()?.currentAction === 'flinch',
          lockMove: () => ctx.player.addMoveModifier(WYRMBREAKER.moveSource, { lockMove: true }),
          reportTrigger: trigger,
          fx: {
            // `attach` adds the root's world position itself, so the offset is zero.
            charge: (seconds) => {
              const attach = ctx.player.avatar?.root;
              return stopper(vfx()?.spawnEffect?.(WYRMBREAKER.chargeEffect, { position: attach ? { x: 0, y: 0, z: 0 } : feetAt(), attach }, { seconds }));
            },
            fissure: (at, yaw, hits) => {
              vfx()?.spawnEffect?.(WYRMBREAKER.effect, { position: { x: at.x, y: at.y, z: at.z }, yaw }, { length: WYRMBREAKER.length, width: WYRMBREAKER.width, hits });
              vfx()?.shake?.(WYRMBREAKER.shakeAmplitude, WYRMBREAKER.shakeSeconds);
              if (hits > 0) (ctx.clock as unknown as { hitStop?(s: number): void }).hitStop?.(WYRMBREAKER.hitStopSeconds);
            },
          },
          skillId: SKILL_IDS.wyrmbreaker,
        },
        playerId,
      );
      offs.push(() => wyrm.cancel());

      const mountain = new MountainUnmoved(
        {
          now: () => ctx.clock.seconds,
          isWarden,
          learned: () => learned(SKILL_IDS.mountainUnmoved),
          blockedReason: () => blockedNow(false),
          addKnockbackFilter: (id, keep) => verbs()?.addKnockbackFilter?.(id, keep) ?? (() => {}),
          fx: (seconds) => {
            const attach = ctx.player.avatar?.root;
            return stopper(vfx()?.spawnEffect?.(MOUNTAIN_UNMOVED.effect, { position: attach ? { x: 0, y: 0, z: 0 } : feetAt(), attach }, { seconds }));
          },
          reportTrigger: trigger,
          skillId: SKILL_IDS.mountainUnmoved,
        },
        playerId,
      );
      offs.push(() => mountain.reset());
      // Order 20: buffs band, after Frenzied Hearth (10), ahead of Grit Teeth (50).
      offs.push(ctx.damage.addModifier(MOUNTAIN_UNMOVED.modifierId, (req, target) => mountain.modify(req, target.id), MOUNTAIN_UNMOVED.order));

      const voice = new VoiceOfTheMountain(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          stun: (id, spec) => status()?.apply(id, spec) ?? false,
          isBoss,
          isWarden,
          learned: () => learned(SKILL_IDS.voiceOfTheMountain),
          blockedReason: blockedNow,
          feet: () => ctx.player.feet,
          reportTrigger: trigger,
          fx: {
            howl: (at) => {
              vfx()?.spawnEffect?.(VOICE_OF_THE_MOUNTAIN.effect, { position: { x: at.x, y: at.y, z: at.z } }, { radius: VOICE_OF_THE_MOUNTAIN.radius });
              vfx()?.shake?.(VOICE_OF_THE_MOUNTAIN.shakeAmplitude, VOICE_OF_THE_MOUNTAIN.shakeSeconds);
            },
            stunned: (foeId, seconds) => {
              const root = ctx.actors.get(foeId)?.root;
              if (root) vfx()?.spawnEffect?.(VOICE_OF_THE_MOUNTAIN.stunEffect, { position: { x: 0, y: 0, z: 0 }, attach: root }, { seconds });
            },
          },
          skillId: SKILL_IDS.voiceOfTheMountain,
        },
        playerId,
      );

      const abilities = looseService(ctx.services, 'abilities');
      const register = (skillId: string, label: string, handler: () => { ok: true } | { ok: false; reason: string }) => {
        const h = abilities?.registerHandler(skillId, handler);
        if (h?.ok) offs.push(h.dispose);
        else warn(`warden: ${label} handler not registered (${h ? h.reason : 'no abilities service'})`);
      };
      register(SKILL_IDS.wyrmbreaker, 'Wyrmbreaker', () => wyrm.start());
      register(SKILL_IDS.mountainUnmoved, 'Mountain Unmoved', () => mountain.start());
      register(SKILL_IDS.voiceOfTheMountain, 'Voice of the Mountain', () => voice.cast());

      const clearAll = (): void => {
        wyrm.cancel();
        mountain.reset();
        marks.clear();
      };
      offs.push(
        ctx.events.on('class.changed', clearAll),
        ctx.events.on('save.loaded', clearAll),
        ctx.events.on('actor.died', (e) => {
          // The player's death ends the casts; a foe's death is handled by the marks themselves.
          if (e.actorId === playerId()) {
            wyrm.cancel();
            mountain.reset();
          }
        }),
        ctx.systems.add({
          id: 'warden.capstones.fixed',
          fixedPhase: 'afterCombat',
          order: 126,
          fixedUpdate() {
            wyrm.tick();
            mountain.tick();
            marks.prune();
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

export default wardenCapstonesPlugin;
