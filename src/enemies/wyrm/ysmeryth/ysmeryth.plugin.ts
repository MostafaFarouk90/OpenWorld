import type { GamePlugin } from '../../../core/plugins';
import { codexEntry } from '../../../codex/entries';
import '../../../companions/events';
import '../../../companions/trials';
import type { ActorId } from '../../ports';
import { YSMERYTH_HUB } from '../overlays';
import { YSMERYTH_IDS } from './def';
import type { YsmerythService } from './events';
import './events';
import { YsmerythPresence } from './presence';
import { YSMERYTH_STRINGS_EN } from './strings.en';
import { YsmerythTrial } from './trial';

type CodexLike = { register?(entries: unknown[]): () => void; unlock?(id: string): void };

/** Ahead of the trial's own floor (-150): while she flies, the player's floor scores no break. */
const AIRBORNE_FLOOR_ORDER = -160;

/**
 * Ysmeryth the Coal-Mother (K6a PR 2, plans/act3-K6a-pr2.md): M31's trial on K0's trial service (the `ysmeryth-trial`
 * overlay, flight between rounds, the call), the `ysmeryth` service for K13, the Hearth scene poses for M32 and M34,
 * and her codex entry. Nothing here is saved.
 */
const plugin: GamePlugin = {
  id: 'ysmeryth',
  dependsOn: ['core', 'enemies', 'wyrms'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[ysmeryth] ${m}`);
    const offs: Array<() => void> = [];
    offs.push(ctx.strings.register('en', YSMERYTH_STRINGS_EN) ?? (() => {}));

    // ---- codex (bound lazily: the codex plugin may set up after this one)
    let offCodex: (() => void) | null = null;
    const codex = (): CodexLike | undefined => ctx.services.get('codex') as CodexLike | undefined;
    const bindCodex = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register([codexEntry('lore', YSMERYTH_IDS.codexId, YSMERYTH_IDS.codexId)]);
    };
    offs.push(() => offCodex?.());

    // ---- the trial
    const trial = new YsmerythTrial({
      trials: () => ctx.services.get('trials'),
      enemies: () => ctx.services.get('enemies'),
      anchor: (id) => ctx.anchors.find(id)?.position,
      playerId: () => ctx.actors.player.id,
      setInvulnerable: (id, on) => {
        const a = ctx.actors.get(id as ActorId);
        if (a && !a.dead) a.invulnerable = on;
      },
      emit: (beat) => ctx.events.emit('wyrm.ysmeryth', { beat }),
      unlockCodex: (id) => {
        bindCodex();
        codex()?.unlock?.(id);
      },
      warn,
    });
    Object.assign(YSMERYTH_HUB, trial.hub);
    offs.push(() => {
      for (const k of Object.keys(YSMERYTH_HUB)) delete (YSMERYTH_HUB as Record<string, unknown>)[k];
    });
    offs.push(
      ctx.events.on('trial.started', (e) => trial.started(e.trialId)),
      ctx.events.on('trial.break', (e) => trial.broke(e.trialId, { player: e.player, opponent: e.opponent })),
      ctx.events.on('trial.ended', (e) => trial.ended(e.trialId, e.reason)),
      ctx.events.on('actor.staggered', (e) => trial.staggered(e.actorId)),
    );
    offs.push(
      ctx.damage.addLethalHandler(
        'ysmeryth.airborne-floor',
        (target) => {
          if (!trial.airborneFloor(target.id)) return false;
          target.health = Math.min(1, target.maxHealth);
          return true;
        },
        AIRBORNE_FLOOR_ORDER,
      ),
    );

    // ---- the Hearth scenes
    const presence = new YsmerythPresence({
      scene: ctx.scene,
      cameraPosition: () => (ctx.camera ? ctx.camera.position : null),
      getBool: (k) => ctx.state.getBool(k),
      anchor: (id) => {
        const a = ctx.anchors.find(id);
        return a ? { x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw } : undefined;
      },
      trialRunning: () => trial.running,
      emitPose: (pose) => ctx.events.emit('wyrm.ysmeryth', { beat: 'pose', pose }),
      warn,
    });
    offs.push(ctx.events.on('save.loaded', () => presence.onLoaded()));
    offs.push(() => presence.dispose());

    const service: YsmerythService = {
      beginTrial: () => trial.beginTrial(),
      endTrial: () => trial.endTrial(),
      get actorId() {
        return trial.handle?.actorId ?? null;
      },
      get airborne() {
        return trial.airborne;
      },
      pose: (p) => presence.show(p),
      hide: () => presence.hide(),
      get scenePose() {
        return presence.pose;
      },
    };
    ctx.services.provide('ysmeryth', service);

    const dev = devHook(ctx, service, offs, () => trial.handle?.flight ?? null);
    ctx.systems.add({
      id: 'ysmeryth.tick',
      fixedPhase: 'animation',
      order: 62,
      fixedUpdate: (dt) => {
        if (!offCodex) bindCodex();
        trial.tick(dt);
        presence.tick(dt);
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
 * Dev only. `?ysmeryth=1`: exposes `window.__ysmeryth` (the service plus `break(side)`, which scores a break through the
 * trial service's own stagger path) and begins the trial once the roost anchors exist. `&ypose=perch,reveal,oath` cycles
 * the Hearth poses every 8 s instead.
 */
function devHook(ctx: Parameters<GamePlugin['setup']>[0], service: YsmerythService, offs: Array<() => void>, flight: () => string | null): ((dt: number) => void) | null {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const trialWanted = q.get('ysmeryth') === '1';
  const poses = (q.get('ypose') ?? '').split(',').filter(Boolean) as Parameters<YsmerythService['pose']>[0][];
  if (!trialWanted && poses.length === 0) return null;
  (window as unknown as { __ysmeryth?: unknown }).__ysmeryth = Object.assign(Object.create(null), {
    service,
    flight,
    begin: () => service.beginTrial(),
    end: () => service.endTrial(),
    pose: (p: Parameters<YsmerythService['pose']>[0]) => service.pose(p),
    break: (side: 'player' | 'opponent') => {
      const id = service.actorId;
      if (!id) return false;
      const player = ctx.actors.player.id;
      ctx.events.emit('actor.staggered', side === 'player' ? { actorId: id as ActorId, byId: player } : { actorId: player, byId: id as ActorId });
      return true;
    },
  });
  offs.push(() => {
    delete (window as unknown as { __ysmeryth?: unknown }).__ysmeryth;
  });
  let t = 0;
  let poseAt = 0;
  let poseIdx = 0;
  return (dt) => {
    t += dt;
    if (poses.length > 0 && t >= poseAt) {
      poseAt = t + 8;
      service.pose(poses[poseIdx++ % poses.length]!);
    }
  };
}

export default plugin;
