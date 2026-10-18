import { ACTIONS, type Action } from '../input/actions';
import type { GamePlugin } from '../core/plugins';
import { hudDocument, asHtml, injectCss } from '../hud/soft';
import { HUD_CSS } from '../hud/hudStyles';
import { PromptList } from './PromptList';
import { PromptManager } from './PromptManager';
import { PROMPT_STRINGS_EN } from './strings.en';

const HINTS_KEY = 'owg.hints.v1';

function hintsStorage(): { get(): boolean | null; set(v: boolean): void } {
  return {
    get() {
      try {
        const raw = globalThis.localStorage?.getItem(HINTS_KEY);
        return raw === null || raw === undefined ? null : raw === '1';
      } catch {
        return null;
      }
    },
    set(v) {
      try {
        globalThis.localStorage?.setItem(HINTS_KEY, v ? '1' : '0');
      } catch {
        /* private mode: the toggle lasts for the session */
      }
    },
  };
}

const prompts: GamePlugin = {
  id: 'prompts',
  dependsOn: ['core'],
  setup(ctx) {
    ctx.strings.register('en', PROMPT_STRINGS_EN);
    const known = new Set<string>(ACTIONS);
    const manager = new PromptManager({
      clock: ctx.clock,
      bindings: { glyph: (a) => ctx.input.bindings.glyph(a as Action), has: (a) => known.has(a) },
      strings: ctx.strings,
      flags: { setFlag: (k, v) => ctx.state.setFlag(k, v) },
      keyboardLock: () => ctx.input.keyboardLock,
      storage: hintsStorage(),
      logger: { warn: (m) => console.warn(m) },
    });
    ctx.services.provide('prompts', manager);
    ctx.persist.register({
      key: PromptManager.key,
      version: PromptManager.version,
      serialize: () => manager.serialize(),
      load: (data) => manager.load(data),
    });
    ctx.input.bindings.onChange(() => manager.refresh());
    ctx.events.on('input.keyboardLock', () => manager.refresh());

    injectCss(HUD_CSS);
    const list = new PromptList(hudDocument());
    ctx.hud.mount('bottom-center', {
      id: 'prompts',
      element: asHtml(list.element),
      order: 10,
      update(frameTime) {
        manager.setVisible(ctx.hud.isVisible);
        manager.update(frameTime);
        list.render(manager.rows());
      },
    });
  },
};

export default prompts;
