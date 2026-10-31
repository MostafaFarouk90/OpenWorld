// What names an Act 3 `?act3=` fixture and when it is still current (K16). Shared by the generator (tests), the fixture
// index and the dev jump's loader, so it imports nothing from the test harness.
import { ACT3_PREREQS, type Act3Order } from '../quests/act3Jump';

export interface Act3FixtureMeta {
  fixture: string;
  id: string;
  order: Act3Order;
  /** `ACT3_PREREQS[order][id]` when generated */
  injected: string[];
  /** the quest defs among `injected` and `id` that the generating build knew, sorted */
  questDefs: string[];
  /** each locked block's base level (`warmth.block.<id>.level`) */
  lockedBlocks: Record<string, number>;
  generatedBy: string;
  savedAt: string;
}

export const act3FixtureName = (order: Act3Order, id: string): string => `act3-${order}-${id}`;

/** The ids whose quest defs decide a fixture's content: what it injects, and its target. */
export const fixtureDefIds = (id: string, order: Act3Order): string[] => [...(ACT3_PREREQS[order][id] ?? []), id];

/** The quest defs among `ids` that a build knows, sorted (the freshness key). */
export const knownQuestDefs = (has: (id: string) => boolean, ids: readonly string[]): string[] => ids.filter(has).sort();

/** Fresh when the build knows exactly the quest defs the generator knew among the ids that shape the fixture. */
export function act3FixtureFresh(meta: Pick<Act3FixtureMeta, 'questDefs'>, known: readonly string[]): boolean {
  const a = [...meta.questDefs].sort();
  const b = [...known].sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export type Act3StartChoice = { use: 'fixture' } | { use: 'inject'; reason: string };

/**
 * How `?act3=` starts: the committed fixture when one exists and is fresh, otherwise K0's flag injection (with the
 * reason, logged so the stale fixture gets regenerated). `&fixture=0` always injects.
 */
export function chooseAct3Start(
  name: string, wantFixture: boolean, meta: Pick<Act3FixtureMeta, 'questDefs'> | null, known: readonly string[],
): Act3StartChoice {
  if (!wantFixture) return { use: 'inject', reason: '&fixture=0' };
  if (!meta) return { use: 'inject', reason: `no fixture ${name}` };
  if (!act3FixtureFresh(meta, known)) {
    return {
      use: 'inject',
      reason: `fixture ${name} is stale (generated with quest defs [${meta.questDefs.join(', ')}], this build has [${known.join(', ')}]); regenerate it`,
    };
  }
  return { use: 'fixture' };
}
