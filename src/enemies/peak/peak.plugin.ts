import type { GamePlugin } from '../../core/plugins';
import { isHeavyBlow } from '../../combat/heavyBlow';
import { resolveLayout } from '../../region/resolveLayout';
import { heightAt } from '../../terrain/heightfield';
import { AERIE_WYRMS_AWAY_FLAG } from '../act3Spawners';
import { DRAGONSPINE_CODEX, DRAGONSPINE_CODEX_KINDS, DRAGONSPINE_CODEX_SIGHT } from './codex';
import { DRAGONSPINE_FAUNA_LAYOUT } from './dragonspineFauna.layout';
import { PEAK_STRINGS_EN } from './strings.en';
import { OGRE } from './tuning';
import '../act3Spawners';

/** The Dragonspine's kill XP region factor (plan 7.2): reused kinds pay x 1.8 there, the new rows are stored /1.8. */
export const DRAGONSPINE_KILL_XP_FACTOR = 1.8;
/** After the enemies' own modifiers, in the buffs band (beside the fen's fire rule). */
export const PEAK_POISE_ORDER = 21;
/** Corvin Skarl's boss id (K8) and D06's quest id, read by id only. */
export const SKARL_BOSS_ID = 'corvin-skarl';
export const D06_QUEST_ID = 'd06';
const CODEX_PERIOD = 0.5;

type CodexLike = { register?(entries: unknown[]): () => void; unlock?(id: string): void };
type EnemyLike = { id: string; def: { kind: string }; active: boolean; feet: { x: number; z: number } };
type GroundApi = { all(): EnemyLike[]; get(id: string): EnemyLike | undefined };
type BossesLike = { state(id: string): { outcome: string | null } | null } | undefined;
type QuestsLike = { active?(): string[] } | undefined;

/** Skarl's fight is armed: his boss is registered and undecided, or D06 is active. */
export function skarlFightArmed(bosses: BossesLike, quests: QuestsLike): boolean {
  const s = bosses?.state(SKARL_BOSS_ID);
  if (s && s.outcome === null) return true;
  return quests?.active?.().includes(D06_QUEST_ID) ?? false;
}

/** A heavy chop on a Crag Ogre deals double poise (design 10 row 12). */
export function ogrePoise(req: { attackId?: string; poise: number }): number {
  return isHeavyBlow(req) ? req.poise * OGRE.heavyPoiseMultiplier : req.poise;
}

/**
 * K6b PR 2, the Dragonspine creatures (plans/act3-K6b-pr2.md): the `dragonspine.fauna.*` anchors, the Dragonspine kill XP
 * region factor, the ogre's heavy-chop rule, the bestiary entries and their first-sight unlock, the strings, and the Aerie
 * wyrms' send-off while Skarl's fight is armed (a flag their gate's `until` reads). The creatures themselves run without it.
 */
const plugin: GamePlugin = {
  id: 'peak-creatures',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    const svc = ctx.services as unknown as { get(name: string): unknown };
    offs.push(ctx.strings.register('en', PEAK_STRINGS_EN) as unknown as () => void);

    for (const a of resolveLayout(DRAGONSPINE_FAUNA_LAYOUT, heightAt).anchors) {
      offs.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
    }

    const factor = ctx.services.get('killXpRegionFactor');
    if (factor) offs.push(factor.set('dragonspine', DRAGONSPINE_KILL_XP_FACTOR));
    else console.warn('[peak] the killXpRegionFactor service is missing; Dragonspine kills pay x 1');

    const ground = (): GroundApi | undefined => (ctx.services.get('enemies') as unknown as { ground?: GroundApi } | undefined)?.ground;
    offs.push(
      ctx.damage.addModifier(
        'peak.ogre-poise',
        (req, target, attacker) => {
          if (req.outcome !== 'hit' || req.kind === 'status' || req.kind === 'script' || !attacker) return;
          if (attacker.team !== 'player' && attacker.team !== 'ally') return;
          if (ground()?.get(target.id)?.def.kind !== 'crag-ogre') return;
          req.poise = ogrePoise(req);
        },
        PEAK_POISE_ORDER,
      ),
    );

    let offCodex: (() => void) | null = null;
    const codex = (): CodexLike | undefined => svc.get('codex') as CodexLike | undefined;
    const bindCodex = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register(DRAGONSPINE_CODEX as unknown[]);
    };
    offs.push(() => offCodex?.());
    bindCodex();

    const syncAerie = (): void => {
      const armed = skarlFightArmed(ctx.bosses as unknown as BossesLike, svc.get('quests') as QuestsLike);
      if (ctx.state.getBool(AERIE_WYRMS_AWAY_FLAG, false) !== armed) ctx.state.setFlag(AERIE_WYRMS_AWAY_FLAG, armed);
    };
    offs.push(ctx.events.on('save.loaded', () => syncAerie()));

    let clock = 0;
    offs.push(
      ctx.systems.add({
        id: 'peak-creatures.tick',
        fixedPhase: 'afterCombat',
        order: 42,
        fixedUpdate(dt) {
          clock += dt;
          if (clock < CODEX_PERIOD) return;
          clock = 0;
          syncAerie();
          bindCodex();
          const c = codex();
          const all = ground()?.all();
          if (!c?.unlock || !all) return;
          const f = ctx.player.feet;
          for (const e of all) {
            if (!(DRAGONSPINE_CODEX_KINDS as readonly string[]).includes(e.def.kind) || !e.active) continue;
            if (Math.hypot(e.feet.x - f.x, e.feet.z - f.z) <= DRAGONSPINE_CODEX_SIGHT) c.unlock(e.def.kind);
          }
        },
      }) as unknown as () => void,
    );

    (plugin as { _offs?: Array<() => void> })._offs = offs;
  },
  dispose() {
    const offs = (plugin as { _offs?: Array<() => void> })._offs;
    for (const off of (offs ?? []).reverse()) off();
    (plugin as { _offs?: Array<() => void> })._offs = undefined;
  },
};

export default plugin;
