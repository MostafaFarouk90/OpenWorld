import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { CodexModel, normaliseTally, ZERO_COUNTS } from './CodexModel';
import { CODEX_MODAL_ID, createCodexModal, type CodexModalWidget } from './CodexView';
import { SHRINE_IDS } from '../map/ForgeMarks';
import { BESTIARY_IDS, CodexRegistry, HOWTO_IDS } from './entries';
import { CODEX_STRINGS_EN } from './strings.en';
import { ACT2_CODEX_ENTRIES, ACT2_CODEX_IDS, ACT2_CODEX_STRINGS_EN, ACT2_DISCOVER_UNLOCKS, ACT2_FLAG_UNLOCKS, ACT2_QUEST_UNLOCKS } from './act2';
import type { CodexService, MercyCounts } from './service';
import './service';

/** Flags (or counts) whose truthiness means a mechanic has been used. Backfilled on `save.loaded`. */
const FIRST_USE_FLAGS: readonly { flag: string; entry: string }[] = [
  { flag: 'prompt.surge.count', entry: HOWTO_IDS.burnScars },
  { flag: 'prompt.surgeLeap.count', entry: HOWTO_IDS.surgeLeap },
  { flag: 'ability.surge-leap.learned', entry: HOWTO_IDS.surgeLeap },
  ...ACT2_FLAG_UNLOCKS,
];

const ABILITY_ENTRIES: Readonly<Record<string, string>> = {
  'surge-leap': HOWTO_IDS.surgeLeap,
};

/** Skill-tree skills (progression `skill.learned` / `learned()`) that unlock a how-to entry. */
const SKILL_ENTRIES: Readonly<Record<string, string>> = {
  'knight.rallyCry': HOWTO_IDS.rallyCry,
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
    ctx.strings.register('en', ACT2_CODEX_STRINGS_EN);
    const model = new CodexModel();
    const warn = (m: string) => console.warn(m);
    const registry = new CodexRegistry(undefined, warn);
    registry.register(ACT2_CODEX_ENTRIES);
    /** A kind or boss id that first-sight unlocks cover: the built-in Act 1 set plus every registered bestiary entry (Act 2 ids register at runtime). */
    const isBestiary = (id: string): boolean => BESTIARY.has(id) || registry.find(id)?.tab === 'bestiary';

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
        entries: registry,
        glyph: (a) => (ctx.input as unknown as { bindings?: { glyph(a: string): string } }).bindings?.glyph(a) ?? '?',
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
      register: (entries) => {
        const remove = registry.register(entries);
        return () => {
          remove();
          // An open view re-renders on its next update (its signature lists entry ids); nothing else to do.
        };
      },
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
      else if (verb === 'calm' || verb === 'warmHand') model.unlock(HOWTO_IDS.calm);
      if (creature && isBestiary(creature)) model.unlock(creature);
    };
    ctx.events.on('mercy', (e) => unlockMercy(e.verb, e.creature));
    onLoose(ctx, 'ability.learned', (e: { id?: unknown }) => {
      const entry = typeof e?.id === 'string' ? ABILITY_ENTRIES[e.id] : undefined;
      if (entry) model.unlock(entry);
    });
    onLoose(ctx, 'skill.learned', (e: { skillId?: unknown }) => {
      const entry = typeof e?.skillId === 'string' ? SKILL_ENTRIES[e.skillId] : undefined;
      if (entry) model.unlock(entry);
    });
    // Act 2: how-tos by event, places by discovery.
    onLoose(ctx, 'gear.tempered', () => void model.unlock(ACT2_CODEX_IDS.tempering));
    onLoose(ctx, 'rite.performed', () => void model.unlock(ACT2_CODEX_IDS.hearthRite));
    onLoose(ctx, 'boss.spared', (e: { bossId?: unknown }) => {
      if (e?.bossId === ACT2_CODEX_IDS.redmane) model.unlock(ACT2_CODEX_IDS.spareRedmane);
    });
    onLoose(ctx, 'party.offered', () => void model.unlock(ACT2_CODEX_IDS.party));
    for (const at of ['started', 'completed'] as const) {
      onLoose(ctx, `quest.${at}`, (e: { questId?: unknown }) => {
        for (const u of ACT2_QUEST_UNLOCKS) if (u.at === at && u.quest === e?.questId) model.unlock(u.entry);
      });
    }
    onLoose(ctx, 'discover', (e: { placeId?: unknown }) => {
      const entry = typeof e?.placeId === 'string' ? ACT2_DISCOVER_UNLOCKS[e.placeId] : undefined;
      if (entry) model.unlock(entry);
    });
    onLoose(ctx, 'scar.added', () => void model.unlock(HOWTO_IDS.burnScars));
    onLoose(ctx, 'warmth.changed', (e: { tier?: unknown }) => {
      if (typeof e?.tier === 'number' && e.tier > 0) model.unlock(HOWTO_IDS.warmthTier);
    });
    onLoose(ctx, 'boss.started', (e: { bossId?: unknown }) => {
      if (typeof e?.bossId === 'string' && isBestiary(e.bossId)) model.unlock(e.bossId);
    });
    onLoose(ctx, 'ai.aggro', (e: { actorId?: unknown }) => {
      if (typeof e?.actorId !== 'string') return;
      const kind = (ctx.actors.get(e.actorId) as { kind?: string } | undefined)?.kind;
      if (kind && isBestiary(kind)) model.unlock(kind);
    });

    const used = (flag: string): boolean => ctx.state.getBool(flag) || ctx.state.getNumber(flag) > 0;
    /** A save with no codex entry (or an older one) still reflects what the flags and the tally say was used. */
    const backfill = (): void => {
      for (const { flag, entry } of FIRST_USE_FLAGS) if (used(flag)) model.unlock(entry);
      const prog = (ctx.services as unknown as Loose).get('progression') as { learned?: (id: string) => boolean } | undefined;
      for (const [skill, entry] of Object.entries(SKILL_ENTRIES)) {
        try {
          if (prog?.learned?.(skill) === true) model.unlock(entry);
        } catch (e) {
          warn(`codex: progression.learned() failed: ${String(e)}`);
        }
      }
      // Warmth is derived, never stored: read the service tier, or any lit shrine flag.
      const warmth = (ctx.services as unknown as Loose).get('warmth') as { tier?: () => unknown } | undefined;
      let tier = 0;
      try {
        const v = warmth?.tier?.();
        if (typeof v === 'number' && Number.isFinite(v)) tier = v;
      } catch (e) {
        warn(`codex: warmth.tier() failed: ${String(e)}`);
      }
      if (tier > 0 || SHRINE_IDS.some((id) => ctx.state.getBool(`shrine.${id}.lit`))) model.unlock(HOWTO_IDS.warmthTier);
      // Act 2 quest unlocks: a started quest counts for its entry, a completed one for both.
      const quests = (ctx.services as unknown as Loose).get('quests') as { state?: (id: string) => string } | undefined;
      for (const u of ACT2_QUEST_UNLOCKS) {
        try {
          const st = quests?.state?.(u.quest);
          if (st === 'completed' || (u.at === 'started' && (st === 'active' || st === 'failed'))) model.unlock(u.entry);
        } catch (e) {
          warn(`codex: quests.state() failed: ${String(e)}`);
        }
      }
      // Tempered gear in the pack is the forge used, whichever quest it was for.
      const inv = (ctx.services as unknown as Loose).get('inventory') as { items?: () => { id: string }[]; gear?: (id: string) => { temper: number } } | undefined;
      try {
        if (inv?.items?.().some((i) => (inv.gear?.(i.id).temper ?? 0) > 0)) model.unlock(ACT2_CODEX_IDS.tempering);
      } catch (e) {
        warn(`codex: inventory gear read failed: ${String(e)}`);
      }
      const t = tally();
      if (t) {
        for (const [kind, c] of t) {
          if (c.release > 0) model.unlock(HOWTO_IDS.release);
          if (c.spare > 0) model.unlock(HOWTO_IDS.spare);
          if (c.calm > 0) model.unlock(HOWTO_IDS.calm);
          if (c.release + c.spare + c.calm + c.killed > 0 && isBestiary(kind)) model.unlock(kind);
        }
      }
      // Mercy used but the tally could not split it: the first mercy is the Release (wraiths come first).
      if (used('prompt.mercy.count') && !model.has(HOWTO_IDS.release) && !model.has(HOWTO_IDS.spare)) model.unlock(HOWTO_IDS.release);
    };
    ctx.events.on('save.loaded', backfill);
    onLoose(ctx, 'flag.changed', (e: { key?: unknown }) => {
      if (typeof e?.key !== 'string') return;
      if (FIRST_USE_FLAGS.some((f) => f.flag === e.key) || (e.key.startsWith('shrine.') && e.key.endsWith('.lit'))) backfill();
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
