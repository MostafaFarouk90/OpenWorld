// What names an Act 5 `?act5=` fixture and when it is still current (N12 PR 1). Shared by the generator (tests), the
// fixture index and the dev jump's loader, so it imports nothing from the test harness. The rule is Act 4's (L13).
import { ACT5_PREREQS } from '../quests/act5Jump';
import type { Act4FreshnessMeta } from './act4FixtureKey';
import { sameIdSet } from './act3FixtureKey';

/** The carried bases: the live game at the end of L13's Phase H chain, run A and run B (Act 4 played headless). */
export type Act5Run = 'a' | 'b';
export const act5BaseName = (run: Act5Run): string => `act5-carried-chain-${run}`;
/** The per-id fixtures are made from run A's base (delegates won, kills as kills: the reference run). */
export const ACT5_FIXTURE_BASE_RUN: Act5Run = 'a';

export interface Act5BaseMeta {
  fixture: string;
  run: Act5Run;
  /** what produced it */
  chain: string;
  level: number;
  xp: number;
  scars: number;
  deaths: number;
  favour: Record<string, number>;
  /** the Act 4 choice flags the Act 5 readers use, as the chain left them */
  choices: Record<string, string | undefined>;
  /** the Act 4 quest defs the generating build knew (all 21) */
  act4QuestDefs: string[];
  /** per-quest trails of the whole of Act 4 (Phase G's from its end meta, Phase H's from this run): pacing without a replay */
  trails: Record<string, unknown>;
  generatedBy: string;
}

export interface Act5FixtureMeta {
  fixture: string;
  id: string;
  /** `ACT5_PREREQS[id]` when generated */
  injected: string[];
  /** the quest defs among `injected` and `id` that the generating build knew, sorted */
  questDefs: string[];
  base: { fixture: string; level: number; xp: number };
  xp: number;
  level: number;
  /** the flags the jump set beside the injection */
  rimGateOpen: boolean;
  foundryOpen: boolean;
  generatedBy: string;
  savedAt: string;
}

export const act5FixtureName = (id: string): string => `act5-${id}`;
export const act5ExtraName = (name: string): string => `act5-extra-${name}`;

/** The ids whose quest defs decide a fixture's content: what it injects, and its target. */
export const act5FixtureDefIds = (id: string): string[] => [...(ACT5_PREREQS[id] ?? []), id];

/** Fresh when the build knows exactly the generator's quest defs and the jump injects the same quests in the same order. */
export function act5FixtureFresh(meta: Act4FreshnessMeta, known: readonly string[]): boolean {
  if (!sameIdSet(meta.questDefs, known)) return false;
  if (meta.injected && meta.id) {
    const now = ACT5_PREREQS[meta.id] ?? [];
    if (now.length !== meta.injected.length || now.some((q, i) => q !== meta.injected![i])) return false;
  }
  return true;
}
