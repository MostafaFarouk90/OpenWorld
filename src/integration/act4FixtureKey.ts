// What names an Act 4 `?act4=` fixture and when it is still current (L13). Shared by the generator (tests), the fixture
// index and the dev jump's loader, so it imports nothing from the test harness.
import { ACT4_PREREQS } from '../quests/act4Jump';
import { sameIdSet } from './act3FixtureKey';

/** The carried base: the save at the end of the shipped Phase F run B chain (the whole of Act 3, played headless). */
export const ACT4_BASE_NAME = 'act4-carried-chain';

export interface Act4BaseMeta {
  fixture: string;
  /** what produced it */
  chain: string;
  level: number;
  xp: number;
  /** the Act 3 quest defs the generating build knew (all 21 once Act 3 shipped) */
  act3QuestDefs: string[];
  generatedBy: string;
}

export interface Act4FixtureMeta {
  fixture: string;
  id: string;
  /** `ACT4_PREREQS[id]` when generated */
  injected: string[];
  /** the quest defs among `injected` and `id` that the generating build knew, sorted */
  questDefs: string[];
  /** the carried base it was made from, and that base's level and XP before the top-up */
  base: { fixture: string; level: number; xp: number };
  /** the player's XP and level in the saved fixture (after the top-up to ACT4_START_XP) */
  xp: number;
  level: number;
  /** `story.phase.wasteOpen` in the save (Phase H targets only while the hold stands) */
  wasteOpen: boolean;
  generatedBy: string;
  savedAt: string;
}

export const act4FixtureName = (id: string): string => `act4-${id}`;

/** The ids whose quest defs decide a fixture's content: what it injects, and its target. */
export const act4FixtureDefIds = (id: string): string[] => [...(ACT4_PREREQS[id] ?? []), id];

export type Act4FreshnessMeta = Pick<Act4FixtureMeta, 'questDefs'> & Partial<Pick<Act4FixtureMeta, 'id' | 'injected'>>;

/**
 * Fresh when the build knows exactly the quest defs the generator knew among the ids that shape the fixture, and the jump
 * still injects the same quests in the same order. A def whose content changed without a new def appearing is not caught:
 * regenerate whenever an Act 4 quest thread lands (`CHECK_FIXTURES=1` is the drift check).
 */
export function act4FixtureFresh(meta: Act4FreshnessMeta, known: readonly string[]): boolean {
  if (!sameIdSet(meta.questDefs, known)) return false;
  if (meta.injected && meta.id) {
    const now = ACT4_PREREQS[meta.id] ?? [];
    if (now.length !== meta.injected.length || now.some((q, i) => q !== meta.injected![i])) return false;
  }
  return true;
}
