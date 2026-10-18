import type { StatusService } from '../../actors/status';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { SpellsService } from '../../spells/types';
import { heightAt } from '../../terrain/heightfield';
import type { Vec3 } from '../../vfx/ports';
import '../types';
import { EMBERWRIGHT_KIT } from './kit';
import type { EmberwrightHost } from './ports';
import { EmberwrightRuntime } from './runtime';
import { SKILL, registerEmberwrightSkills } from './skills';
import { EMBERWRIGHT_STRINGS_EN } from './strings.en';
import { surgeFormsFor } from './surgeForms';
import { CLASS_ID, EMBERWRIGHT_ATTACK_SET } from './tuning';

const RETRY_SECONDS = 1;
const CODEX = [
  { tab: 'howto', slug: 'emberwright-ember', id: 'emberwright-ember' },
  { tab: 'howto', slug: 'emberwright-keys', id: 'emberwright-keys' },
] as const;

type Loose = { get(name: string): unknown };
interface EnemiesPush { push?(actorId: string, o: { dir: Vec3; metres: number }): boolean }
interface CodexPort { register(entries: ReadonlyArray<{ tab: string; id: string; nameKey: string; bodyKey: string }>): () => void }
interface VfxPort {
  spawnEffect?(id: string, t: { position: Vec3; scale?: number }, params?: Record<string, unknown>): unknown;
  pulseScreen?(strength: number, seconds: number, color?: number): void;
}

/**
 * The Emberwright class (tiers 1 and 2): kit, attack set, three Surge forms, six skills and their spells. Everything it
 * registers is disposed with the plugin, except the skills (the registry has no unregister and a restart counts as success).
 * Registrations whose service is not there yet retry once a second, so the plugin loads before #53 and the codex PR.
 */
const plugin: GamePlugin = {
  id: 'emberwright',
  dependsOn: ['core', 'progression', 'combat-verbs', 'classes', 'spells'],
  setup(ctx: GameContext) {
    const offs: Array<() => void> = [];
    const loose = ctx.services as unknown as Loose;
    const svc = <T>(name: string): T | undefined => loose.get(name) as T | undefined;
    ctx.strings.register('en', EMBERWRIGHT_STRINGS_EN);
    registerCodexStrings(ctx);

    const spells = (): SpellsService | undefined => svc<SpellsService>('spells');
    const host: EmberwrightHost = {
      events: ctx.events as never,
      actors: ctx.actors as never,
      player: ctx.player as never,
      damage: ctx.damage as never,
      ember: () => {
        const s = spells();
        return s ? { value: s.ember, max: s.maxEmber, spend: (n) => s.spendEmber(n), restore: (n) => s.restoreEmber(n) } : null;
      },
      status: () => svc<StatusService>('status'),
      // One adapter for thread 5's push (draft PR #53): enemies.push(actorId, { dir, metres }).
      push: (id, dir, metres) => svc<EnemiesPush>('enemies')?.push?.(id, { dir, metres }) ?? false,
      learned: (id) => svc<{ learned(id: string): boolean }>('progression')?.learned(id) === true,
      classId: () => svc<{ classId?: string | null }>('progression')?.classId ?? null,
      avatarClass: () => ctx.player.avatar?.classId ?? null,
      lockOnTarget: () => svc<{ targetId: string | null }>('lockOn')?.targetId ?? null,
      blocked: (from, to) => {
        const dir = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
        const dist = Math.hypot(dir.x, dir.y, dir.z);
        if (dist < 1e-6) return false;
        const hit = ctx.physics.raycast(from, dir, dist, ctx.world.player.controller.collider);
        return !!hit && hit.distance < dist - 0.3;
      },
      rayCast: (origin, dir, maxDist) => {
        const hit = ctx.physics.raycast(origin, dir, maxDist, ctx.world.player.controller.collider);
        return hit ? { point: { x: origin.x + dir.x * hit.distance, y: origin.y + dir.y * hit.distance, z: origin.z + dir.z * hit.distance } } : null;
      },
      heightAt,
      fx: (id, at, params) => {
        try { svc<VfxPort>('vfx')?.spawnEffect?.(id, { position: at, scale: (params?.scale as number | undefined) ?? 1 }, params); } catch { /* an effect must never break a cast */ }
      },
      fizzle: () => svc<VfxPort>('vfx')?.pulseScreen?.(0.15, 0.2, 0x806040),
    };
    const rt = new EmberwrightRuntime(host);
    offs.push(() => rt.dispose());
    offs.push(ctx.damage.addModifier('emberwright-staff', (req) => rt.meleeModifier(req as never), -150));

    // The controller of the worn avatar: clip starts (the fizzle cue and the Gust Step push).
    let offAvatar: (() => void) | null = null;
    const bindAvatar = (): void => {
      offAvatar?.();
      offAvatar = ctx.player.avatar?.controller.events.subscribe((e) => {
        if (e.type !== 'clipStart') return;
        rt.onClipStart(e.clip);
        rt.onClipStartDodge(e.clip);
      }) ?? null;
    };
    bindAvatar();
    offs.push(ctx.events.on('player.avatar', bindAvatar), () => offAvatar?.());

    // ---- registrations (retried until every service is there)
    const done = new Set<string>();
    const once = (key: string, fn: () => boolean): void => {
      if (done.has(key)) return;
      try {
        if (fn()) done.add(key);
      } catch (err) {
        done.add(key);
        console.warn(`[emberwright] ${key} registration failed`, err);
      }
    };
    const bind = (): void => {
      once('skills', () => registerEmberwrightSkills().ok);
      once('attacks', () => {
        const cv = svc<{ registerAttackSet(id: string, set: typeof EMBERWRIGHT_ATTACK_SET): { ok: boolean; dispose?(): void; reason?: string } }>('combatVerbs');
        if (!cv) return false;
        const r = cv.registerAttackSet(CLASS_ID, EMBERWRIGHT_ATTACK_SET);
        if (r.ok && r.dispose) offs.push(r.dispose);
        else if (!r.ok) console.warn(`[emberwright] attack set refused (${r.reason}); the class swings with the Knight set`);
        return true;
      });
      once('surge', () => {
        const s = spells();
        if (!s) return false;
        for (const [zone, form] of surgeFormsFor(rt)) {
          const r = s.registerSurgeForm(CLASS_ID, zone, form);
          if (r.ok) offs.push(r.dispose);
          else console.warn(`[emberwright] Surge form ${zone} refused (${r.reason})`);
        }
        return true;
      });
      once('kit', () => {
        const classes = svc<{ registerKit(k: typeof EMBERWRIGHT_KIT): { ok: true; dispose(): void } | { ok: false; reason: string } }>('classes');
        if (!classes) return false;
        const r = classes.registerKit(EMBERWRIGHT_KIT);
        if (r.ok) offs.push(r.dispose);
        else console.warn(`[emberwright] kit refused (${r.reason})`);
        return true;
      });
      once('abilities', () => {
        const abilities = svc<{ registerHandler(id: string, h: (a: unknown) => { ok: true } | { ok: false; reason: string }): { ok: boolean; dispose?(): void } }>('abilities');
        if (!abilities) return false;
        for (const id of [SKILL.flameLash, SKILL.anvilDrop, SKILL.warmBreath]) {
          const r = abilities.registerHandler(id, () => rt.castAbility(id));
          if (r.ok && r.dispose) offs.push(r.dispose);
        }
        return true;
      });
      once('codex', () => {
        const codex = svc<CodexPort>('codex');
        if (typeof codex?.register !== 'function') return false;
        offs.push(codex.register(CODEX.map((c) => ({ tab: c.tab, id: c.id, nameKey: `codex.${c.tab}.${c.slug}.name`, bodyKey: `codex.${c.tab}.${c.slug}.body` }))));
        return true;
      });
    };
    bind();

    let retry = 0;
    offs.push(
      ctx.systems.add({
        id: 'emberwright',
        fixedPhase: 'afterCombat',
        order: 110,
        fixedUpdate(dt) {
          rt.update(dt);
          retry += dt;
          if (retry >= RETRY_SECONDS) {
            retry = 0;
            bind();
          }
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

let cleanup: (() => void) | null = null;

function registerCodexStrings(ctx: GameContext): void {
  ctx.strings.register('en', {
    'codex.howto.emberwright-ember.name': 'Ember and spells',
    'codex.howto.emberwright-ember.body': 'Your staff spends Ember: key 1 costs 3, key 2 costs 5, key 3 costs 12 and key 4 costs 6. With too little Ember the staff only taps. Ember returns two seconds after you stop casting, and a Heartshard Surge gives 40% back.',
    'codex.howto.emberwright-keys.name': 'The Emberwright\'s keys',
    'codex.howto.emberwright-keys.body': 'Key 1 hurls a bolt, key 2 sprays three sparks, key 3 sends a slow flame ball and key 4 rings you with cinders. Learn Ember Bolt to set targets alight; Forge Spark makes key 2 arc between foes.',
  });
}

export default plugin;
