import { Vector3 } from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { ElementLike } from './dom';
import './events';
import { AbilityBar, type AbilitySlotInfo } from './AbilityBar';
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
import { getSkill } from '../progression/skills';
import { LEVEL_CAP } from '../progression/tuning';

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
      ctx.hud.mount(slot, { id: view.id, element: asHtml(view.element), order, update: () => view.update(), dispose: () => view.dispose() });
    };

    mount(
      'top-left',
      new StatusBars(doc, {
        health: () => player().health,
        maxHealth: () => player().maxHealth,
        stamina: () => player().stamina,
        maxStamina: () => player().maxStamina,
        baseMaxHealth: () => progression()?.baseMaxHealth() ?? player().maxHealth,
        spells: () => soft(ctx, 'spells'),
        progress: () => {
          const p = progression();
          return p ? { level: p.level, xp: p.xp, xpToNext: p.xpToNext(), maxed: p.level >= LEVEL_CAP } : null;
        },
        t,
      }),
      20,
    );

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
        quests: (() => {
          const q = soft(ctx, 'quests');
          return q ? { active: () => adaptQuests(q) } : undefined;
        })(),
        t,
      }),
      0,
    );

    const abilities = () => ctx.services.get('abilities');
    const bar = new AbilityBar(doc, {
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
    ctx.hud.mount('bottom-center', { id: bar.id, element: asHtml(bar.element), order: 12, update: () => bar.update(), dispose: () => bar.dispose() });

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

/** Tolerates the quests service returning ids or objects until thread 3's shapes are pinned down. */
function adaptQuests(q: NonNullable<ReturnType<typeof soft<'quests'>>>): TrackedQuest[] {
  const out: TrackedQuest[] = [];
  for (const entry of q.active()) {
    const id = typeof entry === 'string' ? entry : (entry as { id?: unknown })?.id;
    if (typeof id !== 'string') continue;
    const objectives = q
      .objectives(id)
      .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
      .map((o) => ({
        textKey: typeof o.textKey === 'string' ? o.textKey : `quest.${id}.${String(o.id ?? '')}`,
        progress: typeof o.progress === 'number' ? o.progress : 0,
        required: typeof o.required === 'number' ? o.required : 1,
        done: o.done === true,
        optional: o.optional === true,
      }));
    out.push({ id, titleKey: `quest.${id}.title`, objectives });
  }
  return out;
}

export default hudPlugin;
