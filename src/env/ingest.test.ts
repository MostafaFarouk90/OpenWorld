// Runs tools/env-pass/ingest.mjs on small generated glb files in a temp folder: the glow's KHR_materials_emissive_strength survives,
// an id the output folder already ships is refused unless --replace is given (generated files must not replace artist models),
// .lodN.glb files are ignored, a flat file with no height is refused instead of being scaled by infinity, non-KayKit material
// extensions (clearcoat and the like) are dropped, and a thin decal fits its footprint.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';

// Node built-ins are not statically imported: the app tsconfig has no Node types (same as runtimeAssets.test.ts).
const mods = { fs: 'node:fs', os: 'node:os', path: 'node:path', cp: 'node:child_process' };
let fs: any;
let os: any;
let path: any;
let cp: any;
let tmp = '';

/** A box w x h x d on y 0 with one glowing material (emissive strength 3, plus a clearcoat ingest must drop), written as <dir>/<name>. */
async function box(dir: string, name: string, w: number, h: number, d: number): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const p: number[] = [];
  for (const x of [-w / 2, w / 2]) for (const y of [0, h]) for (const z of [-d / 2, d / 2]) p.push(x, y, z);
  const idx = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  const strength = doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(3);
  const clearcoat = doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(1);
  const mat = doc
    .createMaterial('Glow')
    .setBaseColorFactor([1, 0.1, 0, 1])
    .setEmissiveFactor([1, 0.1, 0])
    .setExtension('KHR_materials_emissive_strength', strength)
    .setExtension('KHR_materials_clearcoat', clearcoat);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer))
    .setMaterial(mat);
  doc.createScene().addChild(doc.createNode(name).setMesh(doc.createMesh().addPrimitive(prim)));
  await new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).write(path.join(dir, name), doc);
}

/** Runs the ingest; returns its exit code and output. */
function ingest(src: string, out: string, ...flags: string[]): { code: number; log: string } {
  const script = new URL('../../tools/env-pass/ingest.mjs', import.meta.url).pathname;
  const r = cp.spawnSync((globalThis as any).process.execPath, [script, src, out, ...flags], { encoding: 'utf8', timeout: 50_000 });
  return { code: r.status, log: `${r.stdout}${r.stderr}` };
}

const glbJson = (f: string): any => {
  const buf = fs.readFileSync(f);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
};

beforeAll(async () => {
  fs = await import(/* @vite-ignore */ mods.fs);
  os = await import(/* @vite-ignore */ mods.os);
  path = await import(/* @vite-ignore */ mods.path);
  cp = await import(/* @vite-ignore */ mods.cp);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-test-'));
});

afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('env-pass ingest', () => {
  it('keeps the emissive strength of a glow material', async () => {
    const src = path.join(tmp, 'a-src');
    const out = path.join(tmp, 'a-out');
    fs.mkdirSync(src);
    await box(src, 'ember-rock-a.glb', 2.5, 2, 2.5);
    const r = ingest(src, out);
    expect(r.code, r.log).toBe(0);
    const json = glbJson(path.join(out, 'ember-rock-a.glb'));
    expect(json.extensionsUsed).toContain('KHR_materials_emissive_strength');
    expect(json.materials[0].extensions.KHR_materials_emissive_strength.emissiveStrength).toBe(3);
    expect(json.materials[0].emissiveFactor).toEqual([1, 0.1, 0]);
    expect(json.extensionsUsed).not.toContain('KHR_materials_clearcoat');
    expect(json.materials[0].extensions.KHR_materials_clearcoat).toBeUndefined();
  }, 60_000);

  it('refuses an id the output already ships, keeps the source, and overwrites it with --replace', async () => {
    const src = path.join(tmp, 'b-src');
    const out = path.join(tmp, 'b-out');
    fs.mkdirSync(src);
    await box(src, 'ember-rock-b.glb', 2.5, 2, 2.5);
    expect(ingest(src, out).code).toBe(0);
    const first = fs.statSync(path.join(out, 'ember-rock-b.glb')).mtimeMs;

    // a second file under the same id: refused, nothing written, the staged source stays even with --remove
    await box(src, 'ember-rock-b.glb', 2, 2, 2);
    const refused = ingest(src, out, '--remove');
    expect(refused.code).toBe(1);
    expect(refused.log).toMatch(/FAIL ember-rock-b: already shipped/);
    expect(fs.statSync(path.join(out, 'ember-rock-b.glb')).mtimeMs).toBe(first);
    expect(fs.existsSync(path.join(src, 'ember-rock-b.glb'))).toBe(true);

    const replaced = ingest(src, out, '--replace');
    expect(replaced.code, replaced.log).toBe(0);
    expect(replaced.log).toMatch(/ember-rock-b: scale/);
    expect(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).objects['ember-rock-b']).toBeDefined();
  }, 60_000);

  it('refuses an id that is only in the manifest (file missing on disk)', async () => {
    const src = path.join(tmp, 'c-src');
    const out = path.join(tmp, 'c-out');
    fs.mkdirSync(src);
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ objects: { 'slag-heap': { id: 'slag-heap' } } }));
    await box(src, 'slag-heap.glb', 5, 2.5, 5);
    const r = ingest(src, out);
    expect(r.code).toBe(1);
    expect(r.log).toMatch(/FAIL slag-heap: already shipped/);
    expect(fs.existsSync(path.join(out, 'slag-heap.glb'))).toBe(false);
  }, 60_000);

  it('fits a thin decal to its footprint (proportion table), not a 4x footprint from the height', async () => {
    const src = path.join(tmp, 'e-src');
    const out = path.join(tmp, 'e-out');
    fs.mkdirSync(src);
    await box(src, 'ash-patch-decal.glb', 3, 0.005, 3);
    const r = ingest(src, out);
    expect(r.code, r.log).toBe(0);
    expect(r.log).not.toMatch(/CAP/);
    const pos = glbJson(path.join(out, 'ash-patch-decal.glb')).accessors.find((a: any) => a.type === 'VEC3' && a.max);
    expect(pos.max[0] - pos.min[0]).toBeCloseTo(3, 2);
    expect(pos.max[1] - pos.min[1]).toBeCloseTo(0.02, 3);
    expect(pos.max[2] - pos.min[2]).toBeCloseTo(3, 2);
  }, 60_000);

  it('ignores .lodN.glb files and refuses a flat file with no height', async () => {
    const src = path.join(tmp, 'd-src');
    const out = path.join(tmp, 'd-out');
    fs.mkdirSync(src);
    await box(src, 'ore-pile.lod1.glb', 2, 1, 2);
    await box(src, 'waystone-flagstones.glb', 9, 0, 9);
    const r = ingest(src, out);
    expect(r.code).toBe(1);
    expect(r.log).not.toMatch(/ore-pile/);
    expect(r.log).toMatch(/FAIL waystone-flagstones: the model has no height/);
    expect(fs.existsSync(path.join(out, 'waystone-flagstones.glb'))).toBe(false);
  }, 60_000);
});
