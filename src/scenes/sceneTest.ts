// v0.9 item 8: the `variant` step's test, pure so the runner and its tests share it.
import { flagConditionHolds, type FlagReader } from '../core/flagCondition';
import { bandAt, bandFor, highestTrack, type FavourTrack } from '../state/favour';
import type { SceneTest } from './types';

export interface SceneTestReader extends FlagReader {
  /** The live favour of a track (0..100). */
  favour(track: FavourTrack): number;
}

/**
 * True when every part of `t` holds. A missing snapshot reads false; an unknown named test reads false (with `warn`).
 * An empty test holds.
 */
export function sceneTestHolds(
  t: SceneTest,
  reader: SceneTestReader | undefined,
  tests: ReadonlyMap<string, () => boolean>,
  warn: (m: string) => void = () => {},
): boolean {
  if ((t.flags || t.band || t.highest) && !reader) {
    warn('scenes: a variant test needs the world state; reading false');
    return false;
  }
  if (t.flags && !flagConditionHolds(t.flags, reader!)) return false;
  if (t.band) {
    const band = t.band.snapshot === undefined ? bandFor(reader!.favour(t.band.track)) : bandAt(reader!, t.band.snapshot, t.band.track);
    if (band === undefined || !t.band.in.includes(band)) return false;
  }
  if (t.highest) {
    const top = highestTrack(reader!, t.highest.snapshot);
    if (top === undefined || top !== t.highest.is) return false;
  }
  if (t.test !== undefined) {
    const fn = tests.get(t.test);
    if (!fn) {
      warn(`scenes: no test "${t.test}"; reading false`);
      return false;
    }
    try {
      if (!fn()) return false;
    } catch (e) {
      warn(`scenes: test "${t.test}" threw (${String(e)}); reading false`);
      return false;
    }
  }
  return true;
}
