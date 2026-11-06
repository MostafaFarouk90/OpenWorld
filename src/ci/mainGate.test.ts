// Q14 (contracts v0.8): the main-run gate. Pure decision, injected-I/O evaluation, the CLI wrapper under node, and the
// workflow wiring (a line parser, no YAML dependency). No CI run is spent on any of it.
import { describe, expect, it } from 'vitest';
import * as gateModule from '../../.github/scripts/main-gate.mjs';

// No @types/node in the project: node modules load through a variable (as region/testing/nodeFs.ts does).
const load = async <T>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T;
const { execFileSync } = await load<{ execFileSync(cmd: string, args: string[], o: { encoding: string; env: Record<string, string | undefined> }): string }>('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync } = await load<{
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, enc: string): string;
  writeFileSync(path: string, data: string): void;
}>('node:fs');
const { tmpdir } = await load<{ tmpdir(): string }>('node:os');
const { join, resolve } = await load<{ join(...p: string[]): string; resolve(...p: string[]): string }>('node:path');
const proc = (globalThis as unknown as { process: { execPath: string; env: Record<string, string | undefined>; cwd(): string } }).process;

const gate = gateModule;
const { ARTIFACT_PREFIX, decide, evaluate, summary } = gate;
type GateInput = Parameters<typeof decide>[0];

const REPO = 'MostafaFarouk90/OpenWorld';
const SCRIPT = resolve(proc.cwd(), '.github/scripts/main-gate.mjs');

/** Real merges (squash): merge commit, its tree, the PR head, the head's tree. Each would have skipped. */
const REAL = [
  { pr: 187, sha: '7a7f8a2bb694f4dbdf91a3e76e936db11acea3b2', tree: '81a810aafe0633bc4775a9f3c36277fc88fd83d1', head: '3a488c407c080f60960cfc523edd3b094d763dc6' },
  { pr: 188, sha: '0bac8e70f9c8cb6e3eb2f70bb1800662f66de759', tree: '454618b7d325a5e9f845bf8f1a9c7f626d7c7f0d', head: 'e095f9882926e005a4f827d102caeb4bf3796eb3' },
  { pr: 189, sha: '805923deac2c8bca40981246196a95240569fec7', tree: '756a306672937c3654841c8b1342aa2f7397c142', head: '670afc42a5dfe811ed0a1b98d87b0295382daffe' },
];
const OTHER = 'f'.repeat(40);

function input(m = REAL[2], over: Partial<GateInput> = {}): GateInput {
  return {
    sha: m.sha,
    mergedTree: m.tree,
    pulls: [{ number: m.pr, merged_at: '2026-11-05T00:00:00Z', merge_commit_sha: m.sha, head: { sha: m.head } }],
    headTree: m.tree,
    runs: [{ id: 900 + m.pr, run_number: 50, status: 'completed', conclusion: 'success' }],
    artifacts: [{ name: ARTIFACT_PREFIX + m.tree }],
    ...over,
  };
}

/** A fake GitHub API over the same data, for evaluate() and the CLI. */
function api(i: GateInput, fail?: { path: RegExp; status?: number; throws?: boolean; body?: unknown }) {
  return async (path: string): Promise<unknown> => {
    if (fail && fail.path.test(path)) {
      if (fail.throws) throw new Error('network down');
      if (fail.status) throw new Error(`HTTP ${fail.status} for ${path}`);
      return fail.body;
    }
    if (path.endsWith('/pulls')) return i.pulls;
    if (path.includes('/git/commits/')) return { tree: { sha: i.headTree } };
    if (path.includes('/runs?')) return { workflow_runs: i.runs };
    if (path.includes('/artifacts')) return { artifacts: i.artifacts };
    throw new Error(`unexpected ${path}`);
  };
}

describe('decide: the skip side (real merges)', () => {
  it.each(REAL)('#$pr: merged tree equals the head tree, the PR run is green and recorded it: skip', (m) => {
    expect(decide(input(m))).toMatchObject({ tests: 'skip', pr: m.pr, headSha: m.head, mergedTree: m.tree });
  });
});

describe('decide: the fallback side (every doubt runs the tests)', () => {
  const run = (over: Partial<GateInput>) => decide(input(REAL[2], over));
  it('a tree mismatch', () => expect(run({ headTree: OTHER })).toMatchObject({ tests: 'run', reason: expect.stringContaining('differs') }));
  it('no PR for the commit (a direct push)', () => expect(run({ pulls: [] }).tests).toBe('run'));
  it('two PRs', () => {
    const p = input().pulls![0];
    expect(run({ pulls: [p, { ...p, number: 999 }] })).toMatchObject({ tests: 'run', reason: expect.stringContaining('2 merged') });
  });
  it('a PR not merged, or merged as another commit', () => {
    const p = input().pulls![0];
    expect(run({ pulls: [{ ...p, merged_at: null }] }).tests).toBe('run');
    expect(run({ pulls: [{ ...p, merge_commit_sha: OTHER }] }).tests).toBe('run');
  });
  it.each(['failure', 'cancelled', null])('the PR run concluded %s', (conclusion) => {
    expect(run({ runs: [{ id: 1, run_number: 5, status: 'completed', conclusion }] }).tests).toBe('run');
  });
  it('the PR run still in progress', () => {
    expect(run({ runs: [{ id: 1, run_number: 5, status: 'in_progress', conclusion: null }] })).toMatchObject({ tests: 'run', reason: expect.stringContaining('in_progress') });
  });
  it('the newest PR run red with an older one green', () => {
    const runs = [
      { id: 1, run_number: 4, status: 'completed', conclusion: 'success' },
      { id: 2, run_number: 5, status: 'completed', conclusion: 'failure' },
    ];
    expect(run({ runs })).toMatchObject({ tests: 'run', runId: 2 });
  });
  it('no PR run at all', () => expect(run({ runs: [] }).tests).toBe('run'));
  it('the artifact missing, expired or naming a different tree', () => {
    expect(run({ artifacts: [] }).tests).toBe('run');
    expect(run({ artifacts: [{ name: ARTIFACT_PREFIX + REAL[2].tree, expired: true }] }).tests).toBe('run');
    expect(run({ artifacts: [{ name: ARTIFACT_PREFIX + OTHER }] })).toMatchObject({ tests: 'run', reason: expect.stringContaining('different tree') });
  });
  it('malformed data', () => {
    expect(run({ pulls: null }).tests).toBe('run');
    expect(run({ runs: null }).tests).toBe('run');
    expect(run({ artifacts: null }).tests).toBe('run');
    expect(run({ mergedTree: '' }).tests).toBe('run');
    expect(run({ sha: 'nope' }).tests).toBe('run');
  });
});

describe('evaluate (injected I/O)', () => {
  it('skips on the real data and runs on every HTTP error, malformed JSON or throw', async () => {
    const i = input(REAL[0]);
    const base = { sha: i.sha, mergedTree: i.mergedTree, repo: REPO };
    expect((await evaluate({ ...base, fetchJson: api(i) })).tests).toBe('skip');
    for (const fail of [
      { path: /\/pulls$/, status: 403 },
      { path: /\/git\/commits\//, status: 500 },
      { path: /\/runs\?/, body: { nope: true } },
      { path: /\/artifacts/, body: 'not json' },
      { path: /\/pulls$/, throws: true },
    ]) {
      const d = await evaluate({ ...base, fetchJson: api(i, fail) });
      expect(d.tests, JSON.stringify(fail.path.source)).toBe('run');
    }
  });
  it('the summary names the decision, the reason, the PR, the shas, the trees and the run', () => {
    const s = summary(decide(input(REAL[1])));
    for (const part of ['tests skipped', '`skip`', '#188', REAL[1].head, REAL[1].tree, String(900 + 188)]) expect(s).toContain(part);
    expect(summary(decide(input(REAL[1], { headTree: OTHER })))).toContain('tests run');
  });
});

describe('the CLI wrapper under node (fake fetch via --import)', () => {
  function cli(i: GateInput, status = 200) {
    const dir = mkdtempSync(join(tmpdir(), 'main-gate-'));
    const out = join(dir, 'out');
    const sum = join(dir, 'summary');
    writeFileSync(out, '');
    writeFileSync(sum, '');
    const fake = join(dir, 'fake-fetch.mjs');
    writeFileSync(
      fake,
      `const data = ${JSON.stringify({ pulls: i.pulls, tree: i.headTree, runs: i.runs, artifacts: i.artifacts })};
globalThis.fetch = async (url) => {
  const ok = ${status} < 300;
  const u = String(url);
  const body = u.endsWith('/pulls') ? data.pulls : u.includes('/git/commits/') ? { tree: { sha: data.tree } }
    : u.includes('/runs?') ? { workflow_runs: data.runs } : u.includes('/artifacts') ? { artifacts: data.artifacts } : null;
  return { ok, status: ${status}, json: async () => body };
};\n`,
    );
    const stdout = execFileSync(proc.execPath, ['--import', `file://${fake}`, SCRIPT], {
      encoding: 'utf8',
      env: { ...proc.env, GITHUB_SHA: i.sha, MERGED_TREE: i.mergedTree, GITHUB_REPOSITORY: REPO, GITHUB_TOKEN: 'x', GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum },
    });
    return { stdout, output: readFileSync(out, 'utf8'), summary: readFileSync(sum, 'utf8') };
  }
  it('writes tests=skip and the summary for a tested tree', () => {
    const r = cli(input(REAL[2]));
    expect(r.output).toBe('tests=skip\n');
    expect(r.summary).toContain('tests skipped');
    expect(r.stdout).toContain('tests=skip');
  });
  it('writes tests=run on a mismatch and on an HTTP 500', () => {
    expect(cli(input(REAL[2], { headTree: OTHER })).output).toBe('tests=run\n');
    const r = cli(input(REAL[2]), 500);
    expect(r.output).toBe('tests=run\n');
    expect(r.summary).toContain('HTTP 500');
  });
});

describe('ci.yml wiring', () => {
  const yml = readFileSync(resolve(proc.cwd(), '.github/workflows/ci.yml'), 'utf8');
  /** The block of one top-level job (two-space key under `jobs:`). */
  const job = (name: string): string => {
    const lines = yml.split('\n');
    const start = lines.findIndex((l: string) => l === `  ${name}:`);
    expect(start, name).toBeGreaterThan(0);
    let end = lines.findIndex((l: string, i: number) => i > start && /^ {2}[a-z][\w-]*:\s*$/.test(l));
    if (end < 0) end = lines.length;
    return lines.slice(start, end).join('\n');
  };
  it('the gate runs only on a push to main, read-only, and outputs its decision', () => {
    const g = job('gate');
    expect(g).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(g).toMatch(/permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+actions: read/);
    expect(g).toContain('tests: ${{ steps.decide.outputs.tests }}');
    expect(g).toContain('node .github/scripts/main-gate.mjs');
    expect(g).toContain('timeout-minutes: 3');
  });
  it("tests need the gate and are skipped only on an explicit 'skip' (a PR always runs them)", () => {
    const t = job('test');
    expect(t).toContain('needs: [gate]');
    expect(t).toContain("if: ${{ !cancelled() && (github.event_name == 'pull_request' || needs.gate.outputs.tests != 'skip') }}");
  });
  it('deploy waits on the build, and on the tests unless the gate skipped them', () => {
    const d = job('deploy');
    expect(d).toContain('needs: [gate, build, test]');
    expect(d).toContain("needs.build.result == 'success'");
    expect(d).toContain("(needs.test.result == 'success' || (needs.test.result == 'skipped' && needs.gate.outputs.tests == 'skip'))");
  });
  it('the tested-tree artifact is PR-only and named by the merge checkout tree', () => {
    const b = job('build');
    expect(b).toMatch(/Record the tested tree\n\s+if: github.event_name == 'pull_request'/);
    expect(b).toMatch(/upload-artifact@v4\n\s+if: github.event_name == 'pull_request'\n\s+with:\n\s+name: tested-tree-\$\{\{ steps.tree.outputs.tree \}\}/);
    expect(b).toContain("git rev-parse 'HEAD^{tree}'");
    expect(ARTIFACT_PREFIX).toBe('tested-tree-');
  });
});
