import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import { registerHeavyClip } from '../../combat/heavyBlow';
import { registerClassSkills } from '../../progression/skills';
import type { ClassKit } from '../types';
import { looseService } from '../../vfx/ports';
import { WARDEN_ATTACK_SET } from './attackSet';
import { BoulderShoulder } from './BoulderShoulder';
import { WARDEN_KIT } from './kit';
import { WARDEN_SKILLS } from './skills';
import { BloodChant, GritTeeth, WhirlingHew } from './tier3';
import { WARDEN_CODEX_ENTRIES, WARDEN_CODEX_STRINGS_EN, WARDEN_STRINGS_EN } from './strings.en';
import { wardenSurgeForm } from './surge';
import { BLOOD_CHANT, DEEP_WOUND, GRIT_TEETH, SKILL_IDS, THICK_SKIN, WARDEN_CLASS_ID, WARDEN_CLIPS, WHIRLING_HEW } from './tuning';
import { WardenCombat } from './WardenCombat';

type Loose = { get(name: string): unknown };
interface ControllerLike {
  activeAttack(): { clip: string; swingId: number; active: boolean } | null;
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  readonly currentAction?: string | null;
  readonly busy?: boolean;
}
interface VerbsLike {
  readonly busy: boolean;
  readonly staggered: boolean;
  registerAttackSet(classId: string, set: typeof WARDEN_ATTACK_SET): { ok: true; dispose(): void } | { ok: false; reason: string };
  holdForcedMove(owner: string, move: { x: number; z: number; speed: number } | null): void;
}
interface SpellsLike {
  registerSurgeForm(classId: string, zone: 'warm' | 'blaze' | 'cinder', impl: never): { ok: true; dispose(): void } | { ok: false; reason: string };
  restoreEmber?(n: number): number | void;
}
interface ClassesLike {
  registerKit(kit: ClassKit): { ok: true; dispose(): void } | { ok: false; reason: string };
}
interface VfxLike {
  spawnEffect?(
    id: string,
    t: { position: { x: number; y: number; z: number }; scale?: number; attach?: unknown },
    params?: Record<string, number | string | boolean>,
  ): { stop(): void } | unknown;
}

let cleanup: (() => void) | null = null;

/**
 * The Warden (slice 2 thread 13): kit, attack set, Surge forms, tier 1 and 2 skills and the passives that make them play.
 * Everything registers through the services of threads 1, 2 and 12; no core file is touched.
 */
const wardenPlugin: GamePlugin = {
  id: 'warden',
  dependsOn: ['core', 'progression', 'classes', 'combat-verbs', 'spells'],
  setup(ctx: GameContext) {
    cleanup?.();
    const offs: Array<() => void> = [];
    const loose = ctx.services as unknown as Loose;
    const svc = <T>(name: string): T | undefined => loose.get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const progression = () => looseService(ctx.services, 'progression');
    const learned = (id: string): boolean => progression()?.learned(id) === true;
    const verbs = () => svc<VerbsLike>('combatVerbs');
    const controller = () => ctx.player.avatar?.controller as unknown as ControllerLike | undefined;
    const playerId = () => ctx.actors.player.id;
    const spawn = (id: string, at: { x: number; y: number; z: number }) => svc<VfxLike>('vfx')?.spawnEffect?.(id, { position: at });

    try {
      ctx.strings.register('en', { ...WARDEN_STRINGS_EN, ...WARDEN_CODEX_STRINGS_EN });

      const skills = registerClassSkills(WARDEN_CLASS_ID, WARDEN_SKILLS);
      if (skills.ok) offs.push(skills.dispose);
      else warn(`warden: skills refused (${skills.reason})`);

      const attacks = verbs()?.registerAttackSet(WARDEN_CLASS_ID, WARDEN_ATTACK_SET);
      if (attacks?.ok) offs.push(attacks.dispose);
      else warn(`warden: attack set not registered (${attacks ? attacks.reason : 'no combatVerbs service'})`);

      offs.push(registerHeavyClip(WARDEN_CLIPS.chop));

      const combat = new WardenCombat(
        {
          events: ctx.events,
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          now: () => ctx.clock.seconds,
          feet: () => ctx.player.feet,
          facingYaw: () => ctx.player.facingYaw,
          learned,
          status: () => svc('status'),
          spells: () => svc<SpellsLike>('spells'),
          attack: () => controller()?.activeAttack() ?? null,
          // A dodge, block or reaction cutting the swing short cancels the cleave too.
          interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || !!controller()?.currentAction,
          reportTrigger: (id) => (svc<{ reportTrigger?(id: string): void }>('abilities'))?.reportTrigger?.(id),
          fx: {
            howl: (at) => spawn('shockwave-ring', { x: at.x, y: at.y + 0.2, z: at.z }),
          },
          warn,
        },
        playerId,
      );
      offs.push(() => combat.dispose());

      const spells = svc<SpellsLike>('spells');
      for (const zone of ['warm', 'blaze', 'cinder'] as const) {
        const form = wardenSurgeForm(zone, {
          igniteAxe: () => combat.igniteAxe(),
          fissureFx: (points) => points.forEach((p) => spawn('ember-burst', p)),
        });
        const r = spells?.registerSurgeForm(WARDEN_CLASS_ID, zone, form as never);
        if (r?.ok) offs.push(r.dispose);
        else warn(`warden: ${zone} Surge form not registered (${r ? r.reason : 'no spells service'})`);
      }

      // Thick Skin reads `learned` each time the modifiers are evaluated, so a respec drops it without an unlearn event.
      const offSkin = progression()?.addMaxHealthModifier(THICK_SKIN.modifierId, () => (learned(SKILL_IDS.thickSkin) ? THICK_SKIN.maxHealthFactor : 1));
      if (offSkin) offs.push(offSkin);

      const boulder = new BoulderShoulder(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          feet: () => ctx.player.feet,
          facingYaw: () => ctx.player.facingYaw,
          blockedReason: () => {
            if (ctx.actors.player.dead) return 'dead';
            if (verbs()?.staggered) return 'staggered';
            if (verbs()?.busy || controller()?.currentAction) return 'busy';
            return null;
          },
          playClip: (clip) => controller()?.playOneShot?.(clip, { lockMove: true }) === true,
          hold: (move) => verbs()?.holdForcedMove('warden.boulderShoulder', move),
          interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || controller()?.currentAction === 'dodge',
          reportTrigger: (id) => (svc<{ reportTrigger?(id: string): void }>('abilities'))?.reportTrigger?.(id),
          skillId: SKILL_IDS.boulderShoulder,
        },
        playerId,
      );
      offs.push(() => boulder.cancel());
      const abilities = looseService(ctx.services, 'abilities');
      const handler = abilities?.registerHandler(SKILL_IDS.boulderShoulder, () => boulder.start());
      if (handler?.ok) offs.push(handler.dispose);
      else warn(`warden: Boulder Shoulder handler not registered (${handler ? handler.reason : 'no abilities service'})`);

      // Tier 3 (Act 2): Whirling Hew, Grit Teeth and Blood Chant. Their logic is in tier3.ts; this block only binds the services.
      const feetAt = () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z });
      const blockedNow = (withBusy: boolean): string | null => {
        if (ctx.actors.player.dead) return 'dead';
        if (verbs()?.staggered) return 'staggered';
        if (withBusy && (verbs()?.busy || controller()?.currentAction)) return 'busy';
        return null;
      };
      /** Spawns a timed effect that rides the player; returns what stops it. */
      const followFx = (id: string, seconds: number): (() => void) | undefined => {
        const handle = svc<VfxLike>('vfx')?.spawnEffect?.(id, { position: feetAt(), attach: ctx.player.avatar?.root }, { seconds }) as { stop?(): void } | undefined;
        return handle?.stop ? () => handle.stop!() : undefined;
      };
      const trigger = (id: string) => svc<{ reportTrigger?(id: string): void }>('abilities')?.reportTrigger?.(id);

      const hew = new WhirlingHew(
        {
          actors: ctx.actors as never,
          damage: ctx.damage as never,
          feet: () => ctx.player.feet,
          blockedReason: () => blockedNow(true),
          playClip: (clip) => controller()?.playOneShot?.(clip, { lockMove: true }) === true,
          interrupted: () => ctx.actors.player.dead || verbs()?.staggered === true || controller()?.currentAction === 'dodge',
          reportTrigger: trigger,
          fx: { spin: (at) => void svc<VfxLike>('vfx')?.spawnEffect?.('whirling-hew', { position: at }, { reach: WHIRLING_HEW.reach }) },
          skillId: SKILL_IDS.whirlingHew,
        },
        playerId,
      );
      offs.push(() => hew.cancel());
      const hewHandler = looseService(ctx.services, 'abilities')?.registerHandler(SKILL_IDS.whirlingHew, () => hew.start());
      if (hewHandler?.ok) offs.push(hewHandler.dispose);
      else warn(`warden: Whirling Hew handler not registered (${hewHandler ? hewHandler.reason : 'no abilities service'})`);

      const grit = new GritTeeth(
        {
          events: ctx.events,
          now: () => ctx.clock.seconds,
          learned,
          staggered: () => verbs()?.staggered === true,
          fx: (seconds) => followFx(GRIT_TEETH.effect, seconds),
          skillId: SKILL_IDS.gritTeeth,
        },
        playerId,
      );
      offs.push(() => grit.dispose());
      offs.push(ctx.damage.addModifier(GRIT_TEETH.modifierId, (req, target) => grit.modify(req, target.id), GRIT_TEETH.order));

      const chant = new BloodChant(
        {
          events: ctx.events,
          actors: ctx.actors as never,
          now: () => ctx.clock.seconds,
          learned,
          status: () => svc('status'),
          blockedReason: () => blockedNow(false),
          fx: (seconds) => followFx(BLOOD_CHANT.effect, seconds),
          reportTrigger: trigger,
          deepWoundId: DEEP_WOUND.id,
          skillId: SKILL_IDS.bloodChant,
          warn,
        },
        playerId,
      );
      offs.push(() => chant.dispose());
      const chantHandler = looseService(ctx.services, 'abilities')?.registerHandler(SKILL_IDS.bloodChant, () => chant.start());
      if (chantHandler?.ok) offs.push(chantHandler.dispose);
      else warn(`warden: Blood Chant handler not registered (${chantHandler ? chantHandler.reason : 'no abilities service'})`);

      const kit = svc<ClassesLike>('classes')?.registerKit(WARDEN_KIT);
      if (kit?.ok) offs.push(kit.dispose);
      else warn(`warden: kit not registered (${kit ? kit.reason : 'no classes service'})`);

      // Codex how-to entries: bound lazily, thread 8's `codex.register` may not exist yet (PR #55).
      let offCodex: (() => void) | null = null;
      offs.push(() => offCodex?.());
      const bindCodex = (): void => {
        if (offCodex) return;
        const codex = svc<{ register?(e: readonly object[]): () => void }>('codex');
        if (!codex?.register) return;
        offCodex = codex.register(WARDEN_CODEX_ENTRIES.map((e) => ({ tab: 'howto', id: e.id, nameKey: e.nameKey, bodyKey: e.bodyKey })));
      };
      bindCodex();

      offs.push(
        (ctx.events as unknown as { on(t: string, f: (p: { skillId?: string }) => void): () => void }).on('skill.learned', (e) => {
          // Learning does not re-evaluate the max-health modifiers by itself (a respec does).
          if (e.skillId === SKILL_IDS.thickSkin) progression()?.refreshMaxHealth?.();
          const entry = WARDEN_CODEX_ENTRIES.find((c) => c.skillId === e.skillId);
          if (entry) svc<{ unlock?(id: string): void }>('codex')?.unlock?.(entry.id);
        }),
        ctx.events.on('class.changed', (e) => {
          if (e.classId === WARDEN_CLASS_ID && e.previous !== WARDEN_CLASS_ID) return;
          combat.reset();
          boulder.cancel();
          hew.cancel();
          grit.reset();
          chant.reset();
        }),
        ctx.events.on('save.loaded', () => {
          boulder.cancel();
          hew.cancel();
        }),
        ctx.systems.add({
          id: 'warden.fixed',
          fixedPhase: 'afterCombat',
          order: 120,
          fixedUpdate() {
            bindCodex();
            if (boulder.charging && !learned(SKILL_IDS.boulderShoulder)) boulder.cancel();
            combat.tick();
            boulder.tick();
            if (hew.spinning && !learned(SKILL_IDS.whirlingHew)) hew.cancel();
            hew.tick();
            grit.tick();
            chant.tick();
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

export default wardenPlugin;
