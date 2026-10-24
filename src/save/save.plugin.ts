import '../physics/platforms';
import type { GamePlugin } from '../core/plugins';
import { heightAt } from '../terrain/heightfield';
import { groundDistance } from '../waystones/ground';
import '../waystones/service';
import { showToast } from '../waystones/toast';
import { createContinueModal } from './ContinueModal';
import { devJumpBoot } from './devJump';
import { SaveManager, type ApplyReport } from './SaveManager';
import type { SaveService } from './service';
import './service';
import { IndexedDbSaveStore, MemorySaveStore } from './SaveStore';
import { SAVE_STRINGS_EN } from './strings.en';
import { SaveSuspensions } from './suspend';
import type { SavePorts } from './ports';

export const AUTOSAVE_INTERVAL_SECONDS = 120;
const SNAPSHOT_INTERVAL_SECONDS = 10;
const GROUND_RAY = 0.35;
const MAX_COORD = 100_000;
const MAX_ABOVE_GROUND = 200;

interface Grounded {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Set when the player was standing on a moving platform (contracts v0.6 item 9). */
  platformId?: string;
}

/**
 * Where to put a player saved on platform `platformId`: the platform's last stop (x/z) with the feet on its top
 * (+0.05). Null when `data` names no platform or that platform is not registered, so the caller falls back to
 * `sanitizePosition`.
 */
export function platformLoadTarget(
  data: unknown,
  platforms: { standingPoint(id: string): { x: number; y: number; z: number } | null } | undefined,
): { x: number; y: number; z: number } | null {
  if (typeof data !== 'object' || data === null || !platforms) return null;
  const id = (data as Record<string, unknown>).platformId;
  if (typeof id !== 'string') return null;
  const p = platforms.standingPoint(id);
  return p ? { x: p.x, y: p.y + 0.05, z: p.z } : null;
}

/** Position from a save entry, lifted onto the terrain; null when implausible. */
export function sanitizePosition(data: unknown): Grounded | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const { x, y, z, yaw } = d;
  if (![x, y, z, yaw].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const nx = x as number;
  const nz = z as number;
  if (Math.abs(nx) > MAX_COORD || Math.abs(nz) > MAX_COORD) return null;
  const ground = heightAt(nx, nz);
  if ((y as number) > ground + MAX_ABOVE_GROUND) return null;
  return { x: nx, y: Math.max(y as number, ground) + 0.05, z: nz, yaw: yaw as number };
}

let cleanup: (() => void) | null = null;
let clearSuspensions: (() => void) | null = null;

const save: GamePlugin = {
  id: 'save',
  dependsOn: ['core', 'waystones'],
  setup(ctx) {
    ctx.strings.register('en', SAVE_STRINGS_EN);
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const waystones = () => ctx.services.get('waystones');

    let grounded: Grounded | null = null;
    // `manager` is created below; the last release runs a deferred save.
    const suspensions = new SaveSuspensions(() => void manager.notifySafe());
    const ports: SavePorts = {
      persistables: () => ctx.persist.all(),
      emitLoaded: (slot) => ctx.events.emit('save.loaded', { slot }),
      now: () => Date.now(),
      log: (level, msg, c) => (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(msg, c ?? ''),
      gameplaySafe: () => {
        const top = ctx.input.contexts.top();
        if (ctx.player.actor.dead) return { safe: false, reason: 'dead' };
        if (top === 'cutscene' || top === 'dialogue') return { safe: false, reason: top };
        if (waystones()?.travelling) return { safe: false, reason: 'travelling' };
        if (suspensions.active) return { safe: false, reason: `suspended:${suspensions.reason}` };
        return { safe: true };
      },
      groundedPlayerState: () => (grounded ? { ...grounded } : undefined),
      toast: (key) => showToast(ctx.hud, ctx.strings.t(key)),
    };

    const manager = new SaveManager({ ports, store: new IndexedDbSaveStore(), createFallbackStore: () => new MemorySaveStore() });
    // The IndexedDB read runs while the other plugins are still setting up.
    const bootRead = manager.continue();
    let boot: Awaited<typeof bootRead> | null = null;
    void bootRead.then((r) => (boot = r));
    if (typeof navigator !== 'undefined') void navigator.storage?.persist?.().catch(() => undefined);

    // Saves stay locked from boot until the boot decision (Continue, New Game, or no save) has settled,
    // so a default-state write can never replace the real save.
    manager.beginLoad();
    let loading = true;
    let endLoadPending = false;
    let consumed = false;
    const unlock = () => {
      consumed = true;
      endLoadPending = true; // applied on the next tick, after the settle
    };

    const loadSequence = async (): Promise<boolean> => {
      if (!boot || !boot.ok || consumed) return false;
      consumed = true;
      const release = ctx.player.addMoveModifier('save.load', { freeze: true });
      try {
        const report: ApplyReport = manager.applyLoad(boot.file);
        const pos = sanitizePosition(report.playerPosition?.data);
        const onPlatform = platformLoadTarget(report.playerPosition?.data, ctx.services.get('platforms'));
        const target =
          (onPlatform && pos ? { ...onPlatform, yaw: pos.yaw } : null) ??
          pos ??
          (() => {
            const r = waystones()?.respawnPoint();
            return r ? { x: r.feet.x, y: r.feet.y, z: r.feet.z, yaw: r.yaw } : null;
          })();
        if (target) await waystones()?.safeTeleport({ x: target.x, y: target.y, z: target.z }, target.yaw);
        ports.emitLoaded(boot.slot);
        return true;
      } catch (err) {
        console.error('save: load failed', err);
        return false;
      } finally {
        release();
        unlock();
      }
    };

    const service: SaveService = {
      saveNow: (reason) => manager.save(reason),
      hasSave: () => boot?.ok === true && !consumed,
      get usingFallback() {
        return manager.isUsingFallback;
      },
      get loading() {
        return loading;
      },
      continueNow: loadSequence,
      newGame: async () => {
        const r = await manager.newGame();
        unlock();
        return r.ok;
      },
      suspend: (reason) => suspensions.suspend(reason),
      checkpoint: (reason) => {
        ports.log('info', `save: checkpoint (${reason})`);
        return manager.checkpoint();
      },
    };
    ctx.services.provide('save', service);
    clearSuspensions = () => suspensions.clear();

    // Boot decision, taken once the read has settled and a tick has run.
    let bootHandled = false;
    const handleBoot = () => {
      if (bootHandled || !boot) return;
      bootHandled = true;
      // A dev `?act1=`, `?act2=` or `?bellows=1` jump holds saves for the whole session, so it starts fresh without clearing
      // the real save. A refused one (a bad id, a bad class) holds them here instead: the jump plugin returned before its
      // own hold, and this fresh game must not autosave over the real slot either.
      const jump = devJumpBoot(params.toString());
      if (jump) {
        if (jump === 'refused') {
          console.warn('save: the dev jump was refused; saves are held for this session');
          suspensions.suspend('dev-jump-refused');
        }
        unlock();
        return;
      }
      if (params.has('new')) {
        void service.newGame();
        return;
      }
      if (params.has('continue') && boot.ok) {
        void loadSequence();
        return;
      }
      const problem = boot.ok ? null : boot.reason === 'corrupt' || boot.reason === 'newer' ? boot.reason : null;
      const unavailable = !boot.ok && boot.reason === 'unavailable';
      // Nothing to lose when there is no usable save: play on.
      if (!boot.ok) unlock();
      if (typeof document === 'undefined' || (!boot.ok && !problem && !unavailable)) return;
      const hold = ctx.player.addMoveModifier('save.boot', { freeze: true });
      let closeModal: (() => void) | null = null;
      const finish = () => {
        hold();
        closeModal?.();
      };
      const widget = createContinueModal({
        hasSave: boot.ok,
        storageUnavailable: unavailable || manager.isUsingFallback,
        saveProblem: problem,
        t: (k, p) => ctx.strings.t(k, p),
        onContinue: () => {
          finish();
          void loadSequence();
        },
        onNewGame: () => {
          finish();
          void service.newGame();
        },
      });
      closeModal = ctx.hud.openModal(widget);
      if (closeModal) widget.focusDefault();
      else {
        // Another modal is open: try again next tick (a real save stays locked meanwhile).
        hold();
        bootHandled = false;
      }
    };

    let sinceSave = 0;
    let sinceSnapshot = 0;
    ctx.systems.add({
      id: 'save.tick',
      fixedPhase: 'late',
      order: 0,
      fixedUpdate(dt) {
        if (endLoadPending) {
          endLoadPending = false;
          loading = false;
          manager.endLoad();
        }
        handleBoot();
        manager.addPlaytime(dt);
        if (!waystones()?.travelling && !loading) {
          const f = ctx.player.feet;
          if (groundDistance(ctx, GROUND_RAY) !== null) {
            grounded = { x: f.x, y: f.y, z: f.z, yaw: ctx.player.facingYaw };
            const ground = ctx.world?.player?.controller?.groundCollider?.();
            const platformId = ground ? ctx.services.get('platforms')?.idOf(ground) : undefined;
            if (platformId !== undefined) grounded.platformId = platformId;
          }
        }
        sinceSave += dt;
        if (sinceSave >= AUTOSAVE_INTERVAL_SECONDS) {
          sinceSave = 0;
          void manager.autosave('timer', waystones()?.hostileAggro ?? false);
        }
        sinceSnapshot += dt;
        if (sinceSnapshot >= SNAPSHOT_INTERVAL_SECONDS) {
          sinceSnapshot = 0;
          manager.captureSnapshot();
        }
      },
    });

    ctx.events.on('discover', (e) => {
      if (e.kind === 'region') void manager.save('zone');
    });
    const safeAgain = () => void manager.notifySafe();
    ctx.events.on('cutscene.ended', safeAgain);
    ctx.events.on('dialogue.ended', safeAgain);
    ctx.events.on('actor.revived', safeAgain);

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const onHide = () => {
        if (document.visibilityState === 'hidden') void manager.snapshotForExit();
      };
      const onPageHide = () => void manager.snapshotForExit();
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onPageHide);
      cleanup = () => {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onPageHide);
      };
    }
  },
  dispose() {
    cleanup?.();
    cleanup = null;
    clearSuspensions?.();
    clearSuspensions = null;
  },
};

export default save;
