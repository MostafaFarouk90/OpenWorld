// Checks uploaded or scripted .glb/.gltf environment objects against src/env/targets.json.
// Usage: node tools/env-pass/check-glb.mjs <dir-or-file> [more ...]   (file name without extension is the object id)
// Reports measured world-space size (node transforms applied), triangle count and file size against the budgets in targets.json,
// the pivot (base should sit at y 0 and the footprint centre near x 0, z 0) and the size verdict. Exit 1 on any problem.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(here, '../../src/env/targets.json'), 'utf8'));

function gltfJson(file) {
  const buf = readFileSync(file);
  if (file.endsWith('.gltf')) return JSON.parse(buf.toString('utf8'));
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

// Column-major 4x4 from a node's matrix or translation/rotation/scale.
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};

// World-space bounds of every mesh in the default scene (node transforms applied, so a Z-up export that a node rotates upright reads as upright).
function bounds(g) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const visit = (i, parent) => {
    const n = g.nodes[i];
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined)
      for (const p of g.meshes[n.mesh].primitives) {
        const a = g.accessors[p.attributes.POSITION];
        for (let k = 0; k < 8; k++) {
          const v = [k & 1 ? a.max[0] : a.min[0], k & 2 ? a.max[1] : a.min[1], k & 4 ? a.max[2] : a.min[2]];
          for (let ax = 0; ax < 3; ax++) {
            const t = m[ax] * v[0] + m[4 + ax] * v[1] + m[8 + ax] * v[2] + m[12 + ax];
            lo[ax] = Math.min(lo[ax], t);
            hi[ax] = Math.max(hi[ax], t);
          }
        }
      }
    for (const c of n.children ?? []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of g.scenes[g.scene ?? 0].nodes) visit(r, I);
  return { lo, hi };
}

function stats(g, file) {
  let tris = 0;
  for (const m of g.meshes ?? []) for (const p of m.primitives) if (p.indices !== undefined) tris += g.accessors[p.indices].count / 3;
  return { tris, images: (g.images ?? []).length, mb: statSync(file).size / 1e6 };
}

const files = [];
for (const arg of process.argv.slice(2)) {
  if (statSync(arg).isDirectory()) for (const f of readdirSync(arg)) { if (/\.(glb|gltf)$/.test(f)) files.push(path.join(arg, f)); }
  else files.push(arg);
}
let bad = 0;
for (const f of files) {
  const id = path.basename(f).replace(/\.(glb|gltf)$/, '');
  const want = cfg.objects[id];
  try {
    const gj = gltfJson(f);
    const { lo, hi } = bounds(gj);
    const st = stats(gj, f);
    const size = { w: hi[0] - lo[0], d: hi[2] - lo[2], h: hi[1] - lo[1] };
    const problems = [];
    if (st.tris > cfg.maxTriangles) problems.push(`${Math.round(st.tris)} triangles, budget ${cfg.maxTriangles}`);
    if (st.mb > cfg.maxFileMB) problems.push(`file ${st.mb.toFixed(1)} MB, budget ${cfg.maxFileMB} MB`);
    if (!want) problems.push('no target in src/env/targets.json');
    else {
      // Driver axis (height, or the longest side for wide things) must match the target; the other axes are the artist's proportions
      // and only fail beyond a generous band (the targets' proportions are guesses for generated objects).
      const wide = Math.max(want.w, want.d) > 1.8 * want.h;
      if (wide) {
        const got = Math.max(size.w, size.d), tgt = Math.max(want.w, want.d), dev = (got - tgt) / tgt;
        if (Math.abs(dev) > cfg.tolerance) problems.push(`longest side ${got.toFixed(2)} m, want ${tgt} m (${Math.round(dev * 100)}%)`);
      }
      for (const [k, name] of [['w', 'width'], ['d', 'depth'], ['h', 'height']]) {
        const dev = (size[k] - want[k]) / want[k];
        const driver = !wide && k === 'h';
        if (Math.abs(dev) > (driver ? cfg.tolerance : cfg.proportionTolerance)) problems.push(`${name} ${size[k].toFixed(2)} m, want ${want[k]} m (${Math.round(dev * 100)}%)`);
      }
    }
    if (Math.abs(lo[1]) > 0.05) problems.push(`pivot: base at y ${lo[1].toFixed(2)}, want 0`);
    const cx = (lo[0] + hi[0]) / 2;
    const cz = (lo[2] + hi[2]) / 2;
    if (Math.hypot(cx, cz) > 0.1 * Math.max(size.w, size.d)) problems.push(`pivot: footprint centre at (${cx.toFixed(2)}, ${cz.toFixed(2)}), want about 0, 0`);
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${id}  ${size.w.toFixed(2)} x ${size.d.toFixed(2)} x ${size.h.toFixed(2)} m${problems.length ? '  ' + problems.join('; ') : ''}`);
    if (problems.length) bad++;
  } catch (e) {
    console.log(`FAIL ${id}  ${e.message}`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
