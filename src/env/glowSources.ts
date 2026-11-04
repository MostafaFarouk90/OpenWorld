// Where the environment glow system finds fire sources that are not env placement rows. A leaf module (no three, no game imports), so any
// plugin can register its own fires without depending on the env plugin being set up first: the Keep-road braziers of "Smoke Over
// Harrowmark" (src/harrowmark/worldChange.ts) add theirs while story.gate.a2 is on, and src/env/glow.ts reads the list each frame.
// With `?env=off` nothing reads it, so registering is harmless.

/** One fire that may get a pooled light. `kind` names an entry of GLOW in src/env/glow.ts; (x, y, z) is where the light sits (world metres). */
export interface GlowSource {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
}

export interface GlowRegistry {
  /** Registers sources; returns a function that removes exactly these (calling it twice is harmless). Non-finite positions are ignored. */
  add(sources: readonly GlowSource[]): () => void;
  /** Every registered source, in registration order. The same array instance until the set changes. */
  list(): readonly GlowSource[];
  /** Bumped on every change, so a reader can tell when to rebuild what it derived from `list()`. */
  readonly version: number;
}

export function createGlowRegistry(): GlowRegistry {
  const groups = new Set<readonly GlowSource[]>();
  let cache: readonly GlowSource[] = [];
  let version = 0;
  const rebuild = (): void => {
    cache = [...groups].flat();
    version++;
  };
  return {
    add(sources) {
      const ok = sources.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
      if (ok.length === 0) return () => {};
      const group = [...ok];
      groups.add(group);
      rebuild();
      return () => {
        if (groups.delete(group)) rebuild();
      };
    },
    list: () => cache,
    get version() {
      return version;
    },
  };
}

/** The shared registry the env glow system reads. */
export const glowRegistry: GlowRegistry = createGlowRegistry();
