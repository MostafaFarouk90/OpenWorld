import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { ElementLike } from '../dom';
import { asHtml, hudDocument } from '../soft';
import { makeEl, setShown, type HudWidgetView } from '../widget';
import { Act5Screens, type Act5ScreensService, type KeySource2 } from './Screens';
import { LavaFlash } from './lavaCue';
import { M52_COMPLETE_FLAG } from './ports';
import { rimHoldsLines } from './phaseCard';
import { SiegeHud } from './SiegeHud';
import { SpareCue } from './spareCue';
import { SiegeModel } from './siegeModel';
import { ventCue, type VentReading } from './ventCue';
import { ACT5_CREDITS_STRINGS_EN, ACT5_HUD_STRINGS_EN } from './strings.en';
import './events';
import '../StructureBar';

declare module '../../core/Services' {
  interface GameServices {
    /** Act 5 N9: "The Rim holds", the epilogue slides and the credits. N11 PR 2 and N12 supply data and timing. */
    act5Screens: Act5ScreensService;
  }
}

export const ACT5_HUD_CSS = `
.owg-siege{width:300px;pointer-events:none;margin-top:6px;font:12px/1.25 system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
.owg-siege-wave{font-weight:700;color:#f0d890;margin-bottom:3px}
.owg-siege-gate .owg-bar-fill{background:#4a90c0}
.owg-siege-warn .owg-bar-fill{background:#d8a040}
.owg-siege-low .owg-bar-fill{background:#c0503a}
.owg-siege-breached .owg-bar-fill{background:#8a1f1f}
.owg-siege-ram{display:flex;align-items:center;gap:6px;margin-top:3px}
.owg-siege-ram-bar{flex:1;height:6px}
.owg-siege-ram .owg-bar-fill{background:#a07040}
.owg-siege-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.owg-siege-chip{padding:0 6px;border-radius:3px;border:1px solid rgba(255,255,255,.25);font-size:11px;background:rgba(0,0,0,.45)}
.owg-siege-flash{margin-top:3px;color:#f0d890;min-height:1em}
.owg-siege-line{color:#cfe8c0;min-height:1em}
.owg-vent{margin-top:4px;pointer-events:none;font:12px system-ui,sans-serif;color:#f0c890;text-shadow:0 1px 2px #000}
.owg-vent-arrow{display:inline-block;width:14px;text-align:center}
.owg-spare{pointer-events:none;text-align:center;font:600 20px/1.3 system-ui,sans-serif;color:#f0d890;text-shadow:0 2px 4px #000;margin-top:140px}
.owg-spare-count{font-size:28px;color:#fff}
.owg-lava-flash{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(220,70,20,.55) 100%);opacity:0}
.owg-act5-screen{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,6,4,.92);color:#f3ead8;font:18px/1.5 Georgia,serif;text-align:center;z-index:50}
.owg-act5-body{max-width:640px;padding:0 16px}
.owg-act5-title{margin:0 0 16px;color:#f0d890;font-size:30px}
.owg-act5-line{margin:6px 0}
.owg-act5-verse{font-style:italic}
.owg-act5-hint{position:absolute;bottom:20px;font:12px system-ui,sans-serif;opacity:.6}
`;

const STYLE_ID = 'owg-act5-style';
function injectCss(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = ACT5_HUD_CSS;
  document.head.appendChild(el);
}

interface LavaLike {
  vents?(): readonly VentReading[];
}
/** N4's `siege` service (plans/act5-N4.md sections 12 and 18); every part is optional here. */
interface SiegeSvcLike {
  defs?: readonly { id: string; waves: readonly unknown[] }[] | Record<string, { id?: string; waves: readonly unknown[] }>;
  rams?(): readonly { id: string; stalled: number }[];
  structures?(siegeId: string): readonly string[];
  allies?(): readonly { id: string; role?: string }[];
  current?: { siegeId?: string; wave?: number; gatePct?: number; breached?: boolean } | null;
  completed?(siegeId: string): boolean;
}
interface StructureLike {
  structure?(id: string): { kind: string; maxHealth: number; role?: string } | undefined;
}

/** The Act 5 HUD plugin (plans/act5-N9.md sections 1, 2, 5 to 7). Every reading is soft: no siege, lava or waves service means nothing shows. */
const act5Hud: GamePlugin = {
  id: 'act5-hud',
  dependsOn: ['core', 'hud'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', { ...ACT5_HUD_STRINGS_EN, ...ACT5_CREDITS_STRINGS_EN });
    injectCss();
    const doc = hudDocument();
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const svc = ctx.services as unknown as { get(n: string): unknown; provide?(n: string, v: unknown): void };
    const loose = ctx.events.on as unknown as (n: string, f: (e: never) => void) => () => void;
    const on = (n: string, f: (e: never) => void): (() => void) => loose.call(ctx.events, n, f);

    const siegeSvc = (): SiegeSvcLike | undefined => svc.get('siege') as SiegeSvcLike | undefined;
    const model = new SiegeModel({
      over: (id) => (id === 'm52' && ctx.state.getBool(M52_COMPLETE_FLAG)) || (siegeSvc()?.completed?.(id) ?? false),
      waveTotal: (id) => {
        const d = siegeSvc()?.defs;
        const def = Array.isArray(d) ? d.find((x) => x.id === id) : (d as Record<string, { waves: readonly unknown[] }> | undefined)?.[id];
        return def && Array.isArray(def.waves) ? def.waves.length : null;
      },
    });
    // Until N4 names its ram ids (asked), a ram is a structure whose role says so or whose id has a `ram` segment.
    const isRam = (id: string): boolean =>
      (svc.get('waves') as StructureLike | undefined)?.structure?.(id)?.role === 'ram' || /(^|[.\-_])ram($|[.\-_\d])/.test(id);
    const siege = new SiegeHud(doc, {
      model,
      t,
      chipName: (id) => {
        const role = siegeSvc()?.allies?.().find((a) => a.id === id)?.role;
        if (role && ACT5_HUD_STRINGS_EN[`hud.siege.ally.${role}`]) return t(`hud.siege.ally.${role}`);
        if (ACT5_HUD_STRINGS_EN[`hud.siege.ally.${id}`]) return t(`hud.siege.ally.${id}`);
        return /dragon|wyrm/i.test(id) ? t('hud.siege.ally.dragon') : t('hud.siege.ally.company');
      },
      poll: () => {
        for (const r of siegeSvc()?.rams?.() ?? []) model.setStall(r.id, r.stalled);
      },
    });
    ctx.hud.mount('top-center', { id: siege.id, element: asHtml(siege.element), order: 5, update: (dt) => siege.update(dt), dispose: () => siege.dispose() });
    // The siege HUD draws the gate and the rams, so the shared structure bar skips rams while a siege is live.
    const barSvc = (): { suppress(p: ((id: string) => boolean) | null): void } | undefined => svc.get('structureBar') as { suppress(p: ((id: string) => boolean) | null): void } | undefined;
    const suppressPred = (id: string): boolean => {
      // The director announces the gate (structure.damaged) before siege.wave.started, so the siege id also comes from the service.
      const sid = model.view()?.siegeId ?? siegeSvc()?.current?.siegeId;
      if (!sid) return false;
      const listed = siegeSvc()?.structures?.(sid);
      // The gate and the rams only: brazier carts keep the shared bar (N4's list holds the gate and every cart).
      return listed ? listed.includes(id) && (!id.includes('.cart.') || isRam(id)) : isRam(id) || /gate/.test(id);
    };
    barSvc()?.suppress(suppressPred);

    // Vent cue and lava flash.
    const ventEl = makeEl(doc, 'div', 'owg-vent');
    const ventArrow = makeEl(doc, 'span', 'owg-vent-arrow', ventEl);
    const ventText = makeEl(doc, 'span', 'owg-vent-text', ventEl);
    setShown(ventEl, false);
    const vent: HudWidgetView & { element: ElementLike } = {
      id: 'vent-cue',
      element: ventEl,
      update() {
        const lava = svc.get('lava') as LavaLike | undefined;
        let v = null;
        try {
          v = ventCue(lava?.vents?.(), { x: ctx.player.feet.x, z: ctx.player.feet.z }, ctx.cameraRig?.yaw ?? ctx.player.facingYaw);
        } catch {
          v = null;
        }
        setShown(ventEl, v !== null);
        if (!v) return;
        ventText.textContent = `${t(v.textKey, v.params)} (${t('hud.vent.to', { m: v.distance })})`;
        ventArrow.style.transform = `rotate(${v.bearing}rad)`;
        ventArrow.textContent = '▲';
      },
      dispose: () => ventEl.remove(),
    };
    ctx.hud.mount('top-center', { id: vent.id, element: asHtml(ventEl), order: 8, update: () => vent.update(), dispose: () => vent.dispose() });

    const flash = new LavaFlash();
    const flashEl = makeEl(doc, 'div', 'owg-lava-flash');
    ctx.hud.mount('overlay', {
      id: 'lava-flash',
      element: asHtml(flashEl),
      order: 20,
      update: (dt) => {
        flash.tick(dt);
        flashEl.style.opacity = String(flash.strength);
      },
      dispose: () => flashEl.remove(),
    });

    // Vey's Spare window (asked by N6): a centred line and a countdown while `boss.releaseWindow` is open.
    const spare = new SpareCue();
    const spareEl = makeEl(doc, 'div', 'owg-spare');
    const spareLine = makeEl(doc, 'div', 'owg-spare-line', spareEl);
    const spareCount = makeEl(doc, 'div', 'owg-spare-count', spareEl);
    setShown(spareEl, false);
    ctx.hud.mount('center', {
      id: 'spare-cue',
      element: asHtml(spareEl),
      order: 9,
      update: (dt) => {
        spare.tick(dt);
        const s = spare.seconds;
        setShown(spareEl, s !== null);
        if (s === null) return;
        spareLine.textContent = t('hud.spare.line');
        spareCount.textContent = t('hud.spare.count', { s });
      },
      dispose: () => spareEl.remove(),
    });

    // Screens.
    const keys: KeySource2 | null = typeof document !== 'undefined' ? (document as unknown as KeySource2) : null;
    const screens = new Act5Screens(doc, {
      t,
      keys,
      reducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      phaseLines: (id) => (id === 'rim-holds' ? rimHoldsLines((k) => ctx.state.getBool(k), t) : []),
      lock: () => {
        // Input stays out of gameplay while a screen is open (the epilogue's keys must not walk or interact).
        const off = ctx.hud.openModal({ id: 'act5-screen-lock', element: asHtml(makeEl(doc, 'div', 'owg-act5-lock')) }, { context: 'menu' });
        return typeof off === 'function' ? off : null;
      },
      closed: (kind, id) => {
        if (kind === 'phaseCard') ctx.events.emit('hud.phaseCard.closed', { id: id ?? '' });
        else if (kind === 'epilogue') ctx.events.emit('hud.epilogue.closed', {});
        else ctx.events.emit('hud.credits.closed', {});
      },
      slide: (n) => ctx.events.emit('hud.epilogue.slide', { n }),
    });
    ctx.hud.mount('overlay', { id: screens.id, element: asHtml(screens.element), order: 30, update: (dt) => screens.update(dt), dispose: () => screens.dispose() });
    svc.provide?.('act5Screens', screens);

    const offs = [
      // Re-applying the predicate drops a row the bar made before the siege was known.
      on('siege.wave.started', (e) => {
        model.waveStarted(e);
        barSvc()?.suppress(suppressPred);
      }),
      on('siege.wave.cleared', (e) => model.waveCleared(e)),
      on('siege.gate.damaged', (e) => model.gateDamaged(e)),
      on('siege.gate.breached', (e) => model.gateBreached(e)),
      on('siege.order', (e) => model.order(e)),
      on('siege.ally.arrived', (e) => model.allyArrived(e)),
      // N5's one-shot (src/enemies/act5/events.ts); never fires before N5 lands, and then nothing shows.
      on('enemies.shieldLine.broken', () => model.lineBroken()),
      on('structure.damaged', (e: { id: string; health: number }) => {
        if (!isRam(e.id)) return;
        const max = (svc.get('waves') as StructureLike | undefined)?.structure?.(e.id)?.maxHealth;
        if (typeof max === 'number' && max > 0) model.ram(e.id, e.health / max, 0);
      }),
      on('structure.destroyed', (e: { id: string }) => model.ramGone(e.id)),
      on('boss.releaseWindow', (e) => spare.window(e)),
      ...(['boss.defeated', 'boss.released', 'boss.ended'] as const).map((n) => on(n, () => spare.reset())),
      on('lava.entered', () => {
        if (flash.entered(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) ctx.events.emit('hud.toast', { textKey: 'hud.lava.entered' });
      }),
      on('lava.thrown', () => ctx.events.emit('hud.toast', { textKey: 'hud.lava.thrown' })),
      // A load re-derives everything: the siege director re-emits its events for the restarted wave.
      on('siege.completed', (e: { siegeId?: string }) => model.end(e?.siegeId)),
      on('save.loaded', () => {
        model.reset();
        spare.reset();
        // Seed from the siege service so the view is right whichever handler runs first; the restarted wave re-emits too.
        model.seed(siegeSvc()?.current);
        flash.reset();
      }),
    ];
    ctx.systems.add({
      id: 'act5-hud.teardown',
      dispose() {
        for (const off of offs.splice(0)) off();
        (svc.get('structureBar') as { suppress(p: null): void } | undefined)?.suppress(null);
      },
    });
  },
};

export default act5Hud;
