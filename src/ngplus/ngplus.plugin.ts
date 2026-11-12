// Plugin `ngplus` (G3 New Game+, "Second Hearth", design 12.5; plan plans/g3-new-game-plus.md in project files).
// Owns the `ngplus` save entry ({ cycle, endingsSeen }), the `ngPlus` service, the boot screen's two choices (begin a
// Second Hearth, return to the parked world), the pause menu row (G1's `pauseMenu`), the enemy scaling and the +1 temper
// cap. A first playthrough (cycle 0) changes nothing: scaling and the temper bonus are off.
//
// Dev: `?ngplusBegin` begins a Second Hearth as soon as the world is past the ending (with
// `?act5=m56&new&afterEnding=rekindle`), the real-game run's path.
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import { afterEnding } from '../afterEnding/flags';
import { secondHearthHeat, heatMultiplier } from '../cinderlands/heat';
import { setTemperCapBonus } from '../gear/tempering';
import { getItem } from '../inventory/items';
import type { SaveFile } from '../save/SaveSchema';
import { showToast } from '../waystones/toast';
import { liftLeaveGuard } from '../world/leaveGuard';
import { buildSecondHearth, EMPTY_NGPLUS, isEndedSave, readNgPlus, type NgPlusState } from './carry';
import { NGPLUS_DAMAGE_MODIFIER_ID, NGPLUS_DAMAGE_ORDER, SecondHearthScaling } from './scaling';
import type { NgPlusService } from './service';
import './service';
import { NGPLUS_STRINGS_EN } from './strings.en';
import { NGPLUS_BURNING, NGPLUS_KEY, NGPLUS_VERSION, TEMPER_BONUS_MAX } from './tuning';

const kindOf = (id: string): string | undefined => getItem(id)?.kind;

/** G4's `INSIDE_FLAG` (src/cinderlands/run.ts): set before a rift's actors spawn, cleared when the run is torn down. */
export const CINDER_INSIDE_FLAG = 'cinder.run.inside';

/** Where the page goes after a switch: the same page with only `?switched` (a dev jump's own params must not replay). */
function switchedUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  url.search = '?switched';
  return url.toString();
}

export function setupNgPlus(ctx: GameContext, opts: { reload?: (url: string) => void } = {}): () => void {
  const local: Array<() => void> = [];
  const reload = opts.reload ?? ((url: string) => window.location.replace(url));
  local.push(ctx.strings.register('en', NGPLUS_STRINGS_EN) ?? (() => {}));

  let state: NgPlusState = { ...EMPTY_NGPLUS, endingsSeen: [] };
  let sawEntry = false;
  let undoTemper: (() => void) | null = null;
  const applyState = (next: NgPlusState) => {
    state = next;
    undoTemper?.();
    undoTemper = state.cycle > 0 ? setTemperCapBonus(Math.min(TEMPER_BONUS_MAX, state.cycle)) : null;
  };
  local.push(() => undoTemper?.());

  local.push(
    ctx.persist.register({
      key: NGPLUS_KEY,
      version: NGPLUS_VERSION,
      serialize: () => ({ cycle: state.cycle, endingsSeen: [...state.endingsSeen] }),
      load: (data) => {
        sawEntry = true;
        applyState(readNgPlus(data));
      },
    }),
  );
  // A save without the entry is a first playthrough.
  // The Second Hearth's first load starts at full health and stamina: the `player` entry was reset, and its default
  // health is a level 1 player's (seen in the real-game run: 120 of 440). Filled on the next tick, after progression
  // recomputed the maximum; `fresh` is never saved again.
  let fillPending = false;
  local.push(
    ctx.events.on('save.loaded', () => {
      if (!sawEntry) applyState({ cycle: 0, endingsSeen: [] });
      sawEntry = false;
      // Hostiles that spawned before the entry loaded (streamed in at boot) are scaled now; scaled ones are skipped.
      if (state.cycle > 0) for (const a of ctx.actors.all()) scaling.spawned(a);
      if (state.fresh) {
        fillPending = true;
        state = { cycle: state.cycle, endingsSeen: state.endingsSeen };
      }
    }),
  );
  local.push(
    ctx.systems.add({
      id: 'ngplus.fresh-fill',
      fixedPhase: 'late',
      order: 51,
      fixedUpdate: () => {
        if (!fillPending || ctx.services.get('save')?.loading) return;
        fillPending = false;
        const a = ctx.player.actor;
        a.health = a.maxHealth;
        a.stamina = a.maxStamina;
      },
    }),
  );

  const heat = () => (state.cycle > 0 ? secondHearthHeat(state.cycle, ctx.services.get('warmth')?.tier() ?? 0) : 1);
  const mult = () => (state.cycle > 0 ? heatMultiplier(heat()) : 1);

  // ---- scaling (cycle 1 and up)
  const scaling = new SecondHearthScaling(mult);
  local.push(
    ctx.events.on('actor.spawned', ({ actor }) => {
      // A Cinderlands rift runs at its own Heat (G4): its actors are not scaled twice.
      if (state.cycle > 0 && !ctx.state.getBool(CINDER_INSIDE_FLAG)) scaling.spawned(actor);
    }),
  );
  local.push(ctx.events.on('actor.despawned', ({ actorId }) => scaling.despawned(actorId)));
  local.push(ctx.damage.addModifier(NGPLUS_DAMAGE_MODIFIER_ID, (req, target, attacker) => {
    if (state.cycle > 0) scaling.modify(req, target, attacker);
  }, NGPLUS_DAMAGE_ORDER));
  // Design 12.5: from cycle 2 enemies carry one Heat 5 affix, Burning (taste call G3-5).
  let burnCount = 0;
  local.push(
    ctx.events.on('damage.dealt', (r) => {
      if (state.cycle < NGPLUS_BURNING.fromCycle || r.kind !== 'melee' || r.outcome !== 'hit' || r.dealt <= 0) return;
      if (!r.attackerId || scaling.levelAtSpawn(r.attackerId) === undefined) return;
      if (r.targetId !== ctx.player.actor.id) return;
      if (burnCount++ % NGPLUS_BURNING.everyNthHit !== 0) return;
      ctx.services.get('status')?.apply(r.targetId, {
        id: NGPLUS_BURNING.id,
        kind: 'ignite',
        dps: NGPLUS_BURNING.dps,
        seconds: NGPLUS_BURNING.seconds,
        sourceId: r.attackerId,
      });
    }),
  );
  local.push(() => scaling.clear());

  // ---- beginning a Second Hearth, and the switch between the two worlds
  const save = () => ctx.services.get('save');
  const switchTo = async (away: SaveFile, next: SaveFile, atBoot: boolean): Promise<boolean> => {
    const s = save();
    if (!s?.switchWorld) return false;
    const ok = await s.switchWorld(away, next);
    if (!ok) {
      showToast(ctx.hud, ctx.strings.t('ngplus.failed'));
      return false;
    }
    if (!atBoot) {
      const url = switchedUrl();
      if (url) {
        // G1's "leave site?" guard would stop the one reload a switch makes (the world was just saved).
        liftLeaveGuard();
        reload(url);
      }
    }
    return true;
  };

  /** "Replace" when something is parked (a Second Hearth in progress the switch would drop; review finding 3). */
  const confirmBeginKey = () => (save()?.parkedOccupied?.() ? 'ngplus.confirm.replace' : 'ngplus.confirm.begin');

  const service: NgPlusService = {
    cycle: () => state.cycle,
    endingsSeen: () => state.endingsSeen,
    heat,
    heatMultiplier: mult,
    available: () => afterEnding(ctx.state) && !save()?.loading && typeof save()?.switchWorld === 'function',
    begin: async () => {
      if (!service.available()) return false;
      const live = save()?.snapshotFile?.();
      if (!live) return false;
      const built = buildSecondHearth(live, kindOf, Date.now());
      if (!built.ok) {
        console.warn(`[ngplus] cannot begin: ${built.reason}`);
        return false;
      }
      return switchTo(live, built.file, false);
    },
  };
  local.push(ctx.services.provide('ngPlus', service));

  // The boot screen (save's Continue modal).
  const s = save();
  if (s?.addBootChoice) {
    local.push(
      s.addBootChoice({
        id: 'ngplus-begin',
        labelKey: 'ngplus.begin',
        get confirmKey() {
          return confirmBeginKey();
        },
        when: () => {
          const f = save()?.bootFile?.();
          return !!f && isEndedSave(f);
        },
        run: () => {
          const f = save()?.bootFile?.();
          if (!f) return;
          const built = buildSecondHearth(f, kindOf, Date.now());
          // The modal is closed: a refused build continues the ended world rather than leave a locked default one.
          if (built.ok) void switchTo(f, built.file, true);
          else void save()?.continueNow();
        },
      }),
    );
    local.push(
      s.addBootChoice({
        id: 'ngplus-return',
        get labelKey() {
          const p = save()?.parkedFile?.();
          return p && isEndedSave(p) ? 'ngplus.return.ended' : 'ngplus.return.hearth';
        },
        confirmKey: 'ngplus.confirm.return',
        when: () => !!save()?.bootFile?.() && !!save()?.parkedFile?.(),
        run: () => {
          const f = save()?.bootFile?.();
          const p = save()?.parkedFile?.();
          if (f && p) void switchTo(f, p, true);
        },
      }),
    );
  }

  // G1's pause menu: one row, shown in a world past the ending. Registered on the first tick, whatever the plugin order.
  let pauseTried = false;
  local.push(
    ctx.systems.add({
      id: 'ngplus.pause-row',
      fixedPhase: 'late',
      order: 50,
      fixedUpdate: () => {
        if (pauseTried) return;
        pauseTried = true;
        const pause = ctx.services.get('pauseMenu');
        if (!pause) return;
        local.push(
          pause.addItem({
            id: 'ngplus-begin',
            labelKey: 'ngplus.begin',
            get confirmKey() {
              return confirmBeginKey();
            },
            when: () => service.available(),
            onSelect: () => void service.begin(),
          }),
        );
      },
    }),
  );

  // A Second Hearth's load: one toast with the cycle and the Heat.
  local.push(
    ctx.events.on('save.loaded', () => {
      if (state.cycle > 0) showToast(ctx.hud, ctx.strings.t('ngplus.toast.begun', { cycle: state.cycle, heat: heat() }));
    }),
  );

  if (import.meta.env.DEV) local.push(devHook(ctx, service));
  return () => {
    for (const off of local.splice(0).reverse()) off();
  };
}

/** `?ngplusBegin`: begins a Second Hearth once the world is past the ending (the real-game run). */
function devHook(ctx: GameContext, service: NgPlusService): () => void {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (!q?.has('ngplusBegin')) return () => {};
  let done = false;
  let wait = 2;
  return ctx.systems.add({
    id: 'ngplus.dev',
    fixedPhase: 'rules',
    order: 903,
    fixedUpdate: (dt) => {
      if (done || !service.available()) return;
      wait -= dt;
      if (wait > 0) return;
      done = true;
      void service.begin().then((ok) => console.info(`[ngplus] dev begin: ${ok}`));
    },
  });
}

let offs: Array<() => void> = [];

const plugin: GamePlugin = {
  id: 'ngplus',
  dependsOn: ['core', 'save'],
  setup(ctx) {
    offs.push(setupNgPlus(ctx));
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) off();
    offs = [];
  },
};

export default plugin;
