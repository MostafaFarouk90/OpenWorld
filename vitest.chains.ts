// The `chains` group: the tests that play a whole phase headless (Acts 2 to 4, runs A and B), about half the suite's time.
// The default run (`npx vitest run`, the three CI shards) leaves them out; `npm run test:chains` runs only them, and the CI
// `chains` job runs them when a change touches what they play (.github/scripts/chains-scope.mjs). A new phase chain named
// `phase<X>.run<A|B>.e2e.test.ts` joins the group by its name. "Ready" still means both runs locally (plans/act4-L13.md s.15).
// One chain on its own: `npm run test:chains -- src/integration/phaseG.runA` (the default config no longer finds it). In CI a
// PR title carrying [chains] forces them, read when a push starts the run (retitling alone starts none).
export const CHAIN_FILES: readonly string[] = ['src/integration/phase*.run[AB].e2e.test.ts'];
