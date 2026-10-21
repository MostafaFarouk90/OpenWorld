import { Vector3 } from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { ElementLike } from './dom';
import './events';
import { AbilityBar, LeapState, type AbilitySlotInfo } from './AbilityBar';
import { ActEndingCard, ACT_ENDING_CAMP_FLAGS, ACT_ENDING_GATE_FLAG, ACT_ENDING_SEEN_FLAG, ACT_ENDING_SEEN_FLAG_V06, type KeySource } from './ActEndingCard';
import { BossBar } from './BossBar';
import { ChaseTimer } from './ChaseTimer';
import { ClassLabel } from './ClassLabel';
import { BoltCounter } from './BoltCounter';
import { MountStamina } from './MountStamina';
import { NoiseRing, StealthEye } from './StealthEye';
import { CompanionPortrait } from './CompanionPortrait';
import { PartyScreen } from './PartyScreen';
import { StructureBar } from './StructureBar';
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
import { FOG_TRIGGER_ID, fogOpen, fogOpenById, fogWallForTrigger } from '../region/fogWall';
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
    const bodyEl = () => (typeof document !== 'undefined' ? document.body : undefined);
    let burnClass = false;
    ctx.hud.mount('top-left', {
      id: status.id,
      element: asHtml(status.element),
      order: 20,
      update() {
        status.update();
        const hot = (soft(ctx, 'spells')?.burn ?? 0) >= 75;
        if (hot !== burnClass) {
          burnClass = hot;
          bodyEl()?.classList?.toggle('owg-burn-scar', hot);
        }
      },
      dispose: () => {
        burnClass = false;
        bodyEl()?.classList?.remove('owg-burn-scar');
        status.dispose();
      },
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
      // The core controls hint (top-left, up to 560 px) would run under the centred bar; hide it while a boss shows.
      onVisible: (v) => {
        if (typeof document !== 'undefined') document.documentElement.classList.toggle('owg-boss-active', v);
      },
    });
    ctx.events.on('boss.started', (e) => bossBar.started(e.bossId));
    for (const type of ['boss.phase', 'boss.break', 'boss.shield', 'boss.releaseWindow'] as const) {
      ctx.events.on(type, (e) => bossBar.touched(e.bossId));
    }
    for (const type of ['boss.defeated', 'boss.released', 'boss.ended'] as const) {
      ctx.events.on(type, (e) => bossBar.finished(e.bossId));
    }
    mount('top-center', bossBar, 0);

    // Companion portrait: the row set follows the party's active() (a swap emits no `left`), re-read at setup, on
    // `save.loaded` and on every join, leave and party change.
    const companionSvc = () => soft(ctx, 'companions');
    const partySvc = () => ctx.services.get('party');
    const portrait = new CompanionPortrait(doc, {
      active: () => companionSvc()?.active() ?? [],
      actorId: (id) => companionSvc()?.actorId(id) ?? null,
      actor: (id) => ctx.actors.get(id),
      info: (id) => partySvc()?.options().find((o) => o.id === id),
      t,
    });
    ctx.events.on('save.loaded', () => portrait.reload());
    for (const type of ['companion.joined', 'companion.left', 'party.changed'] as const) ctx.events.on(type, () => portrait.reload(true));
    ctx.events.on('companion.aura', (e) => portrait.aura(e.companionId, e.active));
    ctx.events.on('companion.downed', (e) => portrait.downed(e.companionId, true));
    ctx.events.on('companion.stood', (e) => portrait.downed(e.companionId, false));
    mount('top-left', portrait, 40);

    // Barricade and brazier-cart health (A7's structures).
    const structureBar = new StructureBar(doc, {
      actor: (id) => ctx.actors.get(id),
      structure: (id) => ctx.services.get('waves')?.structure(id),
      t,
    });
    ctx.events.on('structure.damaged', (e) => structureBar.damaged(e.id, e.health));
    ctx.events.on('structure.destroyed', (e) => structureBar.destroyed(e.id));
    ctx.events.on('wave.started', () => structureBar.waveStarted());
    ctx.events.on('wave.cleared', () => structureBar.waveCleared());
    ctx.events.on('waves.failed', () => structureBar.reset());
    ctx.events.on('save.loaded', () => structureBar.reset(true));
    mount('top-center', structureBar, 2);

    // The Party screen: key P (read-only outside the waystone window) or a waystone rest with two companions.
    const downedIds = new Set<string>();
    ctx.events.on('companion.downed', (e) => downedIds.add(e.companionId));
    ctx.events.on('companion.stood', (e) => downedIds.delete(e.companionId));
    ctx.events.on('save.loaded', () => downedIds.clear());
    let closeParty: (() => void) | null = null;
    const openParty = (): void => {
      const svc = partySvc();
      if (!svc || ctx.hud.modalOpen) return;
      const screen = new PartyScreen(doc, {
        canChange: () => svc.canChange(),
        options: () => svc.options(),
        maxActive: () => companionSvc()?.maxActive?.() ?? 1,
        change: (ids) => svc.change(ids),
        downed: () => downedIds,
        close: () => closeParty?.(),
        t,
      });
      const off = ctx.hud.openModal({ id: screen.id, element: asHtml(screen.element), update: () => screen.update(), dispose: () => screen.dispose() }, { context: 'menu' });
      if (!off) {
        screen.dispose();
        return;
      }
      closeParty = () => {
        off();
        closeParty = null;
      };
    };
    ctx.events.on('party.offered', () => openParty());
    ctx.events.on('save.loaded', () => closeParty?.());
    ctx.systems.add({
      id: 'hud.party.input',
      fixedPhase: 'input',
      order: 0,
      fixedUpdate() {
        const actions = ctx.input.actions;
        if (ctx.hud.modalOpen === 'party-screen') {
          if (actions.pressed('party') || actions.pressed('menu')) closeParty?.();
          return;
        }
        if (!actions.pressed('party') || ctx.input.contexts.top() !== 'gameplay' || ctx.hud.modalOpen) return;
        openParty();
      },
    });

    const keyTarget = typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as KeySource) : null;

    // The fog wall before M05 (its trigger exists only while the wall stands): one toast per session on walking into it.
    let fogToasted = false;
    ctx.events.on('trigger.enter', (e) => {
      if (e.triggerId !== FOG_TRIGGER_ID || fogToasted || fogOpen(ctx.state)) return;
      fogToasted = true;
      ctx.events.emit('hud.toast', { textKey: 'hud.fog.toast' });
    });
    // v0.6: the other fog walls (A1's Act 2 faces), one toast per wall per session with the wall's own text.
    const fogToastedIds = new Set<string>();
    ctx.events.on('trigger.enter', (e) => {
      const wall = e.triggerId === FOG_TRIGGER_ID ? undefined : fogWallForTrigger(e.triggerId);
      if (!wall || fogToastedIds.has(wall.id) || fogOpenById(wall.id, ctx.state)) return;
      fogToastedIds.add(wall.id);
      ctx.events.emit('hud.toast', { textKey: wall.toastKey });
    });

    // Act 1 mini-ending card: live on act.ended, re-derived on load only while neither once-flag is set.
    const ending = new ActEndingCard(doc, {
      t,
      keys: keyTarget,
      modalOpen: () => ctx.hud.modalOpen !== null,
      seen: () => ctx.state.getBool(ACT_ENDING_SEEN_FLAG) || ctx.state.getBool(ACT_ENDING_SEEN_FLAG_V06),
      campSeen: () => ACT_ENDING_CAMP_FLAGS.some((f) => ctx.state.getBool(f)),
      markSeen: () => {
        ctx.state.setFlag(ACT_ENDING_SEEN_FLAG, true);
        ctx.state.setFlag(ACT_ENDING_SEEN_FLAG_V06, true);
      },
      closed: (endingId) => ctx.events.emit('hud.actEnding.closed', { endingId }),
    });
    ctx.events.on('act.ended', (e) => ending.onActEnded(e));
    ctx.events.on('save.loaded', () => ending.onLoaded());
    ctx.gates.flag(ACT_ENDING_GATE_FLAG, (open) => ending.onGate(open));
    mount('center', ending, 1);
    ctx.services.provide('actEndingCard', { active: () => ending.active, dismiss: () => ending.dismiss() });

    // Phase B readers: every service optional, looked up on each read (plugins may set up after this one).
    mount(
      'top-center',
      new StealthEye(doc, { t, eye: () => soft(ctx, 'stealth')?.eye() }),
      10,
    );
    // Full-viewport slot: the top-center slot is transformed, which would break the ring's position:fixed centring.
    mount('overlay', new NoiseRing(doc, { t, noise: () => soft(ctx, 'stealth')?.noise() }), 5);
    mount('top-center', new ChaseTimer(doc, { t, timer: () => soft(ctx, 'chase')?.timer() }), 20);
    mount('top-left', new BoltCounter(doc, { t, ammo: () => soft(ctx, 'pathfinder')?.ammo() }), 26);
    mount('top-left', new MountStamina(doc, { t, stamina: () => soft(ctx, 'mount')?.stamina() }), 25);
    mount(
      'top-left',
      new ClassLabel(doc, {
        t,
        chosen: () => soft(ctx, 'classes')?.chosen(),
        current: () => soft(ctx, 'classes')?.current(),
        nameKey: (id) => soft(ctx, 'classes')?.kit(id)?.nameKey,
        gold: () => soft(ctx, 'inventory')?.gold,
      }),
      27,
    );

    // respecModal service (thread 7 calls it; this plugin never calls progression).
    ctx.services.provide(
      'respecModal',
      createRespecModal({
        doc,
        t,
        keys: keyTarget as RespecModalDeps['keys'],
        gold: () => {
          const g = (soft(ctx, 'inventory') as { gold?: unknown } | undefined)?.gold;
          return typeof g === 'number' && Number.isFinite(g) ? g : undefined;
        },
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
