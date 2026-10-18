/**
 * Slice 2 Phase A save fixtures, written by the real save plugin (src/integration/fixtures.gen.test.ts; regenerate
 * with `GEN_FIXTURES=1 npx vitest run src/integration/fixtures.gen.test.ts`). Each `<name>.json` is a `SaveFile`
 * exactly as stored in IndexedDB; `<name>.meta.json` records the generating commit. Load one in a test with
 * `bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved))` (src/integration/chapterHarness.ts).
 */
export const PHASE_A_FIXTURES = {
  /** All six Phase A quests completed; Prior released; R01 field saved. */
  releasedSaved: 'phaseA-complete-released-saved',
  /** All six Phase A quests completed; Prior defeated; R01 field scorched (story.r01.torchUsed). */
  defeatedScorched: 'phaseA-complete-defeated-scorched',
  /** D01 active, the player inside the chapel vault (interior saved), Tobb joined. */
  midD01Vault: 'phaseA-mid-d01-vault',
} as const;
export type PhaseAFixture = (typeof PHASE_A_FIXTURES)[keyof typeof PHASE_A_FIXTURES];

/** Every fixture's `savedAt` (the generator holds `Date.now()` here while saving). */
export const FIXTURE_SAVED_AT = Date.UTC(2026, 0, 1);

/** Reads a fixture file (node only: tests). Returns a fresh object each call. */
export async function readPhaseAFixture(name: PhaseAFixture): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}.json`, import.meta.url)), 'utf8')) as Record<string, unknown>;
}
