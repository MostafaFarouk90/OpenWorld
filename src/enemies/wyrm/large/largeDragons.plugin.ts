import type { GamePlugin } from '../../../core/plugins';
import { codexEntry } from '../../../codex/entries';
import { dragonspineBuild } from '../../../dragonspine/layout';
import '../../../quests/service';
import { heightAt } from '../../../terrain/heightfield';
import type { ActorId } from '../../ports';
import type { DrakesService } from '../drake/events';
import { SKARL_DRAKE } from '../drake/def';
import '../drake/events';
import '../events';
import { HathrenDirector, HATHREN_IDS } from '../hathren/director';
import type { HathrenService } from '../hathren/events';
import '../hathren/events';
import { DRAKE_STRINGS_EN, HATHREN_STRINGS_EN } from '../hathren/strings.en';
import { WYRM_HUB } from '../overlays';
import type { FlierHandle, Perch } from './flightExtras';
import { LODGE_WYRMS, lodgePerches } from './lodgeWyrms';

type CodexLike = { register?(entries: unknown[]): () => void; unlock?(id: string): void };

const CODEX = [codexEntry('lore', HATHREN_IDS.codexId, HATHREN_IDS.codexId), codexEntry('bestiary', 'skarl-drake', 'skarl-drake')];

/**
 * Act 3's large dragons (K6a PR 1, plans/act3-K6a.md): Hathren's M26 set piece (`hathren` service), Skarl's drake
 * (`drakes` service; the chain, the strike and the release for K8), the two resting lodge wyrms' perches and anchors, and
 * their codex entries. Ysmeryth's trial moveset is PR 2. Nothing here is saved: Hathren re-derives from the quest and
 * K12's flags, the drake's chain from its `until` flag, the lodge wyrms from `story.m34.complete`.
 */
const plugin: GamePlugin = {
  id: 'large-dragons',
  dependsOn: ['core', 'enemies', 'wyrms'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[large-dragons] ${m}`);
    const offs: Array<() => void> = [];
    offs.push(ctx.strings.register('en', { ...HATHREN_STRINGS_EN, ...DRAKE_STRINGS_EN }) ?? (() => {}));

    // ---- codex (bound lazily: the codex plugin may set up after this one)
    let offCodex: (() => void) | null = null;
    const codex = (): CodexLike | undefined => ctx.services.get('codex') as CodexLike | undefined;
    const bindCodex = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register(CODEX);
    };
    const unlock = (id: string): void => {
      bindCodex();
      codex()?.unlock?.(id);
    };
    offs.push(() => offCodex?.());
    const kindOf = (id: ActorId): string | undefined => (ctx.actors.get(id) as { kind?: string } | undefined)?.kind;
    offs.push(ctx.events.on('ai.aggro', (e) => kindOf(e.actorId) === 'skarl-drake' && unlock('skarl-drake')));

    // ---- Hathren
    const devHathren = !!import.meta.env?.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('hathren') === '1';
    const director = new HathrenDirector({
      scene: ctx.scene,
      cameraPosition: () => (ctx.camera ? ctx.camera.position : null),
      freezePlayer: (source) => ctx.player.addMoveModifier(source, { freeze: true }),
      cutscene: (source) => ctx.input.contexts.push('cutscene', source),
      camera: (shot) => ctx.cameraRig?.override(shot) ?? null,
      shake: (strength, seconds) => ctx.services.get('vfx')?.shake(strength * 0.3, seconds),
      // Dev `?hathren=1` before K12 lands: M26 has no def yet, so it reads as active to put her in the nets.
      questState: (id) => {
        const q = ctx.services.get('quests');
        if (devHathren && id === HATHREN_IDS.quest && !q?.get(id)) return 'active';
        return q?.state(id);
      },
      getBool: (k) => ctx.state.getBool(k),
      playerFeet: () => ctx.player.feet,
      anchor: (id) => ctx.anchors.find(id)?.position,
      heightAt,
      holdsScale: () => (ctx.services.get('inventory')?.count(HATHREN_IDS.scaleItem) ?? 0) > 0,
      emit: (beat) => ctx.events.emit('wyrm.hathren', { beat }),
      unlockCodex: unlock,
      warn,
    });
    const hathren: HathrenService = {
      get state() {
        return director.state;
      },
      netCut: (n) => director.netCut(n),
      calm: () => director.calm(),
      dismiss: () => director.dismiss(),
    };
    ctx.services.provide('hathren', hathren);
    offs.push(ctx.events.on('save.loaded', () => director.onLoaded()));
    offs.push(() => director.dispose());

    // ---- the lodge perches and anchors (K4's hall box; the dragonspine build is cached)
    const perches = new Map<number, Perch>();
    try {
      const hall = dragonspineBuild().lodge.hall;
      lodgePerches(hall).forEach((p, slot) => {
        perches.set(slot, { altitude: p.altitude });
        if (!ctx.anchors.find(p.id)) offs.push(ctx.anchors.define({ id: p.id, position: { x: p.x, y: heightAt(p.x, p.z), z: p.z }, yaw: p.yaw, tags: ['spawn'] }));
      });
    } catch (err) {
      warn(`the lodge wyrms have no perches (${String(err)})`);
    }

    // ---- the drakes
    const fliers = new Map<ActorId, FlierHandle>();
    const hooks = {
      perchFor: (spawnerId: string | null, slot: number | null) => (spawnerId === LODGE_WYRMS.spawnerId && slot !== null ? (perches.get(slot) ?? null) : null),
      landed: (actorId: ActorId) => {
        if (kindOf(actorId) === 'skarl-drake') ctx.events.emit('wyrm.drake.landed', { actorId });
      },
      trackFlier: (actorId: ActorId, handle: FlierHandle) => {
        fliers.set(actorId, handle);
        return () => {
          if (fliers.get(actorId) === handle) fliers.delete(actorId);
        };
      },
    };
    Object.assign(WYRM_HUB, hooks);
    offs.push(() => {
      for (const k of Object.keys(hooks)) delete (WYRM_HUB as Record<string, unknown>)[k];
      fliers.clear();
    });
    const drakes: DrakesService = {
      chain: (spawnerId, postAnchor, opts = {}) => {
        const wyrms = ctx.services.get('wyrms');
        if (!wyrms) {
          warn('drakes.chain: no wyrms service');
          return () => {};
        }
        return wyrms.tether(spawnerId, [{ anchor: postAnchor, until: opts.until }], { length: opts.length ?? SKARL_DRAKE.chainLength });
      },
      chainLow: (actorId) => fliers.get(actorId)?.chainLow() ?? null,
      strike: (actorId, by) => {
        const h = fliers.get(actorId);
        if (!h || !h.chainLow() || !h.landed()) return false;
        ctx.events.emit('wyrm.drake.chainStruck', { actorId, by });
        return true;
      },
      release: (actorId) => {
        const h = fliers.get(actorId);
        if (!h || !h.release()) return false;
        ctx.events.emit('wyrm.drake.freed', { actorId });
        return true;
      },
    };
    ctx.services.provide('drakes', drakes);

    // ---- per tick
    const dev = devHook(ctx, hathren);
    ctx.systems.add({
      id: 'large-dragons.tick',
      fixedPhase: 'animation',
      order: 61,
      fixedUpdate: (dt) => {
        if (!offCodex) bindCodex();
        director.tick(dt);
        dev?.(dt);
      },
    });
    bindCodex();

    teardown = () => {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          warn(`teardown step failed (${String(err)})`);
        }
      }
    };
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

let teardown: (() => void) | null = null;

/**
 * Dev only. `?hathren=1`: exposes the service as `window.__hathren` (a headless driver cuts nets and calms her) and, with
 * `&calm=<s>`, calls `calm()` that many seconds after she is first in the nets. `?drake=1`: a chained drake 20 m ahead.
 */
function devHook(ctx: Parameters<GamePlugin['setup']>[0], hathren: HathrenService): ((dt: number) => void) | null {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const wantHathren = q.get('hathren') === '1';
  const wantDrake = q.get('drake') === '1';
  if (!wantHathren && !wantDrake) return null;
  if (wantHathren) (window as unknown as { __hathren?: HathrenService }).__hathren = hathren;
  const calmAt = Number(q.get('calm'));
  let inNets = 0;
  let calmed = false;
  let t = 0;
  let spawned = false;
  return (dt) => {
    t += dt;
    if (wantHathren && Number.isFinite(calmAt) && calmAt > 0 && !calmed) {
      if (hathren.state === 'nets') inNets += dt;
      if (inNets >= calmAt) {
        calmed = true;
        hathren.calm();
      }
    }
    if (wantDrake && !spawned && t > 2) {
      spawned = true;
      const enemies = ctx.services.get('enemies');
      const drakes = ctx.services.get('drakes');
      if (!enemies || !drakes) return;
      const f = ctx.player.feet;
      const define = (id: string, dx: number, dz: number) =>
        ctx.anchors.define({ id, position: { x: f.x + dx, y: heightAt(f.x + dx, f.z + dz), z: f.z + dz }, yaw: 0 });
      define('dev.drake.spawn', 0, -20);
      define('dev.drake.post', 4, -14);
      drakes.chain('wyrm.dev.drake', 'dev.drake.post');
      enemies.spawnGroup('wyrm.dev.drake');
    }
  };
}

export default plugin;
