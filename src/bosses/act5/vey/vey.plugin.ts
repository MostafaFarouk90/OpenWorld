// Plugin `vey`: Morcant Vey, the Regent Reforged, D09's boss (Act 5 N6 PR 1; plans/act5-N6.md section 2). Waits for N2's Foundry
// floor 3 trigger once `story.d09.started` is set; the duel runs on the core boss registry (which alone emits `boss.*` and writes
// `boss.vey.outcome`). The model is the KayKit Knight; headless (no asset loader) the fight runs without a model, for tests.
// Depends on `interiors` (its `save.loaded` teleport runs after the stale-load rescue), `enemies` (the Spare hold and the F7 crowd)
// and `act5-core` (the `bossArena` service).
import type { GamePlugin } from '../../../core/plugins';
import { VeyDirector } from './VeyDirector';
import { buildVeyModel } from './VeyModel';
import { VEY_STRINGS_EN } from './strings.en';

const KNIGHT = 'knight';

let director: VeyDirector | null = null;
let offSystem: (() => void) | null = null;

type ModelState = 'none' | 'loading' | 'ready' | 'failed';

const plugin: GamePlugin = {
  id: 'vey',
  dependsOn: ['core', 'interiors', 'enemies', 'act5-core'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[vey] ${m}`);
    const assets = ctx.assets;
    let state: ModelState = assets ? 'loading' : 'none';
    if (assets) {
      assets.load(KNIGHT).then(
        () => {
          state = 'ready';
        },
        (err) => {
          state = 'failed';
          warn(`Knight model failed to load; the Vey fight cannot start (${String(err)})`);
        },
      );
    }
    ctx.strings.register('en', VEY_STRINGS_EN);
    const d = new VeyDirector(ctx, {
      warn,
      modelState: () => state,
      makeModel: () => (assets ? buildVeyModel({ model: assets.instantiate(KNIGHT), clips: assets.animations(KNIGHT) }, warn) : null),
    });
    director = d;
    if (import.meta.env?.DEV) (globalThis as { __vey?: VeyDirector }).__vey = d;
    offSystem = ctx.systems.add({ id: 'bosses.vey', fixedPhase: 'intent', order: -135, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    offSystem?.();
    offSystem = null;
    director?.dispose();
    if ((globalThis as { __vey?: VeyDirector }).__vey === director) delete (globalThis as { __vey?: VeyDirector }).__vey;
    director = null;
  },
};

/** The live director, for tests and the headless drivers. */
export function veyDirector(): VeyDirector | null {
  return director;
}

export default plugin;
