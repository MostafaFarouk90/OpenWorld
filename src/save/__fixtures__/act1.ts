/**
 * Act 1 (Phase B, Harrowmark) save fixtures, written by the real save plugin from the headless Act 1 runs
 * (src/integration/fixtures.gen.test.ts, src/integration/phaseB.ts; regenerate with
 * `GEN_FIXTURES=1 npx vitest run src/integration/fixtures.gen.test.ts`). Same shape and rules as the Phase A ones
 * (src/save/__fixtures__/phaseA.ts): `<name>.json` is the stored `SaveFile`, `<name>.meta.json` the generating commit.
 */
export const ACT1_FIXTURES = {
  /** Run A: M06 done by bribe, through the South Gate; M07 not started. */
  m06ThroughGate: 'act1-m06-through-gate',
  /** Run B: M07 done, the Warden chosen and its drill skipped, in the Bastion yard. */
  m07ClassChosen: 'act1-m07-class-chosen',
  /** Run A: M09 active, inside the Counting-House after the section cleared (o4), before the hand-in. */
  m09CountingHouse: 'act1-m09-counting-house',
  /** Run A: M10 done, the Ashmare unlocked, on foot. */
  m10Ashmare: 'act1-m10-ashmare',
  /** Run A: D02 active (o2), inside the Underways before the kennels. */
  d02Underways: 'act1-d02-underways',
  /** Run A: D02 done and the ending card showing (codex.actEndingSeen set, the camp not run): a quit during the card. */
  endingCard: 'act1-ending-card',
  /** Run A: the whole act, the ending and the camp scene done. */
  complete: 'act1-complete',
} as const;
export type Act1Fixture = (typeof ACT1_FIXTURES)[keyof typeof ACT1_FIXTURES];

/** Reads a fixture file (node only: tests). Returns a fresh object each call. */
export async function readAct1Fixture(name: Act1Fixture): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}.json`, import.meta.url)), 'utf8')) as Record<string, unknown>;
}
