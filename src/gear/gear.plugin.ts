import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import { hudDocument, asHtml } from '../hud/soft';
import { getItem } from '../inventory/items';
import { AdaptiveBeatClock } from '../shrine/beat';
import { showToast } from '../waystones/toast';
import './catalog';
import { registerGearModifiers } from './combat';
import { type ForgeResult } from './forge';
import { createTemperingSession, type GearState, type ScreenHost, type SessionMode, type TemperingScreen, type TemperingScreenFactory, type TemperingSession } from './session';
import { GEAR_STRINGS_EN } from './strings.en';
import { tierOf } from './tempering';
import { createFallbackPanel } from './TemperingFallbackPanel';
import { GEAR_TUNING, SADDLE_STAMINA_BONUS } from './tuning';
import { setWeaponTint } from './weaponTint';

export interface GearService {
  readonly session: TemperingSession;
  /** Swaps the drawing of the tempering screen (A15). The default is `TemperingFallbackPanel`. */
  setScreen(factory: TemperingScreenFactory | null): void;
  /** Opens the screen in smith mode (Dunstan); false while m14 is not completed or another screen is open. */
  openSmith(): boolean;
  /** Opens the screen in anvil mode; false while m14 is neither active nor completed. */
  openAnvil(): boolean;
  forge(itemId: string): ForgeResult | null;
}

declare module '../core/Services' {
  interface GameServices {
    gear: GearService;
  }
}

/** A9's `temperStation` (plans/act2-A9.md item 5), typed here so this plugin loads without it. */
interface SoftTemperStation {
  setHandler(fn: (stationId: string, opts: { firstTemperOfTier: boolean }) => void): () => void;
}
interface SoftQuests {
  state?(id: string): string;
}
interface SoftStatus {
  apply(actorId: string, spec: { id: string; kind: 'ignite'; dps: number; seconds: number; sourceId: string | null }): boolean;
}
interface SoftMount {
  addStaminaBonus?(fn: () => number): () => void;
}

const sanitize = (d: unknown): GearState => {
  const o = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>;
  const tiers = Array.isArray(o.anvilTiers) ? o.anvilTiers.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 5) : [];
  const lessons = typeof o.lessonRuns === 'number' && Number.isFinite(o.lessonRuns) ? Math.max(0, Math.floor(o.lessonRuns)) : 0;
  return { anvilTiers: [...new Set(tiers)], lessonRuns: lessons };
};

let offs: (() => void)[] = [];

const gearPlugin: GamePlugin = {
  id: 'gear',
  dependsOn: ['core', 'inventory'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', GEAR_STRINGS_EN);
    const inventory = ctx.services.require('inventory');
    const soft = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;
    const t = (k: string, p?: Record<string, string | number>) => ctx.strings.t(k, p);
    const toast = (text: string) => showToast(ctx.hud, text);
    const questState = (id: string): string => soft<SoftQuests>('quests')?.state?.(id) ?? 'inactive';

    // ---- Persisted state -------------------------------------------------------------------
    let state: GearState = { anvilTiers: [], lessonRuns: 0 };
    let loaded = false;
    ctx.persist.register({
      key: 'gear',
      version: 1,
      serialize: () => ({ anvilTiers: [...state.anvilTiers], lessonRuns: state.lessonRuns }),
      load: (d) => {
        loaded = true;
        state = sanitize(d);
      },
    });

    // ---- Session ---------------------------------------------------------------------------
    const clockPorts = {
      beat: () => soft<{ beat?(): { beatSeconds: number; nextBeatTime: number } | null }>('music')?.beat?.(),
      toAudioTime: (ms: number) => soft<{ toAudioTime?(ms: number): number | undefined }>('music')?.toAudioTime?.(ms),
      nowMs: () => performance.now(),
    };
    const session = createTemperingSession({
        inventory,
        // Read live: a save load replaces `state` without touching the session.
        get state() {
          return state;
        },
        now: () => performance.now(),
        makeClock: () => new AdaptiveBeatClock(clockPorts, GEAR_TUNING.rhythm.bpm, GEAR_TUNING.rhythm.divisions),
        anvilUsable: () => ['active', 'completed'].includes(questState('m14')),
        smithUsable: () => questState('m14') === 'completed',
        lessonActive: () => questState('m14') === 'active',
        emitTempered: (p) => ctx.events.emit('gear.tempered', p),
    });

    let screenFactory: TemperingScreenFactory = createFallbackPanel;
    let screen: TemperingScreen | null = null;
    let unsub: (() => void) | null = null;
    const closeScreen = (): void => {
      const s = screen;
      screen = null;
      s?.dispose();
    };
    const host = (): ScreenHost => ({
      session,
      doc: hudDocument(),
      openModal: (w) => ctx.hud.openModal({ id: w.id, element: asHtml(w.element), dispose: w.dispose }),
      t,
      keys: typeof window !== 'undefined' ? (window as unknown as ScreenHost['keys']) : null,
    });
    const openScreen = (mode: SessionMode): boolean => {
      if (screen || session.state !== 'idle') return false;
      if (!session.open(mode)) {
        toast(t(mode === 'anvil' ? 'gear.anvil.locked' : 'gear.smith.locked'));
        return false;
      }
      unsub?.();
      unsub = session.subscribe(() => {
        if (session.state === 'idle') closeScreen();
      });
      screen = screenFactory(host());
      if (!screen) session.close();
      return !!screen;
    };

    const service: GearService = {
      session,
      setScreen(factory) {
        screenFactory = factory ?? createFallbackPanel;
      },
      openSmith: () => openScreen('smith'),
      openAnvil: () => openScreen('anvil'),
      forge(itemId) {
        if (session.state === 'idle') return null;
        session.forge(itemId);
        const r = session.view().lastResult;
        return r?.ok && r.forged ? { ok: true, from: itemId, to: r.forged } : { ok: false, reason: (r?.reason as never) ?? 'locked' };
      },
    };
    ctx.services.provide('gear', service);

    // ---- Combat ----------------------------------------------------------------------------
    offs.push(
      registerGearModifiers(
        ctx.damage,
        {
          equipped: (slot) => inventory.equipped(slot),
          gear: (id) => inventory.gear(id),
          ignite: (targetId, sourceId) =>
            void soft<SoftStatus>('status')?.apply(targetId, {
              id: GEAR_TUNING.combat.ember.statusId,
              kind: 'ignite',
              dps: GEAR_TUNING.combat.ember.dps,
              seconds: GEAR_TUNING.combat.ember.seconds,
              sourceId,
            }),
        },
      ),
    );

    // ---- Weapon tint (tier 3 weapons glow) -----------------------------------------------------
    const refreshTint = (): void => {
      const id = inventory.equipped('weapon');
      setWeaponTint(ctx.player.avatar?.weapon, !!id && tierOf(getItem(id)) >= 3);
    };
    offs.push(ctx.events.on('player.avatar', refreshTint), ctx.events.on('inventory.equipped', (e) => e.slot === 'weapon' && refreshTint()));

    // ---- Soft links, retried each tick until found -----------------------------------------------
    let offHandler: (() => void) | null = null;
    let offSaddle: (() => void) | null = null;
    let placed = false;
    const link = (): void => {
      const station = soft<SoftTemperStation>('temperStation');
      if (station && !offHandler) {
        offHandler = station.setHandler((id) => {
          if (id === 'hushed-anvil') openScreen('anvil');
        });
      }
      const mount = soft<SoftMount>('mount');
      if (mount?.addStaminaBonus && !offSaddle) offSaddle = mount.addStaminaBonus(() => (inventory.has('ashmare-saddle') ? SADDLE_STAMINA_BONUS : 0));
      if (!placed) {
        // Same offset trick as the economy's Kettlewick posts: beside the shop point, not on it.
        const a = ctx.anchors.find('shop.dunstan');
        if (a) {
          placed = true;
          const p = a.position;
          ctx.interaction.register({
            id: 'use:forge-dunstan',
            kind: 'use',
            position: (out) => out.set(p.x + 1.6, p.y, p.z),
            name: 'dunstan',
            promptKey: 'gear.smith.prompt',
            priority: -0.01,
            enabled: () => questState('m14') === 'completed',
            onInteract: () => void openScreen('smith'),
          });
        }
      }
    };
    link();
    ctx.events.on('save.loaded', () => {
      if (!loaded) {
        state = { anvilTiers: [], lessonRuns: 0 };
      }
      loaded = false;
      refreshTint();
    });
    ctx.systems.add({
      id: 'gear.fixed',
      fixedPhase: 'rules',
      order: 460,
      fixedUpdate() {
        link();
        session.update();
        screen?.update?.();
      },
    });
    offs.push(() => {
      closeScreen();
      unsub?.();
      offHandler?.();
      offSaddle?.();
    });
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default gearPlugin;
