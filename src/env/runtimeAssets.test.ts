// Guard for the environment objects the game ships (public/assets/env, written by tools/env-pass/ingest.mjs): every runtime glb is
// within the per-file budgets, has a target, and the manifest matches the folder. Raw generated files (tens of MB, 50k triangles)
// must be ingested and removed, never shipped.
import { beforeAll, describe, expect, it } from 'vitest';
import targets from './targets.json';

const DIR = 'public/assets/env/';
const fsModule = 'node:fs'; // not statically imported: the app tsconfig has no Node types (same as importedAssets.test.ts)

let fs: any;
let files: string[] = [];

const bytes = (f: string): any => fs.readFileSync(DIR + f);
function triangles(f: string): number {
  const buf = bytes(f);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  let n = 0;
  for (const m of json.meshes) for (const p of m.primitives) if (p.indices !== undefined) n += json.accessors[p.indices].count / 3;
  return n;
}

beforeAll(async () => {
  fs = await import(/* @vite-ignore */ fsModule);
  files = (fs.readdirSync(DIR) as string[]).filter((f) => f.endsWith('.glb'));
});

describe('runtime environment assets', () => {
  it('has the ingested files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every file is light, has a target and a valid header', () => {
    for (const f of files) {
      expect(fs.statSync(DIR + f).size / 1e6, `${f} MB`).toBeLessThanOrEqual(targets.maxFileMB);
      expect(triangles(f), `${f} triangles`).toBeLessThanOrEqual(targets.maxTriangles);
      expect(Object.keys(targets.objects), f).toContain(f.replace(/\.glb$/, ''));
      expect(bytes(f).readUInt32LE(0), f).toBe(0x46546c67);
    }
  });

  it('lists exactly the folder in the manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(DIR + 'manifest.json', 'utf8'));
    expect(Object.keys(manifest.objects).sort()).toEqual(files.map((f) => f.replace(/\.glb$/, '')).sort());
  });

  it('batch 2 and later fit rule: width and depth stretch within 15%', () => {
    const manifest = JSON.parse(fs.readFileSync(DIR + 'manifest.json', 'utf8'));
    for (const [id, o] of Object.entries<any>(manifest.objects)) {
      if ((targets as any).proportion?.[id]) {
        // proportion table: exact fit (tiled where listed); the manifest says so and the stretch is only sanity-checked
        expect(o.proportion, `${id} proportion`).toBe(true);
        for (const k of o.stretch ?? []) expect(k, `${id} stretch`).toBeGreaterThan(0.2);
        continue;
      }
      for (const k of o.stretch ?? []) {
        expect(k, `${id} stretch`).toBeGreaterThanOrEqual(0.85 - 1e-3);
        expect(k, `${id} stretch`).toBeLessThanOrEqual(1.15 + 1e-3);
      }
    }
  });

  it('total runtime size stays small', () => {
    const total = files.reduce((s, f) => s + fs.statSync(DIR + f).size, 0) / 1e6;
    expect(total).toBeLessThan(40);
  });
});
