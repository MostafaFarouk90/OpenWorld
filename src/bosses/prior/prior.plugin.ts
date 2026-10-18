import type { GamePlugin } from '../../core/plugins';
import { buildPriorModel } from './PriorModel';
import { PriorDirector } from './PriorDirector';
import { PRIOR_STRINGS_EN } from './strings.en';

const MAGE = 'mage';

let director: PriorDirector | null = null;

/**
 * The Ashen Prior, D01 boss (plans/slice-2-ashen-prior.md). Waits for the vault arena trigger; the fight itself runs
 * on the core boss registry (`ctx.bosses`), which alone emits `boss.*`. The Mage model is loaded on demand when the
 * plugin starts; until it has loaded (or headless) the fight runs without a model.
 */
const plugin: GamePlugin = {
  id: 'ashen-prior',
  dependsOn: ['core'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[ashen-prior] ${m}`);
    const assets = ctx.assets;
    let mageReady = false;
    if (assets) {
      assets.load(MAGE).then(
        () => {
          mageReady = true;
        },
        (err) => warn(`Mage model failed to load; the Prior fights without a model (${String(err)})`),
      );
    }
    const d = new PriorDirector(ctx, {
      warn,
      makeModel: () =>
        assets && mageReady
          ? buildPriorModel({ model: assets.instantiate(MAGE), clips: assets.animations(MAGE) }, warn)
          : null,
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
