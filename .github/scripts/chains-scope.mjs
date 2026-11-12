// The `chains` scope (plans/act4-L13.md section 15): decides whether the whole-phase chain tests (vitest.chains.ts) run in
// this CI run. They run when the change touches what they play (CHAIN_PATHS), when a PR title carries `[chains]`, or on a
// manual run; otherwise they are skipped, on a PR and on main alike. Any doubt or error answers `run`. Plain Node 20.
//
// The change: on a PR, the merge checkout against its first parent (the base; the build job checks out with fetch-depth 2);
// on a push, the pushed range `before..HEAD` (BEFORE_SHA, fetched here), so a rebase merge or a multi-commit push is
// diffed whole. Renames list both paths. A missing or all-zero `before` answers run.

/** Path prefixes whose change runs the chains: what they play, the chains' own directory, the CI and the group itself. */
export const CHAIN_PATHS = [
  'src/quests/',
  'src/integration/',
  'src/dialogue/',
  'src/scenes/',
  'src/save/',
  'src/waystones/',
  // Phase H playthrough (2026-11-07, coordinator ruling): the Waste, the enemies, the bosses and the regions are what
  // the Act 4 chain plays too.
  'src/waste/',
  'src/enemies/',
  'src/bosses/',
  'src/region/',
  '.github/workflows/ci.yml',
  '.github/scripts/chains-scope.mjs',
  'vitest.chains.ts',
  'vitest.chains.config.ts',
  'vitest.config.ts',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
];

export const TITLE_MARKER = '[chains]';

/**
 * @param {{ event: string, files: string[] | null, title?: string }} input
 * @returns {{ chains: 'run' | 'skip', reason: string }}
 */
export function decideChains({ event, files, title = '' }) {
  if (event === 'workflow_dispatch') return { chains: 'run', reason: 'a manual run' };
  if (event === 'pull_request' && title.includes(TITLE_MARKER)) return { chains: 'run', reason: `the PR title carries ${TITLE_MARKER}` };
  if (!Array.isArray(files)) return { chains: 'run', reason: 'could not list the changed files' };
  if (files.length === 0) return { chains: 'run', reason: 'no changed files listed' };
  const hit = files.find((f) => CHAIN_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
  if (hit) return { chains: 'run', reason: `${hit} is in the chains' scope` };
  return { chains: 'skip', reason: `none of the ${files.length} changed files is in the chains' scope` };
}

/** The CLI: reads the event, the PR title and the diff, writes `chains=<run|skip>` to GITHUB_OUTPUT. Never throws. */
export async function main(env = process.env) {
  const fs = await import('node:fs');
  let files = null;
  try {
    const { execFileSync } = await import('node:child_process');
    const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
    let from = 'HEAD^1';
    if ((env.GITHUB_EVENT_NAME ?? '') === 'push') {
      const before = env.BEFORE_SHA ?? '';
      if (!/^[0-9a-f]{40}$/.test(before) || /^0+$/.test(before)) throw new Error('no push range');
      try {
        git(['cat-file', '-e', `${before}^{commit}`]);
      } catch {
        git(['fetch', '--quiet', '--depth=1', 'origin', before]);
      }
      from = before;
    }
    files = git(['diff', '--name-only', '--no-renames', from, 'HEAD']).split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    files = null;
  }
  const d = decideChains({ event: env.GITHUB_EVENT_NAME ?? '', files, title: env.PR_TITLE ?? '' });
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `chains=${d.chains}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Chains scope: ${d.chains}\n\n- ${d.reason}\n`);
  console.log(`chains-scope: chains=${d.chains} (${d.reason})`);
  return d;
}

const isCli = typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  main().catch((e) => {
    console.log(`chains-scope: chains=run (error: ${e instanceof Error ? e.message : String(e)})`);
    if (process.env.GITHUB_OUTPUT) import('node:fs').then((fs) => fs.appendFileSync(process.env.GITHUB_OUTPUT, 'chains=run\n'));
  });
}
