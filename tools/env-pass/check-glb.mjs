// Checks uploaded or scripted .glb/.gltf environment objects against src/env/targets.json.
// Usage: node tools/env-pass/check-glb.mjs <dir-or-file> [more ...]   (file name without extension is the object id)
// Reports measured size (from the POSITION accessor bounds, node transforms ignored: authored meshes are expected to be baked),
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

function bounds(g) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes ?? [])
    for (const p of m.primitives) {
      const a = g.accessors[p.attributes.POSITION];
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], a.min[i]);
        hi[i] = Math.max(hi[i], a.max[i]);
      }
    }
  return { lo, hi };
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
    const { lo, hi } = bounds(gltfJson(f));
    const size = { w: hi[0] - lo[0], d: hi[2] - lo[2], h: hi[1] - lo[1] };
    const problems = [];
    if (!want) problems.push('no target in src/env/targets.json');
    else
      for (const [k, name] of [['w', 'width'], ['d', 'depth'], ['h', 'height']]) {
        const dev = (size[k] - want[k]) / want[k];
        if (Math.abs(dev) > cfg.tolerance) problems.push(`${name} ${size[k].toFixed(2)} m, want ${want[k]} m (${Math.round(dev * 100)}%)`);
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
