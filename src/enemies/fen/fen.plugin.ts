import type { GamePlugin } from '../../core/plugins';
import { resolveLayout } from '../../region/resolveLayout';
import { heightAt } from '../../terrain/heightfield';
import { GREYFEN_CODEX, GREYFEN_CODEX_KINDS, GREYFEN_CODEX_SIGHT } from './codex';
import { FireDedupe, fenPoise, isFireHit } from './fire';
import { BOG_RADIUS, GREYFEN_FAUNA_GROUPS, GREYFEN_FAUNA_LAYOUT, groupCentre } from './greyfenFauna.layout';
import { registerPeatPatch } from './peat';
import { FEN_STRINGS_EN } from './strings.en';
import { FEN_TUNING } from './tuning';
import '../act3Spawners';

/** The Greyfen's kill XP region factor (plan 7.2, coordinator ruling A): reused kinds pay x 1.8 there, the new rows are stored /1.8. */
export const GREYFEN_KILL_XP_FACTOR = 1.8;
/** After the enemies' own modifiers (moves, guard, core), in the buffs band. */
export const FEN_FIRE_ORDER = 20;
const FEN_KINDS: readonly string[] = ['fen-leech', 'peat-shambler'];
const CODEX_PERIOD = 0.5;

type CodexLike = { register?(entries: unknown[]): () => void; unlock?(id: string): void };
type EnemyLike = { id: string; def: { kind: string }; active: boolean; feet: { x: number; z: number } };
type GroundApi = { all(): EnemyLike[]; get(id: string): EnemyLike | undefined };

/**
 * K6b PR 1, the Greyfen creatures (plans/act3-K6b.md): the `greyfen.fauna.*` anchors and the ambient bogs' peat patches,
 * the Greyfen kill XP region factor, the fire rule (a fire hit or a heavy chop breaks a leech; fire takes 50 more poise from a
 * shambler; a landed ignite counts as a fire hit), the bestiary entries and their first-sight unlock, and the strings. The
 * creatures themselves (defs, bodies, overlays, spawners) live in `enemies/` and run without this plugin.
 */
const plugin: GamePlugin = {
  id: 'fen-creatures',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    const svc = ctx.services as unknown as { get(name: string): unknown };
    offs.push(ctx.strings.register('en', FEN_STRINGS_EN) as unknown as () => void);

    // ---- anchors and peat patches
    for (const a of resolveLayout(GREYFEN_FAUNA_LAYOUT, heightAt).anchors) {
      offs.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
    }
    for (const g of GREYFEN_FAUNA_GROUPS) {
      if (g.kind !== 'shambler') continue;
      const c = groupCentre(g);
      offs.push(registerPeatPatch({ id: `greyfen.${g.id}`, x: c.x, z: c.z, radius: BOG_RADIUS }));
    }

    // ---- kill XP region factor (K0 item 27)
    const factor = ctx.services.get('killXpRegionFactor');
    if (factor) offs.push(factor.set('greyfen', GREYFEN_KILL_XP_FACTOR));
    else console.warn('[fen] the killXpRegionFactor service is missing; Greyfen kills pay x 1');

    // ---- fire and heavy hits
    const ground = (): GroundApi | undefined => (ctx.services.get('enemies') as unknown as { ground?: GroundApi } | undefined)?.ground;
    const kindOf = (id: string): string | undefined => ground()?.get(id)?.def.kind;
    const dedupe = new FireDedupe();
    offs.push(
      ctx.damage.addModifier(
        'fen.fire',
        (req, target, attacker) => {
          if (req.outcome !== 'hit' || req.kind === 'status' || req.kind === 'script' || !attacker) return;
          if (attacker.team !== 'player' && attacker.team !== 'ally') return;
          const kind = kindOf(target.id);
          if (!kind || !FEN_KINDS.includes(kind)) return;
          const fire = isFireHit(req) && dedupe.take(target.id);
          req.poise = fenPoise(kind, req, target.poise, fire);
        },
        FEN_FIRE_ORDER,
      ),
    );
    offs.push(
      ctx.events.on('status.applied', (p) => {
        if (p.kind !== 'ignite') return;
        const kind = kindOf(p.actorId);
        if (!kind || !FEN_KINDS.includes(kind) || !dedupe.take(p.actorId)) return;
        const target = ctx.actors.get(p.actorId);
        if (!target || target.dead) return;
        const poise = kind === 'fen-leech' ? target.poise : FEN_TUNING.shambler.firePoise;
        ctx.damage.apply({ attackerId: null, targetId: p.actorId, amount: 0, poise, kind: 'script', attackId: 'fen.ignite' });
      }),
    );
    offs.push(ctx.events.on('actor.despawned', (p) => dedupe.forget(p.actorId)));
    offs.push(ctx.events.on('save.loaded', () => dedupe.clear()));

    // ---- codex (bound lazily: the codex plugin may set up after this one)
    let offCodex: (() => void) | null = null;
    const codex = (): CodexLike | undefined => svc.get('codex') as CodexLike | undefined;
    const bindCodex = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register(GREYFEN_CODEX as unknown[]);
    };
    offs.push(() => offCodex?.());
    bindCodex();

    let codexClock = 0;
    offs.push(
      ctx.systems.add({
        id: 'fen-creatures.tick',
        fixedPhase: 'afterCombat',
        order: 41,
        fixedUpdate(dt) {
          dedupe.step(dt);
          codexClock += dt;
          if (codexClock < CODEX_PERIOD) return;
          codexClock = 0;
          bindCodex();
          const c = codex();
          const all = ground()?.all();
          if (!c?.unlock || !all) return;
          const f = ctx.player.feet;
          for (const e of all) {
            if (!(GREYFEN_CODEX_KINDS as readonly string[]).includes(e.def.kind) || !e.active) continue;
            if (Math.hypot(e.feet.x - f.x, e.feet.z - f.z) <= GREYFEN_CODEX_SIGHT) c.unlock(e.def.kind);
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
