import type { GamePlugin } from '../../core/plugins';
import { codexEntry } from '../../codex/entries';
import { MurkjawDirector, OUTCOME_FLAG } from './MurkjawDirector';
import { buildMurkjawModel } from './MurkjawModel';
import { MURKJAW_STRINGS_EN } from './strings.en';
import { MURKJAW_BOSS_ID } from './tuning';

export const MURKJAW_CODEX_ID = MURKJAW_BOSS_ID;

let director: MurkjawDirector | null = null;
let offs: (() => void)[] = [];

/**
 * Murkjaw the Peat Eel-King, the D05 boss (plans/act3-K8.md). Waits for K3's arena trigger in the Mirewater Deeps once
 * `story.d05.started` is set; the fight runs on the core boss registry, which alone emits `boss.*`. The eel is procedural, so it
 * never loads or fails: a game with an asset loader builds it; headless (no loader) the fight runs without one, for tests.
 * Depends on `interiors` (its `save.loaded` teleport runs after the stale-load rescue, and the gate and crossing are its
 * blockers) and `enemies` (the Greyfen block's level). Registers the bestiary entry, unlocked by the outcome flag.
 */
const plugin: GamePlugin = {
  id: 'murkjaw',
  dependsOn: ['core', 'interiors', 'enemies'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[murkjaw] ${m}`);
    const headless = !ctx.assets;
    const d = new MurkjawDirector(ctx, {
      warn,
      modelState: () => (headless ? 'none' : 'ready'),
      makeModel: () => buildMurkjawModel(),
    });
    director = d;
    offs.push(ctx.strings.register('en', MURKJAW_STRINGS_EN) as unknown as () => void);
    // The codex is bound lazily (its plugin may set up after this one): the entry is registered once the service is there, and
    // unlocked whenever the outcome flag is set.
    let offCodex: (() => void) | null = null;
    const bindCodex = () => {
      const c = ctx.services.get('codex');
      if (!c) return;
      if (!offCodex) offCodex = c.register([codexEntry('bestiary', MURKJAW_CODEX_ID, MURKJAW_CODEX_ID)]);
      if (ctx.state.hasFlag(OUTCOME_FLAG) && !c.has(MURKJAW_CODEX_ID)) c.unlock(MURKJAW_CODEX_ID);
    };
    offs.push(
      ctx.systems.add({
        id: 'bosses.murkjaw',
        fixedPhase: 'intent',
        order: -137,
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
export function murkjawDirector(): MurkjawDirector | null {
  return director;
}

export default plugin;
