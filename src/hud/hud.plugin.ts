import { Vector3 } from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { ElementLike } from './dom';
import './events';
import { AbilityBar, LeapState, type AbilitySlotInfo } from './AbilityBar';
import { ActContinuesCard, hudOptions, type KeySource } from './ActContinuesCard';
import { BossBar } from './BossBar';
import { CompanionPortrait } from './CompanionPortrait';
import { createRespecModal, type RespecModalDeps } from './RespecModal';
import { BuffBar, type BuffInfo } from './BuffBar';
import { LockOnMarker } from './LockOnMarker';
import { NextUnlock } from './NextUnlock';
import { QuestTracker, type TrackedQuest } from './QuestTracker';
import { StatusBars } from './StatusBars';
import { Toasts } from './Toasts';
import { HUD_CSS } from './hudStyles';
import { HUD_STRINGS_EN } from './strings.en';
import { asHtml, hudDocument, injectCss, projectToScreen, soft } from './soft';
import type { HudSlot } from '../ui/HudLayer';
import type { HudWidgetView } from './widget';
import type { ProgressionService } from './ports';
import { getSkill } from '../progression/skills';
import { LEVEL_CAP, xpForLevel } from '../progression/tuning';

const scratch = new Vector3();

/**
 * Mounts the thread 5 HUD. Everything is read through optional services, so a failed inventory,
 * progression or prompts plugin never takes the health bars with it (this plugin depends only on core).
 */
const hudPlugin: GamePlugin = {
  id: 'hud',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', HUD_STRINGS_EN);
    injectCss(HUD_CSS);
    const doc = hudDocument();
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const progression = () => ctx.services.get('progression');
    const player = () => ctx.actors.player;

    const mount = (slot: HudSlot, view: HudWidgetView & { element: ElementLike }, order: number): void => {
      ctx.hud.mount(slot, { id: view.id, element: asHtml(view.element), order, update: (dt) => view.update(dt), dispose: () => view.dispose() });
    };

    const status = new StatusBars(doc, {
        health: () => player().health,
        maxHealth: () => player().maxHealth,
        stamina: () => player().stamina,
        maxStamina: () => player().maxStamina,
        baseMaxHealth: () => progression()?.baseMaxHealth() ?? player().maxHealth,
        spells: () => soft(ctx, 'spells'),
        scars: () => soft(ctx, 'spells')?.scars,
        progress: () => {
          const p = progression();
          return p ? xpBarProgress(p) : null;
        },
        t,
    });
    ctx.events.on('scar.added', () => status.pulse());
    // Burn 75+ tints the mercy prompt's cost amber (CSS only; the text is thread 1's string in core's PromptWidget).
    ctx.hud.mount('top-left', {
      id: status.id,
      element: asHtml(status.element),
      order: 20,
      update() {
        status.update();
        const body = typeof document !== 'undefined' ? document.body : undefined;
        body?.classList?.toggle('owg-burn-scar', (soft(ctx, 'spells')?.burn ?? 0) >= 75);
      },
      dispose: () => status.dispose(),
    });

    const buffs = new Map<string, BuffInfo>();
    ctx.events.on('buff.applied', (e) => {
      if (Number.isFinite(e.seconds) && e.seconds > 0) buffs.set(e.id, { id: e.id, nameKey: e.nameKey, remaining: e.seconds, total: e.seconds });
    });
    ctx.events.on('buff.removed', (e) => buffs.delete(e.id));
    const buffBar = new BuffBar(doc, { buffs: () => [...buffs.values()], t });
    ctx.hud.mount('top-left', {
      id: 'buff-bar',
      element: asHtml(buffBar.element),
      order: 30,
      update(frameTime) {
        for (const [id, b] of buffs) {
          b.remaining -= frameTime;
          if (b.remaining <= 0) buffs.delete(id);
        }
        buffBar.update();
      },
      dispose: () => buffBar.dispose(),
    });

    const viewport = () => ({ width: globalThis.innerWidth ?? 1920, height: globalThis.innerHeight ?? 1080 });
    mount(
      'overlay',
      new LockOnMarker(doc, {
        viewport,
        targetScreen: () => {
          const id = soft(ctx, 'lockOn')?.targetId;
          const target = id ? ctx.actors.get(id) : undefined;
          const camera = ctx.camera;
          if (!target || target.dead || !camera) return null;
          const p = target.worldPosition(scratch);
          const { width, height } = viewport();
          return projectToScreen(camera, { x: p.x, y: p.y + 1.8, z: p.z }, width, height);
        },
      }),
      0,
    );

    mount(
      'top-right',
      new QuestTracker(doc, {
        // Looked up on every read: the quests plugin may set up after this one.
        get quests() {
          const q = soft(ctx, 'quests');
          return q ? { active: () => adaptQuests(q) } : undefined;
        },
        t,
      }),
      0,
    );

    const abilities = () => ctx.services.get('abilities');
    // Leap ring: learned state from the flag (survives a load), cooldown from spells.leap with a local 4 s fallback.
    let leapLearned = false;
    ctx.gates.flag('ability.surge-leap.learned', (open) => {
      leapLearned = open;
    });
    const leapSpells = () => soft(ctx, 'spells') as ({ burn?: number; leap?: { cooldown?: () => { remaining: number; total: number } } } | undefined);
    const leap = new LeapState({
      learned: () => leapLearned,
      cooldown: () => leapSpells()?.leap?.cooldown?.(),
      burn: () => leapSpells()?.burn,
    });
    ctx.events.on('player.leap', (e) => leap.onLeap(e.phase));
    const bar = new AbilityBar(doc, {
      leap: () => leap.info(),
      glyph: (a) => ctx.input.bindings.glyph(a as 'ability1'),
      t,
      slots: () => {
        const p = progression();
        if (!p) return [];
        const spells = soft(ctx, 'spells');
        return p.bar().map((skillId, slot): AbilitySlotInfo | null => {
          const def = skillId ? getSkill(skillId) : undefined;
          if (!skillId || !def) return null;
          const cost = def.emberCost ?? 0;
          return {
            skillId,
            nameKey: def.nameKey,
            cooldown: abilities()?.cooldown(slot) ?? { remaining: 0, total: 0 },
            emberCost: cost > 0 ? cost : undefined,
            affordable: !spells || spells.ember >= cost,
          };
        });
      },
    });
    ctx.events.on('ability.failed', (e) => bar.shake(e.slot));
    ctx.hud.mount('bottom-center', {
      id: bar.id,
      element: asHtml(bar.element),
      order: 12,
      update(dt) {
        leap.tick(dt ?? 0);
        bar.update();
      },
      dispose: () => bar.dispose(),
    });

    // Boss bar: initialised from ctx.bosses.active(), then driven by the boss.* events.
    const bosses = ctx.bosses;
    const bossBar = new BossBar(doc, {
      active: () => bosses?.active?.() ?? [],
      state: (id) => bosses?.state?.(id) ?? null,
      t,
    });
    ctx.events.on('boss.started', (e) => bossBar.started(e.bossId));
    for (const type of ['boss.phase', 'boss.break', 'boss.shield', 'boss.releaseWindow'] as const) {
      ctx.events.on(type, (e) => bossBar.touched(e.bossId));
    }
    for (const type of ['boss.defeated', 'boss.released', 'boss.ended'] as const) {
      ctx.events.on(type, (e) => bossBar.finished(e.bossId));
    }
    mount('top-center', bossBar, 0);

    // Companion portrait: read at setup and on save.loaded (a load emits no join events).
    const companionSvc = () => soft(ctx, 'companions');
    const portrait = new CompanionPortrait(doc, {
      active: () => companionSvc()?.active() ?? [],
      actorId: (id) => companionSvc()?.actorId(id) ?? null,
      actor: (id) => ctx.actors.get(id),
      t,
    });
    ctx.events.on('save.loaded', () => portrait.reload());
    ctx.events.on('companion.joined', (e) => portrait.joined(e.companionId, e.actorId));
    ctx.events.on('companion.left', (e) => portrait.left(e.companionId));
    ctx.events.on('companion.aura', (e) => portrait.aura(e.companionId, e.active));
    mount('top-left', portrait, 40);

    // "Act 1 continues" card, behind hudOptions.showActContinues.
    const keyTarget = typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as KeySource) : null;
    const card = new ActContinuesCard(doc, { t, keys: keyTarget, enabled: () => hudOptions.showActContinues });
    ctx.events.on('trigger.enter', (e) => card.onTrigger(e.triggerId));
    mount('center', card, 0);

    // respecModal service (thread 7 calls it; this plugin never calls progression).
    ctx.services.provide(
      'respecModal',
      createRespecModal({
        doc,
        t,
        keys: keyTarget as RespecModalDeps['keys'],
        openModal: (w) => ctx.hud.openModal({ id: w.id, element: asHtml(w.element), dispose: w.dispose }, { context: 'menu' }),
      }),
    );

    mount(
      'bottom-left',
      new NextUnlock(doc, {
        nextUnlock: () => progression()?.nextUnlock() ?? { kind: 'none' },
        skillPoints: () => progression()?.skillPoints ?? 0,
        skillName: (id) => {
          const def = getSkill(id);
          return def ? t(def.nameKey) : id;
        },
        t,
      }),
      10,
    );

    const toasts = new Toasts(doc);
    ctx.events.on('hud.toast', (e) => toasts.show(t(e.textKey, e.params)));
    ctx.hud.mount('toast', { id: toasts.id, element: asHtml(toasts.element), update: (dt) => toasts.tick(dt), dispose: () => toasts.dispose() });
  },
};

/** The XP bar's numbers: XP gained within the current level over the size of that level. */
export function xpBarProgress(p: Pick<ProgressionService, 'level' | 'xp'>): { level: number; xp: number; xpToNext: number; maxed: boolean } {
  const base = xpForLevel(p.level);
  return { level: p.level, xp: p.xp - base, xpToNext: xpForLevel(p.level + 1) - base, maxed: p.level >= LEVEL_CAP };
}

/** Maps thread 3's `objectives(id)` views ({ def, progress, done, current }) to the tracker's rows. */
export function adaptQuests(q: NonNullable<ReturnType<typeof soft<'quests'>>>): TrackedQuest[] {
  const out: TrackedQuest[] = [];
  for (const entry of q.active()) {
    const id = typeof entry === 'string' ? entry : (entry as { id?: unknown })?.id;
    if (typeof id !== 'string') continue;
    const objectives = q
      .objectives(id)
      .filter((v): v is ObjectiveViewLike => typeof v === 'object' && v !== null && typeof (v as ObjectiveViewLike).def === 'object')
      .filter((v) => v.current === true || v.done === true)
      .map((v) => ({
        textKey: v.def.textKey,
        progress: typeof v.progress === 'number' ? v.progress : 0,
        required: typeof v.def.required === 'number' && v.def.required > 0 ? v.def.required : 1,
        done: v.done === true,
        optional: v.def.optional === true,
      }));
    // Quests registered by other threads (the tutorial's beat quests) carry their own titleKey.
    const def = (q as { get?(id: string): { titleKey?: unknown } | undefined }).get?.(id);
    const titleKey = typeof def?.titleKey === 'string' ? def.titleKey : `quest.${id}.title`;
    out.push({ id, titleKey, objectives });
  }
  return out;
}

interface ObjectiveViewLike {
  def: { textKey: string; required?: number; optional?: boolean };
  progress?: number;
  done?: boolean;
  current?: boolean;
}

export default hudPlugin;
