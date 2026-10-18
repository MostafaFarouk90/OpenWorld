import * as THREE from 'three';
import type { ClassesService } from '../../actors/classes';
import type { DamageResult } from '../../actors/DamageResolver';
import * as heavyBlow from '../../combat/heavyBlow';
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
import { ASH_CLOUD, ASH_DRIFT, CLASS_ID, QUICK_SLIP, SKILL } from './tuning';

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
    const offs: Disposable[] = (active = []);
    const svc = <T>(name: string): T | undefined => (ctx.services as unknown as Loose).get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const playerId = () => ctx.actors.player.id;
    const isAshblade = () => svc<ClassesService>('classes')?.current() === CLASS_ID;
    const learned = (id: string) => svc<{ learned(id: string): boolean }>('progression')?.learned(id) === true;
    const has = (id: string) => isAshblade() && learned(id);
    const trigger = (id: string) => () => void svc<{ reportTrigger?(id: string): boolean }>('abilities')?.reportTrigger?.(id);
    ctx.strings.register('en', ASHBLADE_STRINGS_EN);

    // ---- skills (no dispose exists; a repeat setup in one process is a warned no-op) ----
    const skills = registerClassSkills(CLASS_ID, ASHBLADE_SKILLS);
    if (!skills.ok && skills.reason !== 'duplicate-class') warn(`ashblade: skills refused (${skills.reason})`);

    // ---- attack set, heavy chop ----
    const verbs = svc<{
      registerAttackSet(id: string, set: AttackSet): { ok: boolean; dispose?(): void; reason?: string };
      addDodgeDistanceMultiplier?(id: string, mult: number | (() => number)): () => void;
      addInvulnerability?(source: string, seconds: number): () => void;
    }>('combatVerbs');
    if (verbs) {
      const r = verbs.registerAttackSet(CLASS_ID, ASHBLADE_ATTACK_SET);
      if (r.ok) offs.push(() => r.dispose?.());
      else warn(`ashblade: attack set refused (${r.reason})`);
      const reg = (heavyBlow as unknown as { registerHeavyClip?: (clip: string) => (() => void) | void }).registerHeavyClip;
      if (typeof reg === 'function') {
        const off = reg(ASHBLADE_HEAVY_CLIP);
        if (typeof off === 'function') offs.push(off);
      } else warn('ashblade: heavyBlow.registerHeavyClip is absent, the crossed chop is not a heavy blow');
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
    offs.push(ctx.damage.addModifier('ashblade-back-slit', backSlitModifier({ playerId, active: () => has(SKILL.backSlit), triggered: trigger(SKILL.backSlit) }), BACK_SLIT_ORDER));
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
    offs.push(ctx.events.on('player.dodged', () => spark()));

    // ---- stealth skills ----
    const stealth = () => svc<StealthHooks>('stealth');
    const soles = new QuietSoles(() => has(SKILL.quietSoles), stealth, warn);
    const cloud = ashCloudHandler({
      isAshblade,
      stealth,
      feet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
      facingYaw: () => ctx.player.facingYaw,
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
    ctx.systems.add({
      id: 'ashblade.fixed',
      fixedPhase: 'rules',
      order: 520,
      fixedUpdate() {
        bindLate();
        soles.tick();
      },
      dispose() {
        soles.release();
      },
    });

  },
  dispose() {
    for (const off of active.splice(0).reverse()) off();
  },
};

export default ashbladePlugin;
