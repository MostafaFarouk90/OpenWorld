// The choice readers: each derived `world.oldsmoke.*` flag mirrors its sources, set and cleared. Re-derived at setup, on every
// change of a source flag and on `save.loaded`, which replaces the flags wholesale (a stale derived flag from an old save, or a
// new game in the same session, is cleared there).
import type { CoreContext } from '../region/coreTypes';
import { DERIVED_FLAGS } from './flags';

export interface FlagStore {
  getFlag(key: string): unknown;
  getBool(key: string): boolean;
  setFlag(key: string, value: boolean): void;
}

/** One pass: makes every derived flag equal its derivation. Returns the keys it changed. */
export function syncDerivedFlags(state: FlagStore): string[] {
  const changed: string[] = [];
  const get = (key: string) => state.getFlag(key);
  for (const d of DERIVED_FLAGS) {
    const want = d.want(get);
    if (state.getBool(d.derived) !== want) {
      state.setFlag(d.derived, want);
      changed.push(d.derived);
    }
  }
  return changed;
}

/** Wires the readers to a context; returns the remover. */
export function watchChoices(ctx: Pick<CoreContext, 'state' | 'events'>): () => void {
  const sources = new Set(DERIVED_FLAGS.flatMap((d) => d.sources));
  syncDerivedFlags(ctx.state);
  const offs = [
    ctx.events.on('flag.changed', ({ key }) => {
      if (sources.has(key)) syncDerivedFlags(ctx.state);
    }),
    ctx.events.on('save.loaded', () => void syncDerivedFlags(ctx.state)),
  ];
  return () => offs.forEach((off) => off());
}
