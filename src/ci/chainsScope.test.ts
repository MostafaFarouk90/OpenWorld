// The `chains` group and its CI scope (plans/act4-L13.md section 15): the pure scope rule, the CLI under node on a real git
// diff, and the group itself (exactly the whole-phase chains, kept out of the default run). No CI run is spent on any of it.
import { describe, expect, it } from 'vitest';
import * as scope from '../../.github/scripts/chains-scope.mjs';
import { CHAIN_FILES } from '../../vitest.chains';

const load = async <T>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T;
const { execFileSync } = await load<{ execFileSync(cmd: string, args: string[], o: { encoding: string; cwd?: string; env?: Record<string, string | undefined> }): string }>('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync } = await load<{
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, enc: string): string;
  writeFileSync(path: string, data: string): void;
  mkdirSync(path: string, o: { recursive: boolean }): void;
  readdirSync(path: string): string[];
}>('node:fs');
const { tmpdir } = await load<{ tmpdir(): string }>('node:os');
const { join, resolve, dirname } = await load<{ join(...p: string[]): string; resolve(...p: string[]): string; dirname(p: string): string }>('node:path');
const proc = (globalThis as unknown as { process: { execPath: string; env: Record<string, string | undefined>; cwd(): string } }).process;
const { decideChains, CHAIN_PATHS, TITLE_MARKER } = scope;

describe('the chains scope rule', () => {
  it('runs on a change to what the chains play, their own directory, the CI or the group', () => {
    for (const f of ['src/quests/act4/x.ts', 'src/integration/phaseGDriver.ts', 'src/dialogue/a.ts', 'src/scenes/s.ts', 'src/save/x.ts',
      'src/waystones/w.ts', 'src/waste/w.ts', 'src/enemies/defs.ts', 'src/bosses/act4/eormen/e.ts', 'src/region/regions.ts',
      '.github/workflows/ci.yml', '.github/scripts/chains-scope.mjs', 'vitest.chains.ts', 'vitest.config.ts']) {
      expect(decideChains({ event: 'pull_request', files: ['src/hud/a.ts', f] }).chains, f).toBe('run');
    }
  });
  it('skips a change outside the scope, on a PR and on main alike', () => {
    const files = ['src/hud/Hud.ts', 'src/companions/c.ts', 'public/assets/env/tree.glb', 'README.md'];
    expect(decideChains({ event: 'pull_request', files })).toMatchObject({ chains: 'skip' });
    expect(decideChains({ event: 'push', files })).toMatchObject({ chains: 'skip' });
  });
  it('a prefix needs its slash: src/quests-notes.md is not src/quests/', () => {
    expect(decideChains({ event: 'push', files: ['src/quests-notes.md', 'src/savegame.ts', 'src/regions.ts', 'src/wasteland.ts'] }).chains).toBe('skip');
  });
  it('runs by hand, or on a PR whose title carries the marker (only on a PR)', () => {
    expect(decideChains({ event: 'workflow_dispatch', files: ['src/hud/a.ts'] }).chains).toBe('run');
    expect(decideChains({ event: 'pull_request', files: ['src/hud/a.ts'], title: `HUD tweak ${TITLE_MARKER}` }).chains).toBe('run');
    expect(decideChains({ event: 'push', files: ['src/hud/a.ts'], title: TITLE_MARKER }).chains).toBe('skip');
  });
  it('any doubt runs them: no file list, or an empty one', () => {
    expect(decideChains({ event: 'push', files: null }).chains).toBe('run');
    expect(decideChains({ event: 'push', files: [] }).chains).toBe('run');
  });
  it('the scope names the chain files directory and the CI file', () => {
    expect(CHAIN_PATHS).toContain('src/integration/');
    expect(CHAIN_PATHS).toContain('.github/workflows/ci.yml');
    for (const f of ['vite.config.ts', 'package.json', 'package-lock.json']) expect(CHAIN_PATHS).toContain(f);
  });
});

describe('the CLI on a real git diff', () => {
  const SCRIPT = resolve(proc.cwd(), '.github/scripts/chains-scope.mjs');
  /** A repo with a base commit, then one commit per changed path; returns the base sha. */
  function repo(...changed: string[]): { dir: string; base: string } {
    const dir = mkdtempSync(join(tmpdir(), 'chains-scope-'));
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8', cwd: dir });
    git('init', '-q');
    writeFileSync(join(dir, 'a.txt'), '1');
    git('add', '.');
    git('commit', '-qm', 'one');
    const base = git('rev-parse', 'HEAD').trim();
    for (const c of changed) {
      mkdirSync(dirname(join(dir, c)), { recursive: true });
      writeFileSync(join(dir, c), c);
      git('add', '.');
      git('commit', '-qm', c);
    }
    return { dir, base };
  }
  function cli(dir: string, event: string, before = ''): string {
    const out = join(dir, 'out.txt');
    writeFileSync(out, '');
    execFileSync(proc.execPath, [SCRIPT], { encoding: 'utf8', cwd: dir, env: { ...proc.env, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: out, PR_TITLE: '', BEFORE_SHA: before } });
    return readFileSync(out, 'utf8');
  }
  it('a PR diffs against the first parent: run for a quest change, skip for a HUD change', () => {
    expect(cli(repo('src/quests/q.ts').dir, 'pull_request')).toBe('chains=run\n');
    expect(cli(repo('src/hud/h.ts').dir, 'pull_request')).toBe('chains=skip\n');
  });
  it('a push diffs the whole pushed range, so an in-scope commit before an out-of-scope one still runs them', () => {
    const r = repo('src/quests/q.ts', 'src/hud/h.ts');
    expect(cli(r.dir, 'push', r.base)).toBe('chains=run\n');
    const s = repo('src/hud/h.ts', 'src/audio/a.ts');
    expect(cli(s.dir, 'push', s.base)).toBe('chains=skip\n');
  });
  it('a push with no range (a new branch, all zeros) or no parent to diff runs them', () => {
    const r = repo('src/hud/h.ts');
    expect(cli(r.dir, 'push', '')).toBe('chains=run\n');
    expect(cli(r.dir, 'push', '0'.repeat(40))).toBe('chains=run\n');
    const dir = mkdtempSync(join(tmpdir(), 'chains-scope-'));
    execFileSync('git', ['init', '-q'], { encoding: 'utf8', cwd: dir });
    expect(cli(dir, 'pull_request')).toBe('chains=run\n');
  });
  it('a file moved out of the scope lists its old path too (no rename folding)', () => {
    const r = repo('src/quests/moved.ts');
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8', cwd: r.dir });
    mkdirSync(join(r.dir, 'src/hud'), { recursive: true });
    git('mv', 'src/quests/moved.ts', 'src/hud/moved.ts');
    git('commit', '-qm', 'move');
    expect(cli(r.dir, 'pull_request')).toBe('chains=run\n');
  });
});

describe('the chains group', () => {
  const chainName = /^phase[A-Z]\.run[AB]\.e2e\.test\.ts$/;
  const files = readdirSync(resolve(proc.cwd(), 'src/integration')).filter((f) => chainName.test(f));
  it('is exactly the whole-phase chains, runs A and B of Phases C to I (fourteen files)', () => {
    // N12 (additive): Act 5's Phase I chain joins by its name
    expect(files.sort()).toEqual(['C', 'D', 'E', 'F', 'G', 'H', 'I'].flatMap((p) => [`phase${p}.runA.e2e.test.ts`, `phase${p}.runB.e2e.test.ts`]));
    expect(CHAIN_FILES).toEqual(['src/integration/phase*.run[AB].e2e.test.ts']);
  });
  it('is left out of the default run and is all the chains config runs', async () => {
    const cfgOf = async (path: string) => {
      const mod = (await import(/* @vite-ignore */ resolve(proc.cwd(), path))) as { default: unknown };
      const c = typeof mod.default === 'function' ? await (mod.default as (e: unknown) => unknown)({ command: 'serve', mode: 'test' }) : mod.default;
      return (c as { test: { include: string[]; exclude: string[] } }).test;
    };
    const def = await cfgOf('vitest.config.ts');
    for (const g of CHAIN_FILES) expect(def.exclude).toContain(g);
    const ch = await cfgOf('vitest.chains.config.ts');
    expect(ch.include).toEqual([...CHAIN_FILES]);
    for (const g of CHAIN_FILES) expect(ch.exclude).not.toContain(g);
  });
});
