import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { DamageResult } from '../../actors/DamageResolver';
import { registerHeavyClip } from '../../combat/heavyBlow';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { AttackSet } from '../../player/attackSets';
import { registerClassSkills } from '../../progression/skills';
import type { VfxService } from '../../vfx/types';
import { ASHBLADE_ATTACK_SET, ASHBLADE_HEAVY_CLIP } from './attackSet';
import { ASHBLADE_KIT } from './kit';
import { backSlitModifier, BACK_SLIT_ORDER, bleedingEmberHandler, sparkDodgeHandler } from './passives';
import { ASHBLADE_SKILLS } from './skills';
import { ashCloudHandler, QuietSoles, type StealthHooks } from './stealthSkills';
import { ASHBLADE_STRINGS_EN } from './strings.en';
import { createAshbladeForms } from './surgeForms';
import { SootCloak, TwinFangs, WallSkitter } from './tier3';
import { ASH_CLOUD, ASH_DRIFT, CLASS_ID, QUICK_SLIP, SKILL, SOOT_CLOAK, TWIN_FANGS, TWIN_FANGS_ORDER, WALL_SKITTER } from './tuning';

type Loose = { get(name: string): unknown };
type Disposable = () => void;
const scratch = new THREE.Vector3();
let active: Disposable[] = [];

const CODEX_ENTRY = { tab: 'howto', id: 'ashblade-craft', nameKey: 'codex.howto.ashblade-craft.name', bodyKey: 'codex.howto.ashblade-craft.body' } as const;

/**
 * The Ashblade at tiers 1 and 2 (thread 15): attack set, kit, skills, Surge forms and the stealth skills. Every service is
 * read loosely and at use, because most of them (`status`, `stealth`, `enemies.perception`, `codex.register`) land in other
 * threads' PRs; a missing one is a warning, never a failure.
 */
const ashbladePlugin: GamePlugin = {
  id: 'ashblade',
  // Registrations need their services to exist; `stealth` is deliberately not a dependency (its binding is lazy).
  dependsOn: ['core', 'classes', 'combat-verbs', 'progression', 'spells'],
  setup(ctx: GameContext) {
    for (const off of active.splice(0).reverse()) off();
    const offs: Disposable[] = (active = []);
    const svc = <T>(name: string): T | undefined => (ctx.services as unknown as Loose).get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const playerId = () => ctx.actors.player.id;
    const isAshblade = () => svc<ClassesService>('classes')?.current() === CLASS_ID;
    const learned = (id: string) => svc<{ learned(id: string): boolean }>('progression')?.learned(id) === true;
    const has = (id: string) => isAshblade() && learned(id);
    const trigger = (id: string) => () => void svc<{ reportTrigger?(id: string): boolean }>('abilities')?.reportTrigger?.(id);
    offs.push(ctx.strings.register('en', ASHBLADE_STRINGS_EN));

    // ---- skills ----
    const skills = registerClassSkills(CLASS_ID, ASHBLADE_SKILLS);
    if (skills.ok) offs.push(skills.dispose);
    else warn(`ashblade: skills refused (${skills.reason})`);

    // ---- attack set, heavy chop ----
    const verbs = svc<{
      registerAttackSet(id: string, set: AttackSet): { ok: boolean; dispose?(): void; reason?: string };
      addDodgeDistanceMultiplier?(id: string, mult: number | (() => number)): () => void;
      addInvulnerability?(source: string, seconds: number): () => void;
      holdForcedMove?(owner: string, move: { x: number; z: number; speed: number } | null): void;
    }>('combatVerbs');
    if (verbs) {
      const r = verbs.registerAttackSet(CLASS_ID, ASHBLADE_ATTACK_SET);
      if (r.ok) offs.push(() => r.dispose?.());
      else warn(`ashblade: attack set refused (${r.reason})`);
      offs.push(registerHeavyClip(ASHBLADE_HEAVY_CLIP));
      if (typeof verbs.addDodgeDistanceMultiplier === 'function') {
        offs.push(verbs.addDodgeDistanceMultiplier(SKILL.quickSlip, () => (has(SKILL.quickSlip) ? QUICK_SLIP.distanceScale : 1)));
      } else warn('ashblade: combatVerbs.addDodgeDistanceMultiplier is absent, Quick Slip is inert');
    }

    // ---- kit ----
    const kit = svc<ClassesService>('classes')?.registerKit(ASHBLADE_KIT);
    if (kit && kit.ok) offs.push(kit.dispose);
    else if (kit) warn(`ashblade: kit refused (${kit.reason})`);

    // ---- Surge forms ----
    const spells = svc<{ registerSurgeForm(c: string, z: 'warm' | 'blaze' | 'cinder', i: never): { ok: boolean; dispose?(): void; reason?: string } }>('spells');
    const vfx = () => svc<VfxService>('vfx');
    const forms = createAshbladeForms({
      interiorAt: (p) => svc<{ interiorAt(p: unknown): string | null }>('interiors')?.interiorAt(p) ?? null,
      currentInterior: () => svc<{ current: string | null }>('interiors')?.current ?? null,
      raycast: (origin, dir, max) => {
        const hit = ctx.physics.raycast(origin, dir, max, ctx.world.player.controller.collider);
        return hit ? { distance: hit.distance, point: hit.point } : null;
      },
      teleport: (feet, yaw) => void ctx.player.teleport(feet, yaw),
      invulnerable: (seconds) => verbs?.addInvulnerability?.(ASH_DRIFT.source, seconds) ?? null,
      arrive: () => {
        const root = ctx.world.avatar?.root;
        if (root) vfx()?.dissolve(root, ASH_DRIFT.dissolveSeconds, { reverse: true }).catch(() => undefined);
      },
      warn,
    });
    if (spells) {
      for (const zone of ['warm', 'blaze', 'cinder'] as const) {
        const r = spells.registerSurgeForm(CLASS_ID, zone, forms[zone] as never);
        if (r.ok) offs.push(() => r.dispose?.());
        else warn(`ashblade: Surge form ${zone} refused (${r.reason})`);
      }
    }

    // ---- passives (registered once; each checks `learned` at use) ----
    offs.push(ctx.damage.addModifier('ashblade-back-slit', backSlitModifier({ playerId, active: () => has(SKILL.backSlit), triggered: () => { if (!twin.applying) trigger(SKILL.backSlit)(); } }), BACK_SLIT_ORDER));
    const statusPort = {
      status: () => svc<{ apply: never }>('status') as never,
      warn,
    };
    const bleed = bleedingEmberHandler({ ...statusPort, playerId, active: () => has(SKILL.bleedingEmber), triggered: trigger(SKILL.bleedingEmber) });
    offs.push(ctx.events.on('damage.dealt', (r: DamageResult) => bleed(r)));
    const spark = sparkDodgeHandler({
      ...statusPort,
      playerId,
      active: () => has(SKILL.sparkDodge),
      tick: () => ctx.clock.tick,
      feet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
      hostilesNear: (p, radius) => {
        const out: { id: string; state: string | undefined }[] = [];
        const enemies = svc<{ view(id: string): { state: string } | undefined }>('enemies');
        for (const a of ctx.actors.all()) {
          if (a.team !== 'hostile' || a.dead || !a.root) continue;
          const w = a.worldPosition(scratch);
          if (Math.hypot(w.x - p.x, w.z - p.z) <= radius) out.push({ id: a.id, state: enemies?.view(a.id)?.state });
        }
        return out;
      },
      spark: (at) => void vfx()?.spawnEffect('ember-burst', { position: at }, { count: 24 }),
      triggered: trigger(SKILL.sparkDodge),
    });
    offs.push(ctx.events.on('player.dodged', (e) => spark(e.attackerId)));

    // ---- stealth skills ----
    const stealth = () => svc<StealthHooks>('stealth');
    const soles = new QuietSoles(() => has(SKILL.quietSoles), stealth, warn);
    const cloud = ashCloudHandler({
      isAshblade,
      stealth,
      feet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
      facingYaw: () => ctx.player.facingYaw,
      wallAhead: (from, dir, max) => {
        const hit = ctx.physics.raycast({ x: from.x, y: from.y + ASH_DRIFT.chestHeight, z: from.z }, { x: dir.x, y: 0, z: dir.z }, max, ctx.world.player.controller.collider);
        return hit ? hit.distance : null;
      },
      groundAt: (x, z, nearY) => {
        const hit = ctx.physics.raycast({ x, y: nearY + 1.5, z }, { x: 0, y: -1, z: 0 }, 4, ctx.world.player.controller.collider);
        return hit ? hit.point.y : null;
      },
      spawnCloud: (at, radius, seconds) => void vfx()?.spawnEffect(ASH_CLOUD.effectId, { position: at, scale: radius }, { seconds }),
      throwClip: () => void ctx.world.avatar?.controller.playOneShot(ASH_CLOUD.clip, { lockMove: true }),
      perceptionPresent: () => !!(svc<{ perception?: unknown }>('enemies') as { perception?: unknown } | undefined)?.perception,
      warn,
    });
    let cloudBound = false;
    let codexBound = false;
    const bindLate = () => {
      if (cloudBound && codexBound) return;
      const abilities = svc<{ registerHandler(id: string, h: never): { ok: boolean; dispose?(): void } }>('abilities');
      if (!cloudBound && abilities) {
        cloudBound = true;
        const r = abilities.registerHandler(SKILL.ashCloud, cloud as never);
        if (r.ok) offs.push(() => r.dispose?.());
        else warn('ashblade: the Ash Cloud handler is already registered');
      }
      const codex = svc<{ register?(entries: readonly unknown[]): () => void }>('codex');
      if (!codexBound && codex && typeof codex.register === 'function') {
        codexBound = true;
        offs.push(codex.register([CODEX_ENTRY]));
      }
    };
    bindLate();
    offs.push(ctx.systems.add({
      id: 'ashblade.fixed',
      fixedPhase: 'rules',
      order: 520,
      fixedUpdate() {
        // Services from other threads' PRs may appear late; checking twice a second is plenty.
        if (ctx.clock.tick % 30 === 0) bindLate();
        soles.tick();
      },
      dispose() {
        soles.release();
      },
    }));

    // ---- tier 3 (Act 2): Twin Fangs, Soot Cloak, Wall Skitter ----
    const twin = new TwinFangs({
      playerId,
      active: () => has(SKILL.twinFangs),
      tick: () => ctx.clock.tick,
      targetOk: (id) => {
        const a = ctx.actors.get(id);
        return !!a && !a.dead && a.team === 'hostile' && (a.mercyState?.() ?? 'none') === 'none';
      },
      apply: (req) => void ctx.damage.apply(req),
      flash: (id) => {
        const a = ctx.actors.get(id);
        if (a?.root) vfx()?.spawnEffect(TWIN_FANGS.effectId, { position: a.worldPosition(scratch).clone(), normal: { x: 0, y: 1, z: 0 } });
      },
    });
    offs.push(ctx.damage.addModifier('ashblade-twin-fangs', twin.modifier, TWIN_FANGS_ORDER));
    offs.push(ctx.events.on('damage.dealt', (r: DamageResult) => twin.onDealt(r)));
    const sootCloak = new SootCloak({
      active: () => has(SKILL.sootCloak),
      stealth,
      tick: () => ctx.clock.tick,
      feet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
      dodging: () => ctx.world.avatar?.controller.currentAction === 'dodge',
      playerId,
      effect: () => {
        const h = vfx()?.spawnEffect(SOOT_CLOAK.effectId, { position: { ...ctx.player.feet }, attach: ctx.world.avatar?.root }, { seconds: SOOT_CLOAK.seconds });
        return h ? () => h.stop() : null;
      },
      warn,
    });
    offs.push(ctx.events.on('damage.dealt', (r: DamageResult) => sootCloak.onDealt(r)));
    let leanRoot: THREE.Object3D | null = null;
    let leanBase = 0;
    const lean = (radians: number) => {
      const root = ctx.world.avatar?.root ?? null;
      if (leanRoot && leanRoot !== root) leanRoot.rotation.z = leanBase;
      if (!root) {
        leanRoot = null;
        return;
      }
      if (leanRoot !== root) {
        leanRoot = root;
        leanBase = root.rotation.z;
      }
      root.rotation.z = leanBase + radians;
      if (radians === 0) leanRoot = null;
    };
    const controller = () => ctx.world.player.controller;
    const skitter = new WallSkitter({
      active: () => has(SKILL.wallSkitter),
      grounded: () => controller().grounded,
      wallContact: () => controller().wallContact(),
      wallSlide: (max) => controller().wallSlide(max),
      jumpPressed: () => ctx.input.actions.pressed('jump'),
      launch: (speed) => controller().launch(speed),
      holdMove: (move) => verbs?.holdForcedMove?.(WALL_SKITTER.kickOwner, move),
      facingYaw: () => ctx.player.facingYaw,
      lean,
      effect: () => void vfx()?.spawnEffect(WALL_SKITTER.effectId, { position: { ...ctx.player.feet } }),
    });
    if (!verbs || typeof verbs.holdForcedMove !== 'function') warn('ashblade: combatVerbs.holdForcedMove is absent, the Wall Skitter kick has no push');
    // Before the combat verbs (order 10) so a kick's forced move is picked up the tick it is set.
    offs.push(ctx.systems.add({ id: 'ashblade.tier3.intent', fixedPhase: 'intent', order: 5, fixedUpdate: () => skitter.tick(), dispose: () => skitter.reset() }));
    offs.push(ctx.systems.add({
      id: 'ashblade.tier3.rules',
      fixedPhase: 'rules',
      order: 521,
      fixedUpdate() {
        twin.tick();
        sootCloak.tick();
      },
      dispose() {
        twin.clear();
        sootCloak.end();
      },
    }));
    const resetTier3 = () => {
      twin.clear();
      sootCloak.reset();
      skitter.reset();
    };
    offs.push(ctx.events.on('save.loaded', resetTier3));
    offs.push(ctx.events.on('actor.died', (e) => void (e.actorId === playerId() && resetTier3())));

  },
  dispose() {
    for (const off of active.splice(0).reverse()) off();
  },
};

export default ashbladePlugin;
