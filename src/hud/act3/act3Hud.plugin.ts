import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { ShardGemService } from '../../gear/sockets/shardGems.plugin';
import type { FerryService } from '../../traversal/service';
import type { WaterService } from '../../water/types';
import { asHtml, hudDocument } from '../soft';
import { BreathMeter } from './BreathMeter';
import { createFerryMenu, type FerryMenuFerry } from './FerryMenu';
import { createSocketScreen, type SocketScreenKeys } from './SocketScreen';
import { ACT3_HUD_STRINGS_EN } from './strings.en';
import '../../traversal/service';
import '../../gear/sockets/shardGems.plugin';
import '../../water/types';

/** The Act 3 HUD's own styles (the shared `owg-` sheet is injected once by the hud plugin, so these ride in a second one). */
export const ACT3_HUD_CSS = `
.owg-breath{width:260px;pointer-events:none;margin-top:4px}
.owg-bar-breath{height:6px}
.owg-bar-breath .owg-bar-fill{background:#5aa0d0}
.owg-breath-low .owg-bar-fill{background:#d0603a}
.owg-ferry-menu .owg-row,.owg-sockets .owg-row{display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:4px}
.owg-ferry-menu .owg-selected,.owg-sockets .owg-selected{background:rgba(240,216,144,.15)}
.owg-sockets .owg-focus,.owg-ferry-menu .owg-focus{outline:1px solid #f0d890}
.owg-sockets-head{margin:10px 0 4px;font-size:14px;color:#f0d890}
.owg-sockets-piece{font-weight:600}
`;

const STYLE_ID = 'owg-act3-style';
function injectAct3Css(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = ACT3_HUD_CSS;
  document.head.appendChild(el);
}

/** What the plugin hooked into other owners' services, so `dispose` can put the old behaviour back. */
const unhook: (() => void)[] = [];

/**
 * K15 PR 1's HUD half: the breath meter, the ferry stop menu (K7's `ferry.setMenu`) and the socket screen (K10's
 * `shardGems.setScreen`). Everything is read through optional services: without K7 or K10 the widgets simply never show,
 * and with this plugin off the ferry boards its default destination and the socket panel is K10's fallback.
 */
const act3Hud: GamePlugin = {
  id: 'act3-hud',
  dependsOn: ['core', 'hud'],
  dispose() {
    for (const u of unhook.splice(0).reverse()) u();
  },
  setup(ctx: GameContext) {
    ctx.strings.register('en', ACT3_HUD_STRINGS_EN);
    injectAct3Css();
    const doc = hudDocument();
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const svc = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;
    const keys = typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as SocketScreenKeys) : null;

    // Breath: polled each frame from the water service (state and breath), so it hides on surfacing and after a load.
    const meter = new BreathMeter(doc, {
      t,
      water: () => {
        const w = svc<WaterService>('water');
        return w ? { state: w.state, breath: w.breath } : undefined;
      },
    });
    ctx.hud.mount('top-left', { id: meter.id, element: asHtml(meter.element), order: 28, update: () => meter.update(), dispose: () => meter.dispose() });

    const menu = createFerryMenu({
      doc,
      t,
      keys,
      ferry: () => svc<FerryService>('ferry') as FerryMenuFerry | undefined,
      stopName: (id) => t(`ferry.stop.${id}`),
      openModal: (w) => ctx.hud.openModal({ id: w.id, element: asHtml(w.element), dispose: w.dispose }, { context: 'menu' }),
    });
    const screen = createSocketScreen(keys);

    // The hooks are set once the services exist (a plugin that sets up later is retried), and undone on dispose.
    let menuSet = false;
    let screenSet = false;
    const link = (): void => {
      if (!menuSet) {
        const ferry = svc<FerryService>('ferry');
        if (ferry?.setMenu) {
          ferry.setMenu(menu.open);
          menuSet = true;
          unhook.push(() => ferry.setMenu(null));
        }
      }
      if (!screenSet) {
        const gems = svc<ShardGemService>('shardGems');
        if (gems?.setScreen) {
          gems.setScreen(screen);
          screenSet = true;
          unhook.push(() => gems.setScreen(null));
        }
      }
    };
    link();
    ctx.systems.add({ id: 'act3-hud.link', fixedPhase: 'rules', order: 462, fixedUpdate: () => (menuSet && screenSet ? undefined : link()) });
  },
};

export default act3Hud;
