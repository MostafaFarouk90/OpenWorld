import type { GamePlugin } from '../../core/plugins';
import type { GameContext } from '../../core/Game';
import { getSkill } from '../../progression/skills';
import type { Action } from '../actions';
import { PAD_SYNTHETIC } from '../InputManager';
import { MenuNavigator } from './MenuNavigator';
import type { NavRoot } from './MenuNavigator';
import { createRadialView, ensurePadCss } from './RadialView';
import { Rumble } from './rumble';
import { SCREEN_WEDGES, SKILL_WEDGES, SkillRadial } from './SkillRadial';
import type { RadialWedge } from './SkillRadial';
import { GAMEPAD_STRINGS_EN } from './strings.en';
import './services';

/** G1's services, read softly so G2 works before G1 merges (plans/g2-gamepad.md, seam agreed with G1). */
interface SettingsLike {
  get(): { padRumble?: boolean; padLookSensitivity?: number; padInvertY?: boolean };
  onChange(fn: () => void): () => void;
}
interface PauseMenuLike {
  readonly isOpen: boolean;
  back(): void;
}
const softGet = <T>(ctx: GameContext, name: string): T | undefined =>
  (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;

const SCREEN_KEYS: Partial<Record<Action, string>> = {
  inventory: 'gamepad.screen.inventory', skills: 'gamepad.screen.skills', journal: 'gamepad.screen.journal',
  map: 'gamepad.screen.map', codex: 'gamepad.screen.codex', party: 'gamepad.screen.party',
};

/** Builds the radial's wedges from the ability bar (names, cooldown, cost) and the screens list. */
export function radialWedges(ctx: GameContext, kind: 'skills' | 'screens', leapLearned: boolean): RadialWedge[] {
  const t = (k: string) => ctx.strings.t(k);
  if (kind === 'screens') return SCREEN_WEDGES.map((a) => ({ action: a, label: t(SCREEN_KEYS[a] ?? a), usable: true }));
  const bar = ctx.services.get('progression')?.bar() ?? [];
  const abilities = ctx.services.get('abilities');
  const spells = softGet<{ ember?: number }>(ctx, 'spells');
  return SKILL_WEDGES.map((action, i): RadialWedge => {
    if (action === 'surge') return { action, label: t('gamepad.radial.surge'), usable: true };
    if (action === 'surgeLeap') return { action, label: t('gamepad.radial.surgeLeap'), usable: leapLearned };
    const id = bar[i] ?? null;
    const def = id ? getSkill(id) : undefined;
    if (!id || !def) return { action, label: t('gamepad.radial.empty'), usable: false };
    const cd = abilities?.cooldown(i);
    const cost = def.emberCost ?? 0;
    const affordable = typeof spells?.ember !== 'number' || spells.ember >= cost;
    return { action, label: t(def.nameKey), usable: (cd?.remaining ?? 0) <= 0 && affordable };
  });
}

let teardown: (() => void) | null = null;

const gamepad: GamePlugin = {
  id: 'gamepad',
  dependsOn: ['core'],
  setup(ctx) {
    const svc = ctx.services.get('gamepad');
    if (!svc) return; // headless harnesses without an InputManager pad
    const { pad } = svc;
    ctx.strings.register('en', GAMEPAD_STRINGS_EN);
    ensurePadCss();

    // Settings (G1 SettingsStore keys) and the lock-on view.
    const settings = () => softGet<SettingsLike>(ctx, 'settings');
    const applySettings = () => {
      const s = settings()?.get();
      pad.sensitivity = typeof s?.padLookSensitivity === 'number' ? s.padLookSensitivity : 1;
      pad.invertY = s?.padInvertY === true;
    };
    applySettings();
    let offSettings: (() => void) | null = null;
    pad.lockedOn = () => ctx.cameraRig?.lockTarget?.() != null;

    // Menus.
    const doc = typeof document !== 'undefined' ? document : null;
    const nav = new MenuNavigator({
      context: () => ctx.input.contexts.top(),
      root: () => (ctx.hud.modalElement as unknown as NavRoot | null) ?? (doc as unknown as NavRoot | null),
      pauseMenu: () => softGet<PauseMenuLike>(ctx, 'pauseMenu'),
      key: (code, opts) => {
        if (!doc) return;
        const target = doc.activeElement ?? doc.body ?? doc;
        const init = { code, key: code === 'Escape' ? 'Escape' : code === 'Enter' ? 'Enter' : code, bubbles: true, cancelable: true, shiftKey: !!opts?.shift };
        for (const type of ['keydown', 'keyup']) {
          const ev = new KeyboardEvent(type, init);
          (ev as unknown as Record<string, unknown>)[PAD_SYNTHETIC] = true;
          target.dispatchEvent(ev);
        }
      },
    });

    // Radials.
    let leapLearned = false;
    ctx.gates.flag('ability.surge-leap.learned', (open) => {
      leapLearned = open;
    });
    let wrapper: HTMLElement | null = null;
    if (doc) {
      wrapper = doc.createElement('div');
      Object.assign(wrapper.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    }
    const view = createRadialView(wrapper, (k) => ctx.strings.t(k));
    const radial = new SkillRadial({
      context: () => ctx.input.contexts.top(),
      wedges: (kind) => radialWedges(ctx, kind, leapLearned),
      view,
    });
    const offRadial = pad.intercept(radial);
    const offNav = pad.intercept(nav); // asked first: menus own the pad

    // Rumble (design section 11): hits dealt and taken, boss phases, the siege gate.
    const rumble = new Rumble({
      pad: () => pad.gamepad,
      padActive: () => pad.active,
      enabled: () => settings()?.get().padRumble !== false,
      visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    });
    const playerId = () => ctx.player.actor.id;
    ctx.events.on('damage.dealt', (r) => {
      if (r.outcome !== 'hit' || !(r.dealt > 0)) return;
      if (r.targetId === playerId()) rumble.play('hitTaken');
      else if (r.attackerId === playerId()) rumble.play(r.killed || r.staggered ? 'heavyDealt' : 'hitDealt');
    });
    ctx.events.on('boss.phase', () => rumble.play('bossPhase'));
    const onAny = ctx.events as unknown as { on(n: string, fn: () => void): () => void };
    onAny.on('siege.ram.hit', () => rumble.play('ramHit'));

    // Unsupported pads get one toast each.
    const offUnsupported = pad.onUnsupported(() => ctx.events.emit('hud.toast', { textKey: 'gamepad.unsupported' }));

    teardown = () => {
      offNav();
      offRadial();
      offUnsupported();
      offSettings?.();
      offSettings = null;
      pad.lockedOn = () => false;
      pad.lookSuppressed = false;
      pad.releaseAll();
      view.dispose();
    };
    ctx.systems.add({
      id: 'gamepad.poll',
      renderPhase: 'world',
      order: -1000,
      render(_alpha, frameTime) {
        if (!offSettings) {
          const s = settings();
          if (s) offSettings = s.onChange(applySettings);
          applySettings();
        }
        pad.poll(frameTime);
        nav.frame(frameTime, pad);
        radial.frame(frameTime, pad);
      },
    });
    if (wrapper) ctx.hud.mount('overlay', { id: 'gamepad.radial', element: wrapper, order: 50 });
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

export default gamepad;
