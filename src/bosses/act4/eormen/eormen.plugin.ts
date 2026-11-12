// Plugin `eormen`: Archwraith Eormen, D08's boss (Act 4 L6 PR 2; plans/act4-L6.md "PR 2"). Waits for the Husk Cathedral nave's
// trigger while D08 is active; the fight runs on the core boss registry (which alone emits `boss.*`), breaks only through the
// Last Gong on L0's structure-break hook, and ends with a Release (the shipped boss mercy hold) or his death. The KayKit
// Rogue_Hooded loads when the plugin starts; a trigger before it has loaded waits for it, and a failed load keeps the fight from
// starting. Headless (no asset loader) the fight runs without a model, for tests.
import type { GamePlugin } from '../../../core/plugins';
import { EormenDirector } from './EormenDirector';
import { buildEormenModel } from './EormenModel';
import { EORMEN_STRINGS_EN } from './strings.en';
import type { BossModelState } from '../../arena/BossArena';

const ROGUE_HOODED = 'rogueHooded';

let director: EormenDirector | null = null;
let offSystem: (() => void) | null = null;

const plugin: GamePlugin = {
  id: 'eormen',
  dependsOn: ['core', 'interiors', 'enemies', 'structure-breaks'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[eormen] ${m}`);
    const assets = ctx.assets;
    let state: BossModelState = assets ? 'loading' : 'none';
    if (assets) {
      assets.load(ROGUE_HOODED).then(
        () => {
          state = 'ready';
        },
        (err) => {
          state = 'failed';
          warn(`Rogue_Hooded failed to load; the Eormen fight cannot start (${String(err)})`);
        },
      );
    }
    ctx.strings.register('en', EORMEN_STRINGS_EN);
    const d = new EormenDirector(ctx, {
      warn,
      modelState: () => state,
      makeModel: () => (assets ? buildEormenModel({ model: assets.instantiate(ROGUE_HOODED), clips: assets.animations(ROGUE_HOODED) }, warn) : null),
    });
    director = d;
    if (import.meta.env?.DEV) (globalThis as { __eormen?: EormenDirector }).__eormen = d;
    offSystem = ctx.systems.add({ id: 'bosses.eormen', fixedPhase: 'intent', order: -136, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    offSystem?.();
    offSystem = null;
    director?.dispose();
    if ((globalThis as { __eormen?: EormenDirector }).__eormen === director) delete (globalThis as { __eormen?: EormenDirector }).__eormen;
    director = null;
  },
};

/** The live director, for tests and the headless drivers. */
export function eormenDirector(): EormenDirector | null {
  return director;
}

export default plugin;
