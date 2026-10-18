// `?act1=m03|m04|m05|d01|r01|r02&new`: dev and smoke jumps to the start of a Phase A quest (see act1Jump.ts).
// Compiled out of production builds (import.meta.env.DEV).
import type { GamePlugin } from '../core/plugins';
import { createEffectRunner } from './effects';
import { Act1Jump, parseAct1 } from './act1Jump';
import type { BusPort } from './ports';
import type { TutorialDirector } from '../tutorial/TutorialDirector';

let release: (() => void) | null = null;

const plugin: GamePlugin = {
  id: 'act1-jump',
  dependsOn: ['core', 'quests', 'save', 'waystones'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const search = typeof location !== 'undefined' ? location.search : '';
    const parsed = parseAct1(search);
    if (!parsed) return;
    if ('error' in parsed) {
      console.warn(`[act1] jump refused: ${parsed.error}`);
      return;
    }
    const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
    const save = ctx.services.get('save');
    // Held for the session: a jumped game is never saved over the player's real save.
    release = save?.suspend('act1-jump') ?? null;
    const quests = ctx.services.require('quests');
    const runner = createEffectRunner({
      state: ctx.state, quests: quests as never, bus: ctx.events as unknown as BusPort, sourceId: 'act1-jump',
      progression: () => svc('progression'), inventory: () => svc('inventory'), npcs: () => svc('npcs'), enemies: () => svc('enemies'),
      warn: (m) => console.warn(`[act1] ${m}`),
    });
    const jump = new Act1Jump(parsed.id, {
      tutorial: () => (globalThis as { __tutorial?: TutorialDirector }).__tutorial,
      quests,
      runEffects: (effects) => {
        for (const r of runner.run(effects)) if (!r.ok) console.warn(`[act1] effect failed: ${r.error ?? ''}`);
      },
      setFlag: (flag, value) => ctx.state.setFlag(flag, value),
      rekindle: (id) => void svc('waystones')?.rekindle(id, 'script'),
      teleportTo: (anchorId) => {
        const a = ctx.anchors.find(anchorId);
        if (!a) {
          console.warn(`[act1] anchor ${anchorId} missing; staying put`);
          return true;
        }
        void ctx.services.get('waystones')?.safeTeleport(a.position, a.yaw);
        return true;
      },
      ready: () => !save || !save.loading,
      warn: (m) => console.warn(`[act1] ${m}`),
    });
    (globalThis as { __act1?: Act1Jump }).__act1 = jump;
    ctx.systems.add({
      id: 'act1-jump',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => jump.tick(),
    });
  },
  dispose() {
    release?.();
    release = null;
    delete (globalThis as { __act1?: unknown }).__act1;
  },
};

export default plugin;
