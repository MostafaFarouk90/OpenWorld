import type { GamePlugin } from '../../core/plugins';
import { codexEntry } from '../../codex/entries';
import { OUTCOME_FLAG, SkarlDirector } from './SkarlDirector';
import { buildSkarlModel } from './SkarlModel';
import { SKARL_STRINGS_EN } from './strings.en';
import { SKARL_BOSS_ID } from './tuning';

export const SKARL_CODEX_ID = SKARL_BOSS_ID;
const ROGUE_HOODED = 'rogueHooded';

let director: SkarlDirector | null = null;
let offs: (() => void)[] = [];

/** Where Skarl's model stands: 'none' (headless), 'loading', 'ready' or 'failed' (the fight cannot start without hurtboxes). */
type ModelState = 'none' | 'loading' | 'ready' | 'failed';

/**
 * Hunt-Marshal Corvin Skarl and his drake, the D06 boss (plans/act3-K8-pr2.md), in K4's Frostfang Aerie courtyard once
 * `story.d06.started` is set. The fight runs on the core boss registry, which alone emits `boss.*`; the drake is K6a's
 * `skarl-drake` on K8's spawner, chained through the `drakes` service. The Rogue_Hooded model loads when the plugin starts;
 * headless (no asset loader) the fight runs without one, for tests. Depends on `enemies` (the drake and the Spare hold).
 * Registers the bestiary entry, unlocked by the outcome flag.
 */
const plugin: GamePlugin = {
  id: 'corvin-skarl',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[corvin-skarl] ${m}`);
    const assets = ctx.assets;
    let state: ModelState = assets ? 'loading' : 'none';
    if (assets) {
      assets.load(ROGUE_HOODED).then(
        () => {
          state = 'ready';
        },
        (err) => {
          state = 'failed';
          warn(`Rogue_Hooded failed to load; the Skarl fight cannot start (${String(err)})`);
        },
      );
    }
    const d = new SkarlDirector(ctx, {
      warn,
      modelState: () => state,
      makeModel: () => (assets ? buildSkarlModel({ model: assets.instantiate(ROGUE_HOODED), clips: assets.animations(ROGUE_HOODED) }, warn) : null),
    });
    director = d;
    offs.push(ctx.strings.register('en', SKARL_STRINGS_EN));
    // The codex is bound lazily (its plugin may set up after this one).
    let offCodex: (() => void) | null = null;
    const bindCodex = () => {
      const c = ctx.services.get('codex');
      if (!c) return;
      if (!offCodex) offCodex = c.register([codexEntry('bestiary', SKARL_CODEX_ID, SKARL_CODEX_ID)]);
      if (ctx.state.hasFlag(OUTCOME_FLAG) && !c.has(SKARL_CODEX_ID)) c.unlock(SKARL_CODEX_ID);
    };
    offs.push(
      ctx.systems.add({
        id: 'bosses.corvin-skarl',
        fixedPhase: 'intent',
        order: -136,
        fixedUpdate: (dt) => {
          if (!offCodex || ctx.state.hasFlag(OUTCOME_FLAG)) bindCodex();
          d.fixedUpdate(dt);
        },
      }),
      () => offCodex?.(),
    );
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) {
      try {
        off();
      } catch {
        // disposal is best effort
      }
    }
    offs = [];
    director?.dispose();
    director = null;
  },
};

/** The live director, for tests. */
export function skarlDirector(): SkarlDirector | null {
  return director;
}

export default plugin;
