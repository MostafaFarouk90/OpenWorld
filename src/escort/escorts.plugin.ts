// Act 4 thread L4 (plans/act4-L4.md): the `escorts` service (Act 4's foot escorts), its `escorts` persistable, one rules
// system and the escort bar. Inert until a quest calls `escorts.start`, so Acts 1 to 3 play as before. A5's mounted
// escort (`escort`, M11) is a different service and untouched.
import type { GamePlugin } from '../core/plugins';
import { asHtml, hudDocument } from '../hud/soft';
import { ESCORT_BAR_CSS, EscortBar } from './EscortBar';
import { ESCORT_ENGINE, EscortEngine, type Act4EscortsService } from './EscortEngine';
import { ESCORT_STRINGS_EN } from './strings.en';
import './types';

let engine: EscortEngine | null = null;

/** Its own style element (the HUD's `injectCss` keeps one element, written once by the HUD plugin). */
function injectEscortCss(): () => void {
  if (typeof document === 'undefined') return () => {};
  const id = 'owg-escort-css';
  if (document.getElementById(id)) return () => {};
  const el = document.createElement('style');
  el.id = id;
  el.textContent = ESCORT_BAR_CSS;
  document.head.appendChild(el);
  return () => el.remove();
}
const offs: Array<() => void> = [];

/** The running engine (tests and the dev hook). */
export function escortEngine(): EscortEngine | null {
  return engine;
}

declare module '../core/Services' {
  interface GameServices {
    /** L4's full surface on top of L0's EscortsService (start, stop, go, state, view). */
    escortsAct4: Act4EscortsService;
  }
}

const plugin: GamePlugin = {
  id: 'escorts',
  dependsOn: ['core'],
  setup(ctx) {
    ctx.strings.register('en', ESCORT_STRINGS_EN);
    const e = new EscortEngine(ctx);
    engine = e;
    offs.push(ctx.services.provide('escorts', e));
    offs.push(ctx.services.provide('escortsAct4', e));
    ctx.persist.register({
      key: ESCORT_ENGINE.persistKey,
      version: ESCORT_ENGINE.persistVersion,
      serialize: () => e.serialize(),
      load: (data, version) => e.load(data, version),
    });
    offs.push(ctx.systems.add({ id: 'escorts', fixedPhase: 'rules', order: 12, fixedUpdate: (dt) => e.fixedUpdate(dt) }));
    offs.push(injectEscortCss());
    const bar = new EscortBar(hudDocument(), () => e.view(), (k) => ctx.strings.t(k));
    offs.push(ctx.hud.mount('top-center', { id: bar.id, element: asHtml(bar.element), order: 3, update: () => bar.update(), dispose: () => bar.dispose() }));
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) {
      try {
        off();
      } catch (err) {
        console.warn('escorts: dispose failed', err);
      }
    }
    engine?.dispose();
    engine = null;
  },
};

export default plugin;
