// Ingest step for environment glb files (G0b). Usage: node tools/env-pass/ingest.mjs <srcDir> <outDir> [--remove]
// For each <id>.glb in srcDir: bake the node transforms (Z-up exports become Y-up), scale uniformly to the size in src/env/targets.json,
// put the base on y = 0 and the footprint centre on x, z = 0, weld and simplify to the triangle budget, drop everything but the base
// colour texture, resize it to 512 px WebP, and write <outDir>/<id>.glb. With --remove the source file is deleted after a verified write
// (the staging-folder flow: drop files in, ingest, they are removed, only the light copies stay). Originals are never edited in place.
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, dedup, textureCompress, getBounds, flatten, transformMesh } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, readdirSync, mkdirSync, statSync, unlinkSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: ingest.mjs <srcDir> <outDir> [--remove]');
if (path.resolve(src) === path.resolve(out)) throw new Error('srcDir and outDir must differ (an ingested file would be simplified again and removed)');
const remove = process.argv.includes('--remove');
const cfg = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/env/targets.json'), 'utf8'));
mkdirSync(out, { recursive: true });
await MeshoptSimplifier.ready;
const io = new NodeIO();
const TRI_TARGET = 4500;
// keep the entries of earlier batches: the manifest lists every runtime file, not just this run's
const manifestPath = path.join(out, 'manifest.json');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).objects : {};
const results = [];
let failed = 0;

for (const f of readdirSync(src).filter((n) => n.endsWith('.glb'))) {
  const id = f.replace(/\.glb$/, '');
  const want = cfg.objects[id];
  if (!want) { console.log(`skip ${id}: no target in targets.json`); continue; }
  const doc = await io.read(path.join(src, f));
  const root = doc.getRoot();
  if (root.listSkins().length || root.listAnimations().length) { console.log(`FAIL ${id}: skinned or animated files are not supported (static scenery only)`); failed++; continue; }
  await doc.transform(flatten()); // bake node transforms into the scene graph's world matrices
  const scene = root.listScenes()[0];
  // apply world matrices to the vertex data, then clear the nodes' transforms
  // a mesh shared by several nodes would be transformed once per node: give each node its own copy first
  const seen = new Set();
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (mesh && seen.has(mesh)) node.setMesh(mesh.clone());
    if (mesh) seen.add(mesh);
  }
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (mesh) { transformMesh(mesh, node.getWorldMatrix()); node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  }
  let b = getBounds(scene);
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  // driver axis: height for upright things, the longest horizontal for wide things (hedges, logs)
  const wide = Math.max(want.w, want.d) > 1.8 * want.h;
  const s = wide ? Math.max(want.w, want.d) / Math.max(size[0], size[2]) : want.h / size[1];
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
  }
  b = getBounds(scene);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -cx, -b.min[1], -cz, 1]);
  }
  // simplify to the triangle budget
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  await doc.transform(weld({ tolerance: 0.0001 }));
  // the simplifier stops at an error bound, so step the bound up until the budget is met
  for (const error of [0.02, 0.05, 0.1, 0.2, 0.4]) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TRI_TARGET / tris), error }));
    let now = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) now += (p.getIndices()?.getCount() ?? 0) / 3;
    if (now <= cfg.maxTriangles) break;
  }
  await doc.transform(dedup(), prune());
  // keep the base colour only; flat roughness so the look stays KayKit-like
  for (const mat of root.listMaterials()) {
    mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
    mat.setMetallicFactor(0).setRoughnessFactor(1);
  }
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }), prune());
  let after = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += (p.getIndices()?.getCount() ?? 0) / 3;
  if (after > cfg.maxTriangles) { console.log(`FAIL ${id}: ${Math.round(after)} triangles after simplifying, budget ${cfg.maxTriangles}; source kept, nothing written`); failed++; continue; }
  const dest = path.join(out, f);
  await io.write(dest, doc);
  const mb = statSync(dest).size / 1e6;
  if (mb > cfg.maxFileMB) { console.log(`FAIL ${id}: ${mb.toFixed(2)} MB, budget ${cfg.maxFileMB} MB; source kept`); unlinkSync(dest); failed++; continue; }
  results.push({ id, scale: +s.toFixed(3), trisBefore: Math.round(tris), trisAfter: Math.round(after), mb: +mb.toFixed(2) });
  console.log(`${id}: scale ${s.toFixed(3)}, ${Math.round(tris)} -> ${Math.round(after)} tris, ${mb.toFixed(2)} MB`);
  if (remove) unlinkSync(path.join(src, f));
}
writeFileSync(manifestPath, JSON.stringify({ $comment: 'Written by tools/env-pass/ingest.mjs. Runtime copies of environment objects: size in metres (w, d, h), pivot at the base centre, front +Z.', objects: { ...previous, ...Object.fromEntries(results.map((r) => [r.id, r])) } }, null, 1));
console.log(`${results.length} files written to ${out}${remove ? ' (sources removed)' : ''}${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
