import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { ShardGemService } from '../../gear/sockets/shardGems.plugin';
import type { FerryService, GlideService } from '../../traversal/service';
import type { WaterService } from '../../water/types';
import { asHtml, hudDocument } from '../soft';
import { BreathMeter } from './BreathMeter';
import { GlideIndicator } from './GlideIndicator';
import { createFerryMenu, type FerryMenuFerry } from './FerryMenu';
import { YieldPrompt, type YieldTrials } from './YieldPrompt';
import { createSocketScreen, type SocketScreenKeys } from './SocketScreen';
import { ACT3_HUD_STRINGS_EN } from './strings.en';
import '../../traversal/service';
import '../../gear/sockets/shardGems.plugin';
import '../../water/types';

/** The Act 3 HUD's own styles (the shared `owg-` sheet is injected once by the hud plugin, so these ride in a second one). */
export const ACT3_HUD_CSS = `
.owg-breath{width:260px;pointer-events:none;margin-top:4px;display:flex;align-items:center;gap:6px}
.owg-breath-label{font-size:10px;line-height:1;text-shadow:0 1px 2px #000;min-width:38px}
.owg-bar-breath{height:6px;flex:1}
.owg-bar-breath .owg-bar-fill{background:#5aa0d0}
.owg-breath-low .owg-bar-fill{background:#d0603a}
.owg-glide{display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;font-size:12px;text-shadow:0 1px 2px #000}
.owg-glide-lane{position:relative;width:200px;height:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:3px}
.owg-glide-centre{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.4)}
.owg-glide-marker{position:absolute;top:-2px;width:6px;height:12px;margin-left:-3px;background:#f0d890;border-radius:2px}
.owg-glide-row{display:flex;gap:10px}
.owg-glide-rising{color:#8fd08f}
.owg-glide-sinking{color:#d0803a}
.owg-yield{display:none;align-items:center;gap:10px;pointer-events:none;padding:6px 14px;border-radius:6px;background:rgba(20,16,12,.84);border:1px solid #6a5a3a;box-shadow:0 2px 10px rgba(0,0,0,.45);color:#f3ead8;font:15px system-ui,sans-serif;white-space:nowrap}
.owg-yield-text{color:#f3ead8}
.owg-yield-ring{flex:none;width:22px;height:22px;border-radius:50%;-webkit-mask:radial-gradient(circle,transparent 6px,#000 7px);mask:radial-gradient(circle,transparent 6px,#000 7px)}
/* The journal's favour tabs (Houses and Dragons' Trust) use unprefixed classes; the shared sheet is owg- only, so their bar rides here. */
.owg-journal .journal-heading{margin:0 0 10px;font-size:16px;color:#f0d890}
.owg-journal .favour-row{margin:0 0 14px}
.owg-journal .favour-head{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}
.owg-journal .favour-name{flex:1;font-weight:600}
.owg-journal .favour-band{opacity:.8;font-size:13px}
.owg-journal .favour-value{min-width:28px;text-align:right;color:#f0d890;font-weight:700}
.owg-journal .favour-bar{height:8px;border-radius:4px;background:rgba(255,255,255,.1);border:1px solid #6a5a3a;overflow:hidden}
.owg-journal .favour-fill{height:100%;width:0;background:linear-gradient(90deg,#a8742a,#e0b040)}
.owg-journal .favour-tick{top:0;bottom:0;width:1px;background:rgba(255,255,255,.4)}
.owg-journal .favour-last{margin-top:4px;font-size:12px;opacity:.7}
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

    // Glide indicator: polled each frame from K7's glide service, hidden unless a glide is running.
    const glideIndicator = new GlideIndicator(doc, {
      t,
      glide: () => svc<GlideService>('glide'),
    });
    ctx.hud.mount('bottom-center', { id: glideIndicator.id, element: asHtml(glideIndicator.element), order: 30, update: () => glideIndicator.update(), dispose: () => glideIndicator.dispose() });

    // Yield prompt and its hold (K15 owns the hold; K6a owns canYield and yield). Generic: any trial with `allowYield`.
    const yieldPrompt = new YieldPrompt(doc, {
      t,
      trials: () => svc<YieldTrials>('trials'),
      mercyDown: () => ctx.input.actions.down('mercy'),
      mercyPressed: () => ctx.input.actions.pressed('mercy'),
      glyph: () => ctx.input.bindings.glyph('mercy'),
      mercyFocused: () => ctx.interaction.focusFor('mercy') !== null,
    });
    ctx.hud.mount('bottom-center', { id: yieldPrompt.id, element: asHtml(yieldPrompt.element), order: 31, update: () => yieldPrompt.update(), dispose: () => yieldPrompt.dispose() });
    ctx.systems.add({ id: 'act3-hud.yield', fixedPhase: 'input', order: 90, fixedUpdate: (dt) => yieldPrompt.tick(dt) });

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
