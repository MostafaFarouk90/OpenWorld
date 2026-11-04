// Entry point: writes the four stand-in glbs (see lib.ts for the geometry and the why).
//   npx vite-node tools/env-pass/standins/gen-standins.ts [outDir]        (default public/assets/env-standin)
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDERS, STANDIN_IDS, toGlb } from './lib';

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(here, '../../..');
  const outDir = path.resolve(process.argv[2] ?? path.join(repo, 'public/assets/env-standin'));
  const targets = JSON.parse(readFileSync(path.join(repo, 'src/env/targets.json'), 'utf8')).objects as Record<string, { w: number; d: number; h: number }>;
  const raw = mkdtempSync(path.join(tmpdir(), 'standin-raw-'));
  const ingested = mkdtempSync(path.join(tmpdir(), 'standin-out-'));
  try {
    for (const id of STANDIN_IDS) {
      const { builder, mats } = BUILDERS[id]();
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
