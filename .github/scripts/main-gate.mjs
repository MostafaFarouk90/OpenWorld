// Q14 main-run gate (contracts v0.8, plans/act4-L0.md section 3). On a push to main it decides whether the vitest shards
// can be skipped because the exact tree was already tested green by the PR's own run. Plain Node 20, no dependencies.
//
// It answers `skip` only when ALL hold; anything else (a mismatch, missing data, an HTTP error, an exception) is `run`:
//   1. the pushed commit maps to exactly one merged PR whose merge commit is this commit;
//   2. the merged tree equals the PR head's tree;
//   3. the newest `pull_request` run of this workflow for that head sha concluded `success`;
//   4. that run carries the `tested-tree-<sha>` artifact naming the merged tree (the tree of the merge checkout it tested).
// The artifact's name carries the tree, so the gate lists artifacts and never downloads one.

export const ARTIFACT_PREFIX = 'tested-tree-';
export const WORKFLOW_FILE = 'ci.yml';

/**
 * @typedef {{ number: number, merged_at: string | null, merge_commit_sha: string | null, head: { sha: string } }} PullLike
 * @typedef {{ id: number, status: string, conclusion: string | null, created_at?: string, run_number?: number }} RunLike
 * @typedef {{ name: string, expired?: boolean }} ArtifactLike
 * @typedef {{ sha: string, mergedTree: string, pulls: PullLike[] | null, headTree: string | null, runs: RunLike[] | null, artifacts: ArtifactLike[] | null }} GateInput
 * @typedef {{ tests: 'skip' | 'run', reason: string, pr?: number, headSha?: string, headTree?: string | null, mergedTree?: string, runId?: number }} GateDecision
 */

const SHA = /^[0-9a-f]{40}$/;

/** Pure decision over already-fetched data. @param {GateInput} input @returns {GateDecision} */
export function decide(input) {
  const base = { mergedTree: input.mergedTree };
  if (!SHA.test(String(input.sha))) return { tests: 'run', reason: 'no commit sha', ...base };
  if (!SHA.test(String(input.mergedTree))) return { tests: 'run', reason: 'no merged tree', ...base };
  if (!Array.isArray(input.pulls)) return { tests: 'run', reason: 'could not list the PRs of the commit', ...base };
  const merged = input.pulls.filter((p) => p && p.merged_at && p.merge_commit_sha === input.sha);
  if (merged.length === 0) return { tests: 'run', reason: 'no merged PR for this commit (a direct push?)', ...base };
  if (merged.length > 1) return { tests: 'run', reason: `${merged.length} merged PRs claim this commit`, ...base };
  const pr = merged[0];
  const headSha = pr.head && pr.head.sha;
  const ids = { pr: pr.number, headSha, headTree: input.headTree, ...base };
  if (!SHA.test(String(headSha))) return { tests: 'run', reason: 'the PR has no head sha', ...ids };
  if (input.headTree !== input.mergedTree) return { tests: 'run', reason: 'the merged tree differs from the PR head tree', ...ids };
  if (!Array.isArray(input.runs) || input.runs.length === 0) return { tests: 'run', reason: 'no pull_request run for the PR head', ...ids };
  const newest = [...input.runs].sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || b.id - a.id)[0];
  const withRun = { ...ids, runId: newest.id };
  if (newest.status !== 'completed') return { tests: 'run', reason: `the newest PR run is ${newest.status}`, ...withRun };
  if (newest.conclusion !== 'success') return { tests: 'run', reason: `the newest PR run concluded ${newest.conclusion}`, ...withRun };
  if (!Array.isArray(input.artifacts)) return { tests: 'run', reason: 'could not list the PR run artifacts', ...withRun };
  const tested = input.artifacts.filter((a) => a && !a.expired && typeof a.name === 'string' && a.name.startsWith(ARTIFACT_PREFIX));
  if (tested.length === 0) return { tests: 'run', reason: 'the PR run has no tested-tree artifact', ...withRun };
  if (!tested.some((a) => a.name === ARTIFACT_PREFIX + input.mergedTree)) return { tests: 'run', reason: 'the PR run tested a different tree', ...withRun };
  return { tests: 'skip', reason: 'this tree was tested green by the PR run', ...withRun };
}

/**
 * Fetches the inputs through injected I/O and decides. Never throws: an error becomes `run`.
 * @param {{ sha: string, mergedTree: string, repo: string, fetchJson: (path: string) => Promise<any> }} io
 * @returns {Promise<GateDecision>}
 */
export async function evaluate({ sha, mergedTree, repo, fetchJson }) {
  try {
    const pulls = await fetchJson(`/repos/${repo}/commits/${sha}/pulls`);
    /** @type {GateInput} */
    const input = { sha, mergedTree, pulls: Array.isArray(pulls) ? pulls : null, headTree: null, runs: null, artifacts: null };
    const merged = (input.pulls ?? []).filter((p) => p && p.merged_at && p.merge_commit_sha === sha);
    if (merged.length === 1 && SHA.test(String(merged[0].head && merged[0].head.sha))) {
      const head = merged[0].head.sha;
      const commit = await fetchJson(`/repos/${repo}/git/commits/${head}`);
      input.headTree = commit && commit.tree && typeof commit.tree.sha === 'string' ? commit.tree.sha : null;
      if (input.headTree === mergedTree) {
        const runs = await fetchJson(`/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${head}&event=pull_request&per_page=20`);
        input.runs = runs && Array.isArray(runs.workflow_runs) ? runs.workflow_runs : null;
        const newest = input.runs && [...input.runs].sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0) || b.id - a.id)[0];
        if (newest && newest.status === 'completed' && newest.conclusion === 'success') {
          const arts = await fetchJson(`/repos/${repo}/actions/runs/${newest.id}/artifacts?per_page=100`);
          input.artifacts = arts && Array.isArray(arts.artifacts) ? arts.artifacts : null;
        }
      }
    }
    return decide(input);
  } catch (e) {
    return { tests: 'run', reason: `error: ${e instanceof Error ? e.message : String(e)}`, mergedTree };
  }
}

/** The job summary (markdown). @param {GateDecision} d */
export function summary(d) {
  const lines = [
    `### Main-run gate: tests ${d.tests === 'skip' ? 'skipped' : 'run'}`,
    '',
    `- Decision: \`${d.tests}\` (${d.reason})`,
    `- PR: ${d.pr !== undefined ? `#${d.pr}` : 'none'}`,
    `- Head sha: \`${d.headSha ?? '-'}\``,
    `- Head tree: \`${d.headTree ?? '-'}\``,
    `- Merged tree: \`${d.mergedTree ?? '-'}\``,
    `- PR run: ${d.runId !== undefined ? d.runId : '-'}`,
  ];
  return lines.join('\n') + '\n';
}

/** GitHub REST over the global fetch; a non-2xx status throws. */
export function githubFetchJson(token, api = 'https://api.github.com') {
  return async (path) => {
    const res = await fetch(api + path, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  };
}

/** The CLI: the only code that reads the environment, the network and the filesystem. */
export async function main(env = process.env) {
  const fs = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  let mergedTree = env.MERGED_TREE ?? '';
  if (!mergedTree) {
    try {
      mergedTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    } catch {
      mergedTree = '';
    }
  }
  const d = await evaluate({
    sha: env.GITHUB_SHA ?? '',
    mergedTree,
    repo: env.GITHUB_REPOSITORY ?? '',
    fetchJson: githubFetchJson(env.GITHUB_TOKEN ?? '', env.GITHUB_API_URL ?? 'https://api.github.com'),
  });
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `tests=${d.tests}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary(d));
  console.log(`main-gate: tests=${d.tests} (${d.reason})`);
  return d;
}

const isCli = typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  main().catch((e) => {
    // Never fail the job on our own error: print `run` so the tests run.
    console.log(`main-gate: tests=run (error: ${e instanceof Error ? e.message : String(e)})`);
    if (process.env.GITHUB_OUTPUT) {
      import('node:fs').then((fs) => fs.appendFileSync(process.env.GITHUB_OUTPUT, 'tests=run\n'));
    }
  });
}
