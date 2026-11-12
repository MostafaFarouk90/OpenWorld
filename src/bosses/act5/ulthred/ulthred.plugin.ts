// Plugin `ulthred`: Ulthred, the Ash King, D10's boss, and M55's hammer trial (Act 5 N6 PR 2; plans/act5-N6.md section 3). Waits
// for N2's Hammer Hall trigger once `story.d10.started` is set; the fight runs on the core boss registry (which alone emits `boss.*`
// and writes `boss.ulthred.outcome`), drops to the Anvil of Ages at 66% on N3's arena kit and the greybox island pieces, and ends
// with the Heartshard. The `hammerTrial` service is M55's. The model is the KayKit Barbarian; headless (no asset loader) both run
// without a model, for tests. Depends on `interiors` (the hall), `act5-core` (`bossArena`, `platforms`) and `caldera-lava` (the
// slam's lava lines; optional at runtime).
import type { GamePlugin } from '../../../core/plugins';
import { HammerTrial } from './hammerTrial';
import { UlthredDirector } from './UlthredDirector';
import { buildUlthredModel } from './UlthredModel';
import { ULTHRED_STRINGS_EN } from './strings.en';

const BARBARIAN = 'barbarian';

let director: UlthredDirector | null = null;
let trial: HammerTrial | null = null;
let offs: (() => void)[] = [];

type ModelState = 'none' | 'loading' | 'ready' | 'failed';

const plugin: GamePlugin = {
  id: 'ulthred',
  dependsOn: ['core', 'interiors', 'act5-core'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[ulthred] ${m}`);
    const assets = ctx.assets;
    let state: ModelState = assets ? 'loading' : 'none';
    if (assets) {
      assets.load(BARBARIAN).then(
        () => {
          state = 'ready';
        },
        (err) => {
          state = 'failed';
          warn(`Barbarian model failed to load; the Ulthred fight cannot start (${String(err)})`);
        },
      );
    }
    ctx.strings.register('en', ULTHRED_STRINGS_EN);
    const makeModel = () => (assets && state === 'ready' ? buildUlthredModel({ model: assets.instantiate(BARBARIAN), clips: assets.animations(BARBARIAN) }, warn) : null);
    const d = new UlthredDirector(ctx, { warn, modelState: () => state, makeModel });
    director = d;
    const t = new HammerTrial(ctx, { makeModel, fightRunning: () => !!d.current, warn });
    trial = t;
    if (import.meta.env?.DEV) (globalThis as { __ulthred?: UlthredDirector }).__ulthred = d;
    offs = [
      ctx.services.provide('hammerTrial', t),
      ctx.systems.add({ id: 'bosses.ulthred', fixedPhase: 'intent', order: -134, fixedUpdate: (dt) => d.fixedUpdate(dt) }),
      ctx.systems.add({ id: 'bosses.ulthred.trial', fixedPhase: 'intent', order: -133, fixedUpdate: (dt) => t.fixedUpdate(dt) }),
    ];
  },
  dispose() {
    for (const off of offs.splice(0)) off();
    trial?.dispose();
    trial = null;
    director?.dispose();
    if ((globalThis as { __ulthred?: UlthredDirector }).__ulthred === director) delete (globalThis as { __ulthred?: UlthredDirector }).__ulthred;
    director = null;
  },
};

/** The live director, for tests and the headless drivers. */
export function ulthredDirector(): UlthredDirector | null {
  return director;
}

/** The live trial, for tests. */
export function hammerTrial(): HammerTrial | null {
  return trial;
}

export default plugin;
