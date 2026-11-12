// Entry point: writes the stand-in glbs (see lib.ts for the geometry and the why; caldera.ts for the Caldera's, Act 5 N1 PR 2).
//   npx vite-node tools/env-pass/standins/gen-standins.ts [outDir] [--caldera]   (default public/assets/env-standin; --caldera writes only
//   the Caldera's ids, so the four Act 2 files are left byte for byte)
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDERS, STANDIN_IDS, toGlb } from './lib';
import { CALDERA_STANDIN_BUILDERS, CALDERA_STANDIN_IDS } from './caldera';

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(here, '../../..');
  const args = process.argv.slice(2);
  const calderaOnly = args.includes('--caldera');
  const outArg = args.find((a) => !a.startsWith('--'));
  const outDir = path.resolve(outArg ?? path.join(repo, 'public/assets/env-standin'));
  const builders: Record<string, () => ReturnType<(typeof BUILDERS)[keyof typeof BUILDERS]>> = calderaOnly ? { ...CALDERA_STANDIN_BUILDERS } : { ...BUILDERS, ...CALDERA_STANDIN_BUILDERS };
  const ids = calderaOnly ? CALDERA_STANDIN_IDS : [...STANDIN_IDS, ...CALDERA_STANDIN_IDS];
  const targets = JSON.parse(readFileSync(path.join(repo, 'src/env/targets.json'), 'utf8')).objects as Record<string, { w: number; d: number; h: number }>;
  const raw = mkdtempSync(path.join(tmpdir(), 'standin-raw-'));
  const ingested = mkdtempSync(path.join(tmpdir(), 'standin-out-'));
  try {
    for (const id of ids) {
      const { builder, mats } = builders[id]!();
      const t = targets[id];
      builder.fit(t.w, t.d, t.h);
      writeFileSync(path.join(raw, `${id}.glb`), toGlb(id, builder, mats));
      console.log(`${id}: ${builder.triangles()} triangles, ${builder.prims.size} materials`);
    }
    const r = spawnSync('node', [path.join(here, '../ingest.mjs'), raw, ingested], { stdio: 'inherit', cwd: repo });
    if (r.status !== 0) throw new Error('ingest.mjs failed');
    mkdirSync(outDir, { recursive: true });
    for (const f of readdirSync(ingested).filter((n) => n.endsWith('.glb'))) copyFileSync(path.join(ingested, f), path.join(outDir, f));
    console.log(`written to ${outDir} (no manifest: the stand-ins stay outside public/assets/env/manifest.json)`);
  } finally {
    rmSync(raw, { recursive: true, force: true });
    rmSync(ingested, { recursive: true, force: true });
  }
}

await main();
