// G1 (plans/g1-settings-menu.md): the pause and settings menu. Esc in play opens it (or losing the pointer lock, which
// is how Chrome delivers the first Esc), the clock pauses while it is up, and it applies the player's audio settings at
// boot and on every change. Other plugins add items through the `pauseMenu` service (G3, G4) and read settings through
// the `settings` service (G2's pad settings live in the same store).
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { StubDocument, type DocumentLike } from '../hud/dom';
import type { Binding } from '../input/actions';
import { LineCards } from '../tutorial/Cards';
import { liftLeaveGuard } from '../world/leaveGuard';
import { installBarkSubtitles } from './barkSubtitles';
import { PauseController } from './PauseController';
import { PauseMenu, type PauseItem, type QualityChoice, type SaveResult } from './PauseMenu';
import { SettingsStore, type Settings } from './SettingsStore';
import { SETTINGS_STRINGS_EN } from './strings.en';
import { PAUSE_CSS } from './styles';
import './events';

export const PAUSE_STYLE_ID = 'owg-pause-style';

export interface SettingsService {
  get(): Readonly<Settings>;
  set(patch: Partial<Settings>): void;
  onChange(fn: (s: Readonly<Settings>) => void): () => void;
}

export interface PauseMenuItemDef extends PauseItem {
  /** The item shows while this holds. */
  when(): boolean;
}

export interface PauseMenuService {
  readonly isOpen: boolean;
  /** Opens the pause menu if play allows it (gameplay, no other screen up). */
  open(): boolean;
  /** Esc: a step back inside the menu, or resume from the pause screen. */
  back(): void;
  /** Adds an item to the pause screen while `when()` holds. Returns the undo. */
  addItem(item: PauseMenuItemDef): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    settings: SettingsService;
    pauseMenu: PauseMenuService;
  }
}

export interface SettingsPluginEnv {
  doc: (Document & DocumentLike) | null;
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout'> | null;
  reload(): void;
  now(): number;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function browserEnv(): SettingsPluginEnv {
  const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';
  return {
    doc: hasDom ? (document as unknown as Document & DocumentLike) : null,
    win: hasDom ? window : null,
    reload: () => window.location.reload(),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}

/** Test seam: replaces the browser environment for the next setups. */
let envOverride: (() => SettingsPluginEnv) | null = null;
export function setSettingsEnvForTest(make: (() => SettingsPluginEnv) | null): void {
  envOverride = make;
}

let teardown: (() => void) | null = null;

function applyAudio(ctx: GameContext, s: Readonly<Settings>): void {
  const audio = ctx.services.get('audio');
  if (!audio) return;
  try {
    audio.setMasterVolume(s.master / 100);
    audio.setMuted(s.muted);
    audio.setMusicVolume?.(s.music / 100);
    audio.setEffectsVolume?.(s.effects / 100);
  } catch (e) {
    console.error('[settings] audio settings failed', e);
  }
}

const plugin: GamePlugin = {
  id: 'settings',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    teardown?.();
    const env = envOverride?.() ?? browserEnv();
    const offs: (() => void)[] = [];
    offs.push(ctx.strings.register('en', SETTINGS_STRINGS_EN));
    if (env.doc) injectPauseCss(env.doc as Document);

    const store = new SettingsStore(env.storage === undefined ? undefined : env.storage);
    applyAudio(ctx, store.get());
    offs.push(store.onChange((s) => applyAudio(ctx, s)));
    const settingsService: SettingsService = {
      get: () => store.get(),
      set: (p) => store.set(p),
      onChange: (fn) => store.onChange(fn),
    };
    offs.push(ctx.services.provide('settings', settingsService));

    // Companion barks as subtitles.
    const cards = new LineCards({ doc: env.doc as Document | null, mount: (slot, w, order) => ctx.hud.mount(slot, { ...w, order }) }, 1);
    offs.push(
      installBarkSubtitles({
        events: ctx.events,
        t: (k) => ctx.strings.t(k),
        has: (k) => ctx.strings.has(k),
        cards,
        enabled: () => store.get().barkSubtitles,
        busy: () => ctx.input.contexts.top() !== 'gameplay',
      }),
    );
    offs.push(ctx.systems.add({ id: 'settings.barkCards', fixedPhase: 'late', order: 900, fixedUpdate: (dt) => cards.tick(dt) }));

    const items: PauseMenuItemDef[] = [];
    const t = (k: string, p?: Record<string, string | number>) => ctx.strings.t(k, p);

    const quality = (): { get(): QualityChoice; set(c: QualityChoice): void } | null => {
      const q = ctx.services.get('quality');
      if (!q) return null;
      return {
        get: () => (q.userChosen === false ? 'auto' : q.step),
        set: (c) => (c === 'auto' ? q.setAuto?.() : q.setStep(c)),
      };
    };
    const hints = () => {
      const p = ctx.services.get('prompts');
      if (!p) return null;
      return { get: () => p.showHintsAlways, set: (on: boolean) => void (p.showHintsAlways = on) };
    };
    const canSave = (): boolean => {
      const s = ctx.services.get('save');
      if (!s) return false;
      return s.canSaveNow ? s.canSaveNow() : true;
    };
    const save = async (): Promise<SaveResult> => {
      const s = ctx.services.get('save');
      if (!s || !canSave()) return 'blocked';
      const r = await s.saveNow('manual');
      return r.ok ? 'done' : r.reason === 'deferred' || r.reason === 'loading' || r.reason === 'protected' ? 'blocked' : 'failed';
    };

    // The next key or mouse button, for the Controls tab. Capture phase, so the game never sees it.
    const listen = (cb: (b: Binding) => void): (() => void) => {
      const win = env.win;
      if (!win) return () => {};
      let done = false;
      const stop = () => {
        done = true;
        win.removeEventListener('keydown', onKey, true);
        win.removeEventListener('mousedown', onMouse, true);
      };
      const onKey = (e: Event) => {
        const k = e as KeyboardEvent;
        if (done || k.code === 'Escape' || !k.code) return; // Esc is the menu's back key
        k.preventDefault();
        k.stopPropagation();
        stop();
        cb({ device: 'key', code: k.code });
      };
      const onMouse = (e: Event) => {
        const m = e as MouseEvent;
        if (done || m.button < 0 || m.button > 4) return;
        m.preventDefault();
        m.stopPropagation();
        stop();
        cb({ device: 'mouse', button: m.button as 0 | 1 | 2 | 3 | 4 });
      };
      // After the click that started the capture has finished, or it would bind itself.
      win.setTimeout(() => {
        if (done) return;
        win.addEventListener('keydown', onKey, true);
        win.addEventListener('mousedown', onMouse, true);
      }, 0);
      return stop;
    };

    let quitting = false;
    const quit = async (): Promise<void> => {
      if (quitting) return;
      quitting = true;
      ctx.events.emit('settings.quitting', {});
      try {
        if (canSave()) await ctx.services.get('save')?.saveNow('exit');
      } catch (e) {
        console.error('[settings] save before quitting failed', e);
      }
      liftLeaveGuard();
      env.reload();
    };

    const controller = new PauseController({
      canOpen: () => ctx.input.contexts.top() === 'gameplay' && ctx.hud.modalOpen === null && !quitting,
      beatActive: () => {
        try {
          return ctx.services.get('tutorial')?.skipBeatActive?.() ?? false;
        } catch {
          return false;
        }
      },
      setPaused: (on) => ctx.clock.setPaused('pause-menu', on),
      now: () => env.now(),
      openMenu: () => {
        // Headless (no document): the stub DOM runs the menu's logic and draws nothing.
        const menu = new PauseMenu(env.doc ?? new StubDocument(), {
          t,
          settings: settingsService,
          quality: quality(),
          hints: hints(),
          bindings: ctx.input.bindings,
          listen,
          items: () => items.filter((i) => safeWhen(i)),
          canSave,
          save,
          resume: () => controller.close(),
          quit: () => void quit(),
        });
        const close = ctx.hud.openModal(
          { id: menu.id, element: menu.element as unknown as HTMLElement, update: () => menu.update(), dispose: () => menu.dispose() },
          { context: 'menu' },
        );
        if (!close) {
          menu.dispose();
          return null;
        }
        return { menu, close };
      },
    });

    const pauseService: PauseMenuService = {
      get isOpen() {
        return controller.isOpen;
      },
      open: () => controller.open(),
      back: () => controller.back(),
      addItem: (item) => {
        items.push(item);
        return () => {
          const i = items.indexOf(item);
          if (i >= 0) items.splice(i, 1);
        };
      },
    };
    offs.push(ctx.services.provide('pauseMenu', pauseService));

    // Gamepad Start and any other route that feeds the `menu` action while play runs (the clock is not paused yet).
    offs.push(
      ctx.systems.add({
        id: 'settings.pause.input',
        fixedPhase: 'input',
        order: 950,
        fixedUpdate: () => controller.onMenuAction(ctx.input.actions.pressed('menu'), ctx.input.actions.down('menu')),
      }),
    );
    // A load or a modal from elsewhere (an ending) closes the menu.
    offs.push(ctx.events.on('save.loaded', () => controller.close()));
    offs.push(
      ctx.events.on('ui.modal', (e) => {
        if (!e.open && e.id !== 'pause-menu') controller.noteModalClosed();
      }),
    );

    const win = env.win;
    const doc = env.doc;
    if (win) {
      const onDown = (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.code !== 'Escape' || k.repeat) return;
        controller.onEscDown();
      };
      const onUp = (e: Event) => {
        if ((e as KeyboardEvent).code === 'Escape') controller.onEscUp();
      };
      win.addEventListener('keydown', onDown, true);
      win.addEventListener('keyup', onUp, true);
      offs.push(() => {
        win.removeEventListener('keydown', onDown, true);
        win.removeEventListener('keyup', onUp, true);
      });
    }
    if (doc && typeof (doc as Document).addEventListener === 'function') {
      const onLock = () => {
        if (!(doc as Document).pointerLockElement) controller.onPointerLockLost();
      };
      (doc as Document).addEventListener('pointerlockchange', onLock);
      offs.push(() => (doc as Document).removeEventListener('pointerlockchange', onLock));
    }

    teardown = () => {
      controller.close();
      for (const o of offs.splice(0).reverse()) {
        try {
          o();
        } catch (e) {
          console.error('[settings] teardown step failed', e);
        }
      }
      teardown = null;
    };
  },
  dispose() {
    teardown?.();
  },
};

function injectPauseCss(doc: Document): void {
  if (typeof doc.getElementById !== 'function' || doc.getElementById(PAUSE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = PAUSE_STYLE_ID;
  el.textContent = PAUSE_CSS;
  doc.head?.appendChild(el);
}

function safeWhen(i: PauseMenuItemDef): boolean {
  try {
    return i.when();
  } catch {
    return false;
  }
}

export default plugin;
