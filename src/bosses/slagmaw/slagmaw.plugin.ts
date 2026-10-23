import type { GamePlugin } from "../../core/plugins";
import { SlagmawDirector } from "./SlagmawDirector";
import { buildSlagmawModel } from "./SlagmawModel";
import { SLAGMAW_STRINGS_EN } from "./strings.en";

let director: SlagmawDirector | null = null;

/**
 * The Slagmaw, the D04 boss (plans/act2-A8.md, "PR 2"). Waits for the Deepdelve arena trigger once `story.d04.started` is set;
 * the fight itself runs on the core boss registry, which alone emits `boss.*`. The model is fully procedural, so it never
 * loads or fails: with a game that has an asset loader the fight builds it, headless (no loader) the fight runs without one,
 * for tests. Depends on `interiors` (its `save.loaded` teleport runs after the stale-load rescue) and `enemies` (the globs
 * and the boss hold).
 */
const plugin: GamePlugin = {
  id: "the-slagmaw",
  dependsOn: ["core", "interiors", "enemies"],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[the-slagmaw] ${m}`);
    const headless = !ctx.assets;
    const d = new SlagmawDirector(ctx, {
      warn,
      modelState: () => (headless ? "none" : "ready"),
      makeModel: () => buildSlagmawModel(),
    });
    director = d;
    ctx.strings.register("en", SLAGMAW_STRINGS_EN);
    ctx.systems.add({
      id: "bosses.slagmaw",
      fixedPhase: "intent",
      order: -138,
      fixedUpdate: (dt) => d.fixedUpdate(dt),
    });
  },
  dispose() {
    director?.dispose();
    director = null;
  },
};

/** The live director, for tests. */
export function slagmawDirector(): SlagmawDirector | null {
  return director;
}

export default plugin;
