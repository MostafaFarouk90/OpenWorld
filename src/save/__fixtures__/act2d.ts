/**
 * Act 2 Phase D (Oldsmoke and the return) save fixtures, written by the real save plugin from the Phase C complete save
 * through the deterministic generator (src/integration/fixtures.genD.test.ts, src/integration/act2dFixtures.ts; regenerate with
 * `GEN_FIXTURES=1 npx vitest run src/integration/fixtures.genD.test.ts`). Same shape and rules as the Phase C ones
 * (src/save/__fixtures__/act2c.ts). They are also the Phase D migration test inputs.
 */
export const ACT2_D_FIXTURES = {
  /** M16 done at Deepgate; M17 offerable (Slagg). */
  m17Start: 'act2-m17-start',
  /** M17, R08 to R10 done; M18 (the Bellows) under way, the plaque and the pipes read; the player at the shaft head. */
  minesMid: 'act2-mines-mid',
  /** M22 started and the Council heard; D04 and every other Phase D quest done. */
  m22Active: 'act2-m22-active',
  /** D04 done, M22 offerable; the act has not ended. */
  d04Complete: 'act2-d04-complete',
  /** M22 done: the act ended once (gate a3, the card seen, the camp scene run, Wenna at the camp). */
  actComplete: 'act2-act-complete',
} as const;
export type Act2DFixture = (typeof ACT2_D_FIXTURES)[keyof typeof ACT2_D_FIXTURES];

/** Reads a fixture file (node only: tests). Returns a fresh object each call. */
export async function readAct2DFixture(name: Act2DFixture): Promise<Record<string, unknown>> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: string, enc: 'utf8'): string };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}.json`, import.meta.url)), 'utf8')) as Record<string, unknown>;
}
