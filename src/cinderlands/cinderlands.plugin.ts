// Plugin `cinderlands` (G4 phase 1, plans/g4-cinderlands.md): Rift Walks from the Quenchstone after M10, the full mode
// after M56. Owns the `cinderlands` save entry, the rift arch, the expedition board, the run loop (`RiftRun`) and its
// HUD line. The run is never saved: saves are held from entry to exit, and a load abandons it.
import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import type { ClassId } from '../actors/classes';
import { CLASS_IDS } from '../actors/classes';
import { heightAt } from '../terrain/heightfield';
import { showToast } from '../waystones/toast';
import { warmthTier } from '../shrine/warmth';
import { BoardModel, openBoard } from './board';
import { SITE } from './domain';
import { MODIFIER_TUNING, type HeatModifierId } from './heat';
import { CinderMeta, CINDER_SAVE_KEY, CINDER_SAVE_VERSION } from './meta';
import { RiftRun, RUN_FLAG, type RunPorts, type RunSummary } from './run';
import { CINDER_ORIGIN_ANCHOR } from './spawners';
import { CINDER_STRINGS_EN } from './strings.en';
import { setRiftTerrain } from './terrain';

export const QUENCHSTONE_ANCHOR = 'waystone.quenchstone';
export const ARCH_ANCHOR = 'shrine.quenchstone.basin';
/** The arch stands this far east of the basin. */
export const ARCH_OFFSET = { x: 6, z: 3 } as const;
/** The full mode opens with the ending (M56). */
export const FULL_MODE_FLAG = 'story.m56.complete';
export const RIFT_CHECKPOINT = 'cinder-run';

export interface CinderlandsParts {
  run: RiftRun;
  meta: CinderMeta;
  /** Opens the board's logic for tests (no DOM): the model the board would show. */
  board(): BoardModel;
  unlocked(): boolean;
  fullMode(): boolean;
}
let parts: CinderlandsParts | null = null;
export const cinderlandsParts = (): CinderlandsParts | null => parts;

interface LooseServices {
  get(name: string): unknown;
}
interface ProgressionLike {
  readonly level: number;
  readonly classId: string | null;
  pauseKillXp(source: string): () => void;
  addMaxHealthModifier(id: string, fn: () => number): () => void;
}
interface QuestsLike {
  state(id: string): string;
}
interface PauseMenuLike {
  addItem(item: { id: string; labelKey: string; when: () => boolean; onSelect: () => void; confirmKey?: string }): () => void;
}

export function setupCinderlands(ctx: GameContext): () => void {
  const offs: Array<() => void> = [];
  const warn = (m: string) => console.warn(`[cinderlands] ${m}`);
  const svc = <T>(name: string): T | undefined => (ctx.services as unknown as LooseServices).get(name) as T | undefined;
  const t = (k: string, p?: Record<string, string | number>) => ctx.strings.t(k, p);
  offs.push(ctx.strings.register('en', CINDER_STRINGS_EN) ?? (() => {}));
  offs.push(ctx.anchors.define({ id: CINDER_ORIGIN_ANCHOR, position: { x: SITE.x, y: 0, z: SITE.z }, yaw: 0 }));

  const meta = new CinderMeta();
  offs.push(
    ctx.persist.register({
      key: CINDER_SAVE_KEY,
      version: CINDER_SAVE_VERSION,
      serialize: () => meta.serialize(),
      load: (data) => meta.load(data),
    }),
  );

  const progression = () => svc<ProgressionLike>('progression');
  const classId = (): ClassId => {
    const c = progression()?.classId;
    return CLASS_IDS.includes(c as ClassId) ? (c as ClassId) : 'knight';
  };
  const unlocked = (): boolean => svc<QuestsLike>('quests')?.state('m10') === 'completed';
  const fullMode = (): boolean => ctx.state.getBool(FULL_MODE_FLAG);
  const warmth = (): number => warmthTier((k) => ctx.state.getBool(k));
  const playerId = () => ctx.player.actor.id;

  const home = (): { feet: { x: number; y: number; z: number }; yaw: number } => {
    const a = ctx.anchors.find(QUENCHSTONE_ANCHOR);
    const p = a ? a.position : { x: 965, y: 0, z: -160 };
    return { feet: { x: p.x, y: heightAt(p.x, p.z), z: p.z + 2.5 }, yaw: a?.yaw ?? 0 };
  };

  const applyModifiers = (mods: readonly HeatModifierId[], isRun: (id: string) => boolean): (() => void) => {
    const u: Array<() => void> = [];
    if (mods.includes('burning')) {
      const status = svc<{ apply(id: string, spec: object): boolean }>('status');
      u.push(
        ctx.events.on('damage.dealt', (r) => {
          if (r.targetId !== playerId() || !r.attackerId || !isRun(r.attackerId) || r.dealt <= 0) return;
          if (Math.random() < MODIFIER_TUNING.burnChance) status?.apply(playerId(), { id: 'cinder-burning', kind: 'ignite', dps: 4, seconds: 3, sourceId: r.attackerId });
        }),
      );
    }
    if (mods.includes('armoured')) {
      const staggered = new Set<string>();
      u.push(ctx.events.on('actor.staggered', (e) => void staggered.add(e.actorId)));
      u.push(
        ctx.damage.addModifier('cinder.armoured', (req, target) => {
          if (isRun(target.id) && !staggered.has(target.id)) req.amount *= MODIFIER_TUNING.armouredTaken;
        }),
      );
    }
    if (mods.includes('phoenix')) {
      const risen = new Set<string>();
      u.push(
        ctx.damage.addLethalHandler('cinder.phoenix', (target) => {
          if (!isRun(target.id) || risen.has(target.id)) return false;
          risen.add(target.id);
          target.health = Math.max(1, Math.round(target.maxHealth * MODIFIER_TUNING.phoenixAt));
          return true;
        }),
      );
    }
    // Swift rides on the spawn options (speedScale).
    return () => u.forEach((f) => f());
  };

  let runSite: { x: number; z: number } | null = null;
  const ports: RunPorts = {
    playerLevel: () => progression()?.level ?? 1,
    classId,
    playerFeet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
    groundAt: heightAt,
    setFlag: (k, on) => (on ? ctx.state.setFlag(k, true) : ctx.state.getFlag(k) !== undefined && ctx.state.clearFlag(k)),
    teleport: async (feet, yaw) => {
      const ws = ctx.services.get('waystones');
      if (!ws) {
        ctx.player.teleport(feet, yaw);
        return { ok: true };
      }
      const r = await ws.safeTeleport(feet, yaw);
      return { ok: r.ok };
    },
    saveNow: async () => ctx.services.get('save')?.saveNow('zone'),
    suspendSaves: () => ctx.services.get('save')?.suspend('cinderlands') ?? (() => {}),
    setRespawnHome: (on) => {
      const ws = ctx.services.get('waystones');
      if (on) ws?.setCheckpoint(RIFT_CHECKPOINT, QUENCHSTONE_ANCHOR);
      else ws?.clearCheckpoint(RIFT_CHECKPOINT);
    },
    pauseKillXp: () => progression()?.pauseKillXp('cinderlands') ?? (() => {}),
    setTerrain: (p) => {
      setRiftTerrain(p);
      runSite = p ? { x: SITE.x, z: SITE.z } : null;
    },
    openSite: (radius) => {
      const c = ctx.services.get('containment');
      if (!c) return () => {};
      const circle = { x: SITE.x, z: SITE.z, r: radius };
      const a = c.addOpenArea({ id: 'cinder.site', circle, openWhen: { all: [RUN_FLAG] } });
      const b = c.addKeepIn({ id: 'cinder.site', circle, liveWhen: { all: [RUN_FLAG] }, toastKey: 'cinder.toast.wall' });
      return () => {
        b();
        a();
      };
    },
    spawnGroup: (id, o) => ctx.services.get('enemies')?.spawnGroup(id, o) ?? [],
    resetGroup: (id) => ctx.services.get('enemies')?.reset(id),
    home,
    applyModifiers,
    healthBonus: (f) => progression()?.addMaxHealthModifier('cinder.vigour', () => 1 + f) ?? (() => {}),
    damageBonus: (f, isRun) =>
      ctx.damage.addModifier('cinder.mastery', (req, target, attacker) => {
        if (attacker?.id === playerId() && isRun(target.id)) req.amount *= 1 + f;
      }),
    toast: (k, p) => showToast(ctx.hud, t(k, p), 3500),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    warn,
  };
  const run = new RiftRun(ports, meta);

  const report = (s: RunSummary | null): void => {
    if (!s) return;
    const place = s.place > 0 ? t('cinder.toast.place', { place: s.place }) : '';
    showToast(ctx.hud, t('cinder.toast.summary', { outcome: t(`cinder.outcome.${s.outcome}`), kept: s.kept, score: s.score, place }), 7000);
    if (s.heatUnlocked) showToast(ctx.hud, t('cinder.toast.heatUp', { heat: meta.data.maxHeat }), 5000);
    if (s.masteryRanks > 0) showToast(ctx.hud, t('cinder.toast.mastery', { rank: meta.masteryRank(classId()) }), 5000);
  };

  // ---- events ----
  offs.push(
    ctx.events.on('actor.died', (e) => {
      if (run.isRunActor(e.actorId)) run.onActorDied(e.actorId, e.kind);
    }),
    ctx.events.on('mercy', (e) => {
      if (e.actorId && run.isRunActor(e.actorId)) run.onMercy(e.actorId, e.creature);
    }),
    ctx.events.on('damage.dealt', (r) => {
      if (r.targetId === playerId()) run.onPlayerHurt(r.dealt);
    }),
    ctx.events.on('player.died', () => run.onPlayerDied()),
    ctx.events.on('player.respawned', () => report(run.onPlayerRespawned())),
    // A load (Continue, a dev jump) drops a live run: it was never saved, nothing is paid.
    ctx.events.on('save.loaded', () => run.abandon()),
  );
  // G1's "Quit to title" (event `settings.quitting`) leaves like the early exit would, without waiting on a teleport.
  const loose = ctx.events as unknown as { on(name: string, fn: () => void): () => void };
  offs.push(loose.on('settings.quitting', () => run.abandon()));

  ctx.systems.add({ id: 'cinderlands.run', fixedPhase: 'rules', order: 470, fixedUpdate: (dt) => run.tick(dt) });
  offs.push(() => undefined);

  // ---- interactables ----
  const archAt = (out: THREE.Vector3): THREE.Vector3 => {
    const a = ctx.anchors.find(ARCH_ANCHOR);
    const x = (a?.position.x ?? 965) + ARCH_OFFSET.x;
    const z = (a?.position.z ?? -165) + ARCH_OFFSET.z;
    return out.set(x, heightAt(x, z), z);
  };
  let closeBoard: (() => void) | null = null;
  const boardModel = (): BoardModel => new BoardModel(meta, classId(), warmth(), fullMode(), Math.random);
  const begin = (seed: Parameters<RiftRun['start']>[0]['seed']): void => {
    void run.start({ seed, fullMode: fullMode() });
  };
  offs.push(
    ctx.interaction.register({
      id: 'use:cinder-arch',
      kind: 'use',
      position: archAt,
      radius: 3,
      promptKey: 'cinder.arch.prompt',
      enabled: () => unlocked() && run.phase === 'idle',
      onInteract: () => {
        if (closeBoard) return;
        closeBoard = openBoard({
          t,
          meta,
          model: boardModel(),
          random: Math.random,
          start: begin,
          openModal: (element, onClose) =>
            ctx.hud.openModal({
              id: 'cinder-board',
              element,
              dispose: () => {
                closeBoard = null;
                onClose();
              },
            }),
        });
      },
    }),
  );
  const exitAt = (out: THREE.Vector3): THREE.Vector3 => {
    const w = run.manifest?.pois.find((p) => p.id === run.manifest?.wardenId);
    return w ? out.set(w.x, heightAt(w.x, w.z), w.z) : out.set(0, -1000, 0);
  };
  offs.push(
    ctx.interaction.register({
      id: 'use:cinder-exit',
      kind: 'use',
      position: exitAt,
      radius: 6,
      coneDegrees: 360,
      promptKey: 'cinder.exit.prompt',
      enabled: () => run.exitOpen,
      onInteract: () => void run.leave().then(report),
    }),
  );
  const entryAt = (out: THREE.Vector3): THREE.Vector3 => {
    const e = run.manifest?.entry;
    return e ? out.set(e.x, heightAt(e.x, e.z), e.z) : out.set(0, -1000, 0);
  };
  offs.push(
    ctx.interaction.register({
      id: 'use:cinder-leave',
      kind: 'use',
      position: entryAt,
      radius: 4,
      coneDegrees: 360,
      promptKey: 'cinder.leave.prompt',
      enabled: () => run.active && !run.exitOpen,
      onInteract: () => void run.leave().then(report),
    }),
  );

  // G1's pause menu, when it is there: "Leave expedition" while a run is live.
  const pauseMenu = svc<PauseMenuLike>('pauseMenu');
  if (pauseMenu?.addItem) {
    offs.push(pauseMenu.addItem({ id: 'cinder-leave', labelKey: 'cinder.menu.leave', confirmKey: 'cinder.menu.leave.confirm', when: () => run.active, onSelect: () => void run.leave().then(report) }));
  }

  // ---- look: the arch, the exit and the HUD line (browser only) ----
  if (ctx.camera) offs.push(mountVisuals(ctx, run, archAt, exitAt, unlocked));
  if (typeof document !== 'undefined') offs.push(mountHud(ctx, run, t));

  parts = { run, meta, board: boardModel, unlocked, fullMode };
  return () => {
    run.abandon();
    for (const f of offs.reverse()) f();
    setRiftTerrain(null);
    void runSite;
    parts = null;
  };
}

function mountVisuals(
  ctx: GameContext,
  run: RiftRun,
  archAt: (o: THREE.Vector3) => THREE.Vector3,
  exitAt: (o: THREE.Vector3) => THREE.Vector3,
  unlocked: () => boolean,
): () => void {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.85 });
  const geo = new THREE.TorusGeometry(1.6, 0.18, 10, 40);
  const arch = new THREE.Mesh(geo, mat);
  const exit = new THREE.Mesh(geo, mat);
  arch.name = 'cinder-arch';
  exit.name = 'cinder-exit';
  exit.scale.setScalar(1.6);
  ctx.scene.add(arch, exit);
  const tmp = new THREE.Vector3();
  const off = ctx.systems.add({
    id: 'cinderlands.look',
    renderPhase: 'world',
    render: (_a, frameTime) => {
      arch.visible = unlocked() && run.phase === 'idle';
      if (arch.visible) {
        archAt(tmp);
        arch.position.set(tmp.x, tmp.y + 1.7, tmp.z);
        arch.rotation.y = Math.PI / 2;
      }
      exit.visible = run.exitOpen;
      if (exit.visible) {
        exitAt(tmp);
        exit.position.set(tmp.x, tmp.y + 2.6, tmp.z);
        exit.rotation.y += frameTime * 0.0006;
      }
      mat.opacity = 0.7 + 0.2 * Math.sin(performance.now() / 300);
    },
  });
  return () => {
    off();
    arch.removeFromParent();
    exit.removeFromParent();
    geo.dispose();
    mat.dispose();
  };
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function mountHud(ctx: GameContext, run: RiftRun, t: (k: string, p?: Record<string, string | number>) => string): () => void {
  const element = document.createElement('div');
  element.className = 'owg-cinder-hud';
  Object.assign(element.style, { font: '600 14px system-ui, sans-serif', color: '#ffd9b0', textShadow: '0 1px 2px #000', textAlign: 'center' });
  let last = '';
  return ctx.hud.mount('top-center', {
    id: 'cinder-hud',
    element,
    order: 40,
    update: () => {
      let text = '';
      if (run.active) {
        text = t('cinder.hud.line', { heat: run.heat, embers: run.embers });
        if (run.exitOpen) text += `\n${t('cinder.hud.exit')}`;
        else {
          const w = run.manifest?.pois.find((p) => p.id === run.manifest?.wardenId);
          const f = ctx.player.feet;
          if (w) {
            const dx = w.x - f.x;
            const dz = w.z - f.z;
            // +Z is north; bearing clockwise from north.
            const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
            const dir = DIRS[Math.round(((bearing + 360) % 360) / 45) % 8];
            text += `\n${t('cinder.hud.warden', { dist: Math.round(Math.hypot(dx, dz)), dir })}`;
          }
        }
      }
      if (text !== last) {
        last = text;
        element.style.whiteSpace = 'pre-line';
        element.textContent = text;
        element.style.display = text ? 'block' : 'none';
      }
    },
  });
}

const plugin: GamePlugin = {
  id: 'cinderlands',
  dependsOn: ['enemies', 'waystones', 'region', 'progression', 'save'],
  setup(ctx) {
    dispose = setupCinderlands(ctx);
  },
  dispose() {
    dispose?.();
    dispose = null;
  },
};
let dispose: (() => void) | null = null;
export default plugin;
