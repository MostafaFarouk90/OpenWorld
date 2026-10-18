import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { CodexModel, normaliseTally, ZERO_COUNTS } from './CodexModel';
import { CODEX_MODAL_ID, createCodexModal, type CodexModalWidget } from './CodexView';
import { BESTIARY_IDS, HOWTO_IDS } from './entries';
import { CODEX_STRINGS_EN } from './strings.en';
import type { CodexService, MercyCounts } from './service';
import './service';

/** Flags (or counts) whose truthiness means a mechanic has been used. Backfilled on `save.loaded`. */
const FIRST_USE_FLAGS: readonly { flag: string; entry: string }[] = [
  { flag: 'prompt.surge.count', entry: HOWTO_IDS.burnScars },
  { flag: 'prompt.surgeLeap.count', entry: HOWTO_IDS.surgeLeap },
  { flag: 'ability.surge-leap.learned', entry: HOWTO_IDS.surgeLeap },
  { flag: 'ability.rally-cry.learned', entry: HOWTO_IDS.rallyCry },
  { flag: 'warmth.tier', entry: HOWTO_IDS.warmthTier },
];

const ABILITY_ENTRIES: Readonly<Record<string, string>> = {
  'surge-leap': HOWTO_IDS.surgeLeap,
  'rally-cry': HOWTO_IDS.rallyCry,
};

const BESTIARY = new Set<string>(BESTIARY_IDS);

type Loose = { get(name: string): unknown };

/** Subscribes to an event by string name so a missing contract type never breaks the build or the load. */
function onLoose(ctx: GameContext, type: string, fn: (payload: any) => void): void {
  (ctx.events as unknown as { on(t: string, f: (p: unknown) => void): unknown }).on(type, fn);
}

const codex: GamePlugin = {
  id: 'codex',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', CODEX_STRINGS_EN);
    const model = new CodexModel();
    const warn = (m: string) => console.warn(m);

    /** Optional: thread 1's `enemies.mercyTally()`; zeros are shown when it is absent. */
    const tally = (): Map<string, MercyCounts> | null => {
      const enemies = (ctx.services as unknown as Loose).get('enemies') as { mercyTally?: () => unknown } | undefined;
      if (!enemies || typeof enemies.mercyTally !== 'function') return null;
      try {
        return normaliseTally(enemies.mercyTally());
      } catch (e) {
        warn(`codex: mercyTally() failed: ${String(e)}`);
        return null;
      }
    };

    let closeModal: (() => void) | null = null;
    let widget: CodexModalWidget | null = null;

    const open = (entryId?: string): void => {
      if (widget && closeModal) {
        if (entryId) widget.select(entryId);
        return;
      }
      const w = createCodexModal({
        has: (id) => model.has(id),
        markRead: (id) => model.markRead(id),
        isRead: (id) => model.isRead(id),
        tally: (kind) => {
          const t = tally();
          return t ? (t.get(kind) ?? ZERO_COUNTS) : null;
        },
        t: (k, p) => ctx.strings.t(k, p),
      });
      if (entryId) w.select(entryId);
      const close = ctx.hud.openModal(w);
      if (!close) {
        w.dispose?.();
        return;
      }
      widget = w;
      closeModal = close;
      w.focusDefault();
    };

    const service: CodexService = {
      unlock: (id) => void model.unlock(id),
      has: (id) => model.has(id),
      open,
    };
    ctx.services.provide('codex', service);

    ctx.persist.register({
      key: 'codex',
      version: 1,
      serialize: () => model.serialize(),
      load: (data) => model.load(data, warn),
    });

    // Release and Spare are one mechanic ('mercy') to the prompts; the event verb splits them.
    const unlockMercy = (verb: string, creature: string | undefined): void => {
      if (verb === 'release') model.unlock(HOWTO_IDS.release);
      else if (verb === 'spare') model.unlock(HOWTO_IDS.spare);
      if (creature && BESTIARY.has(creature)) model.unlock(creature);
    };
    ctx.events.on('mercy', (e) => unlockMercy(e.verb, e.creature));
    onLoose(ctx, 'ability.learned', (e: { id?: unknown }) => {
      const entry = typeof e?.id === 'string' ? ABILITY_ENTRIES[e.id] : undefined;
      if (entry) model.unlock(entry);
    });
    onLoose(ctx, 'companion.joined', () => void model.unlock(HOWTO_IDS.rallyCry));
    onLoose(ctx, 'scar.added', () => void model.unlock(HOWTO_IDS.burnScars));
    onLoose(ctx, 'warmth.changed', (e: { tier?: unknown }) => {
      if (typeof e?.tier === 'number' && e.tier > 0) model.unlock(HOWTO_IDS.warmthTier);
    });
    onLoose(ctx, 'boss.started', (e: { bossId?: unknown }) => {
      if (typeof e?.bossId === 'string' && BESTIARY.has(e.bossId)) model.unlock(e.bossId);
    });
    onLoose(ctx, 'ai.aggro', (e: { actorId?: unknown }) => {
      if (typeof e?.actorId !== 'string') return;
      const kind = (ctx.actors.get(e.actorId) as { kind?: string } | undefined)?.kind;
      if (kind && BESTIARY.has(kind)) model.unlock(kind);
    });

    const used = (flag: string): boolean => ctx.state.getBool(flag) || ctx.state.getNumber(flag) > 0;
    /** A save with no codex entry (or an older one) still reflects what the flags and the tally say was used. */
    const backfill = (): void => {
      for (const { flag, entry } of FIRST_USE_FLAGS) if (used(flag)) model.unlock(entry);
      const t = tally();
      if (t) {
        for (const [kind, c] of t) {
          if (c.release > 0) model.unlock(HOWTO_IDS.release);
          if (c.spare > 0) model.unlock(HOWTO_IDS.spare);
          if (c.release + c.spare + c.calm + c.killed > 0 && BESTIARY.has(kind)) model.unlock(kind);
        }
      }
      // Mercy used but the tally could not split it: the first mercy is the Release (wraiths come first).
      if (used('prompt.mercy.count') && !model.has(HOWTO_IDS.release) && !model.has(HOWTO_IDS.spare)) model.unlock(HOWTO_IDS.release);
    };
    ctx.events.on('save.loaded', backfill);
    onLoose(ctx, 'flag.changed', (e: { key?: unknown }) => {
      if (typeof e?.key === 'string' && FIRST_USE_FLAGS.some((f) => f.flag === e.key)) backfill();
    });
    ctx.events.on('ui.modal', (e) => {
      if (e.id === CODEX_MODAL_ID && !e.open) {
        closeModal = null;
        widget = null;
      }
    });

    ctx.systems.add({
      id: 'codex.input',
      fixedPhase: 'input',
      order: 0,
      fixedUpdate() {
        const actions = ctx.input.actions;
        if (ctx.hud.modalOpen === CODEX_MODAL_ID) {
          if (actions.pressed('codex') || actions.pressed('menu')) closeModal?.();
          return;
        }
        if (!actions.pressed('codex') || ctx.input.contexts.top() !== 'gameplay' || ctx.hud.modalOpen) return;
        open();
      },
    });
  },
};

export default codex;
