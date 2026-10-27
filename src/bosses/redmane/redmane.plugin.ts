import type { GamePlugin } from '../../core/plugins';
import { envPropLibrary, REDMANE_LANCE_PROP } from '../../enemies/envProp';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { RedmaneDirector } from './RedmaneDirector';
import { buildRedmaneModel } from './RedmaneModel';
import { REDMANE_STRINGS_EN } from './strings.en';

const BARBARIAN = 'barbarian';

let director: RedmaneDirector | null = null;
let offSystem: (() => void) | null = null;

/** Where Redmane's model stands: 'none' (headless), 'loading', 'ready' or 'failed' (the fight cannot start without hurtboxes). */
type ModelState = 'none' | 'loading' | 'ready' | 'failed';

/**
 * Hunt-Captain Thrandil Redmane, the D03 boss (plans/act2-A8.md). Waits for the keep arena trigger once `story.d03.started` is
 * set; the fight itself runs on the core boss registry, which alone emits `boss.*`. The Barbarian model loads when the plugin
 * starts; a trigger before it has loaded waits for it, and a failed load keeps the fight from starting. Headless (no asset
 * loader) the fight runs without a model, for tests. Depends on `interiors` (its `save.loaded` teleport runs after the stale-load
 * rescue) and `enemies` (the net's status and the boss hold).
 */
const plugin: GamePlugin = {
  id: 'thrandil-redmane',
  dependsOn: ['core', 'interiors', 'enemies'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[thrandil-redmane] ${m}`);
    const assets = ctx.assets;
    // The env-pass lance; a missing glb leaves the procedural one in his hand.
    const lances = envPropLibrary(assets);
    void lances.preload([REDMANE_LANCE_PROP]);
    const heldLance = () => {
      const t = lances.peek(REDMANE_LANCE_PROP);
      return t ? ModelLibrary.object(t) : null;
    };
    let state: ModelState = assets ? 'loading' : 'none';
    if (assets) {
      assets.load(BARBARIAN).then(
        () => {
          state = 'ready';
        },
        (err) => {
          state = 'failed';
          warn(`Barbarian model failed to load; the Redmane fight cannot start (${String(err)})`);
        },
      );
    }
    const d = new RedmaneDirector(ctx, {
      warn,
      modelState: () => state,
      makeModel: () => (assets ? buildRedmaneModel({ model: assets.instantiate(BARBARIAN), clips: assets.animations(BARBARIAN), lance: heldLance() }, warn) : null),
    });
    director = d;
    ctx.strings.register('en', REDMANE_STRINGS_EN);
    offSystem = ctx.systems.add({ id: 'bosses.redmane', fixedPhase: 'intent', order: -139, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    offSystem?.();
    offSystem = null;
    director?.dispose();
    director = null;
  },
};

/** The live director, for tests. */
export function redmaneDirector(): RedmaneDirector | null {
  return director;
}

export default plugin;
