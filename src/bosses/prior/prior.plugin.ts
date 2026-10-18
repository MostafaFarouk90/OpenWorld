import type { GamePlugin } from '../../core/plugins';
import { buildPriorModel } from './PriorModel';
import { PriorDirector, type PriorModelState } from './PriorDirector';
import { PRIOR_STRINGS_EN } from './strings.en';

const MAGE = 'mage';

let director: PriorDirector | null = null;

/**
 * The Ashen Prior, D01 boss (plans/slice-2-ashen-prior.md). Waits for the vault arena trigger; the fight itself runs
 * on the core boss registry (`ctx.bosses`), which alone emits `boss.*`. The Mage model loads when the plugin starts; a
 * trigger before it has loaded waits for it, and a failed load keeps the fight from starting (no hurtboxes without it).
 * Headless (no asset loader) the fight runs without a model, for tests.
 */
const plugin: GamePlugin = {
  id: 'ashen-prior',
  dependsOn: ['core'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[ashen-prior] ${m}`);
    const assets = ctx.assets;
    let state: PriorModelState = assets ? 'loading' : 'none';
    if (assets) {
      assets.load(MAGE).then(
        () => {
          state = 'ready';
        },
        (err) => {
          state = 'failed';
          warn(`Mage model failed to load; the Prior fight cannot start (${String(err)})`);
        },
      );
    }
    const d = new PriorDirector(ctx, {
      warn,
      modelState: () => state,
      makeModel: () => (assets ? buildPriorModel({ model: assets.instantiate(MAGE), clips: assets.animations(MAGE) }, warn) : null),
    });
    director = d;
    ctx.strings.register('en', PRIOR_STRINGS_EN);
    ctx.systems.add({ id: 'bosses.prior', fixedPhase: 'intent', order: -140, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    director?.dispose();
    director = null;
  },
};

export default plugin;
