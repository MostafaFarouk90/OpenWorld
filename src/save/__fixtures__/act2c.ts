/**
 * Act 2 Phase C (Cinderreach) save fixtures, written by the real save plugin from the headless Phase C runs
 * (src/integration/fixtures.gen.test.ts, src/integration/phaseC.ts; regenerate with
 * `GEN_FIXTURES=1 npx vitest run src/integration/fixtures.gen.test.ts`). Same shape and rules as the Act 1 ones
 * (src/save/__fixtures__/act1.ts). They also serve as the Phase C to Phase D save input and the migration test inputs.
 */
export const ACT2_C_FIXTURES = {
  /** Act 1 complete, M11 offerable: the first Cinderreach save. */
  m11Start: 'act2-m11-start',
  /** M11 done; M12 offerable. */
  m12Start: 'act2-m12-start',
  /** M12's raid in progress: the first raiders of a wave are standing (the A12 x A7 double-start seam). */
  m12MidWave: 'act2-m12-mid-wave',
  /** M14 active, the Hushed Anvil rekindled: the murals, the keeper and the tempering ahead. */
  m14HushedAnvil: 'act2-m14-hushed-anvil',
  /** D03 active with the keep papers current: the courtyard cleared, Redmane ahead. */
  d03Scorchhold: 'act2-d03-scorchhold',
  /** Run A (first branch of every choice): Redmane defeated. */
  completeDefeated: 'act2-phase-c-complete-defeated',
  /** Run B (second branch of every choice): Redmane spared. */
  completeSpared: 'act2-phase-c-complete-spared',
} as const;
export type Act2CFixture = (typeof ACT2_C_FIXTURES)[keyof typeof ACT2_C_FIXTURES];

/** Reads a fixture file (node only: tests). Returns a fresh object each call. */
export async function readAct2CFixture(name: Act2CFixture): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}.json`, import.meta.url)), 'utf8')) as Record<string, unknown>;
}
