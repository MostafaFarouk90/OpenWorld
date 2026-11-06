// Plugin `bellows-engine`: the Bellows-Engine, D07's boss (Act 4 L6 PR 1; plans/act4-L6.md). Waits for the Crucible arena's
// trigger once `story.d07.started` and the arena gate's flag are set; the fight runs on the core boss registry (which alone emits
// `boss.*`) and breaks through L0's structure-break hook. The model is procedural: any asset loader means "build it", none means
// headless (tests). Depends on `interiors` (its `save.loaded` teleport runs after the stale-load rescue), `enemies` (the boss
// hold) and `structure-breaks`.
import type { GamePlugin } from '../../../core/plugins';
import { BellowsDirector } from './BellowsDirector';
import { buildBellowsModel } from './BellowsModel';
import { BELLOWS_STRINGS_EN } from './strings.en';

let director: BellowsDirector | null = null;
let offSystem: (() => void) | null = null;

const plugin: GamePlugin = {
  id: 'bellows-engine',
  dependsOn: ['core', 'interiors', 'enemies', 'structure-breaks'],
  setup(ctx) {
    const headless = !ctx.assets;
    ctx.strings.register('en', BELLOWS_STRINGS_EN);
    const d = new BellowsDirector(ctx, {
      modelState: () => (headless ? 'none' : 'ready'),
      makeModel: () => buildBellowsModel(),
    });
    director = d;
    offSystem = ctx.systems.add({ id: 'bosses.bellows-engine', fixedPhase: 'intent', order: -137, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    offSystem?.();
    offSystem = null;
    director?.dispose();
    director = null;
  },
};

/** The live director, for tests and the headless drivers. */
export function bellowsEngineDirector(): BellowsDirector | null {
  return director;
}

export default plugin;
