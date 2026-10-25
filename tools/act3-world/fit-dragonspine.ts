// Act 3 K1: the Dragonspine fit report. npx vite-node tools/act3-world/fit-dragonspine.ts [-- grid]
// Prints the ground the plateaus sit on (before and after), every road's length, grade, cut and bank slope, and the
// region's height range; with "grid" also writes a 10 m height grid for tools/act3-world/hillshade.py.
import { writeFileSync } from 'node:fs';
import { buildShaper, type PlateauDef, type RoadDef, type TerrainShape } from '../../src/terrain/shaping';
import { shapeBaseHeight, WORLD_SHAPER_OPTIONS } from './base';
import { WORLD_SHAPE } from '../../src/terrain/shape';
import { ACT3_PROTECTED_BOXES } from '../../src/terrain/shape/act3';
import { DRAGONSPINE_PLATEAUS, DRAGONSPINE_ROADS } from '../../src/terrain/shape/dragonspine';

const f1 = (n: number) => n.toFixed(1);
const dsPlateaus = new Set<PlateauDef>(DRAGONSPINE_PLATEAUS);
const dsRoads = new Set<RoadDef>(DRAGONSPINE_ROADS);
const opts = { ...WORLD_SHAPER_OPTIONS };
const bareShape: TerrainShape = { ...WORLD_SHAPE, plateaus: WORLD_SHAPE.plateaus.filter((p) => !dsPlateaus.has(p)), roads: WORLD_SHAPE.roads.filter((r) => !dsRoads.has(r)) };
const bare = buildShaper(bareShape, shapeBaseHeight, opts);

console.log('== plateaus on the bare massif (no Dragonspine plateaus or roads)');
for (const p of DRAGONSPINE_PLATEAUS) {
  const b = p.box;
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = b.minX; x <= b.maxX; x += 5) for (let z = b.minZ; z <= b.maxZ; z += 5) {
    const h = bare.heightAt(x, z);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  let worst = 0;
  let sum = 0;
  let n = 0;
  const r = { minX: b.minX - p.blend, maxX: b.maxX + p.blend, minZ: b.minZ - p.blend, maxZ: b.maxZ + p.blend };
  const visit = (x: number, z: number) => {
    const h = bare.heightAt(x, z);
    worst = Math.max(worst, Math.abs(p.height - h) / p.blend);
    sum += h;
    n++;
  };
  for (let x = r.minX; x <= r.maxX; x += 25) { visit(x, r.minZ); visit(x, r.maxZ); }
  for (let z = r.minZ; z <= r.maxZ; z += 25) { visit(r.minX, z); visit(r.maxX, z); }
  const slopeFor = (blend: number) => {
    let w = 0;
    const q = { minX: b.minX - blend, maxX: b.maxX + blend, minZ: b.minZ - blend, maxZ: b.maxZ + blend };
    for (let x = q.minX; x <= q.maxX; x += 25) w = Math.max(w, Math.abs(p.height - bare.heightAt(x, q.minZ)), Math.abs(p.height - bare.heightAt(x, q.maxZ)));
    for (let z = q.minZ; z <= q.maxZ; z += 25) w = Math.max(w, Math.abs(p.height - bare.heightAt(q.minX, z)), Math.abs(p.height - bare.heightAt(q.maxX, z)));
    return w / blend;
  };
  const okBlend = [30, 40, 60, 80, 100, 150, 200, 300].map((bl) => `${bl}:${slopeFor(bl).toFixed(2)}`).join(' ');
  console.log(`${p.id.padEnd(18)} h ${p.height} blend ${p.blend} (min ok ${okBlend})  box ground ${f1(lo)}..${f1(hi)}  ring mean ${f1(sum / n)}  ring slope ${worst.toFixed(2)}${worst > 0.5 ? '  FAIL' : ''}`);
}

function writeGrid(H: (x: number, z: number) => number): void {
  const x0 = 9000, x1 = 18000, z0 = 10000, z1 = 17000, step = 10;
  const nx = (x1 - x0) / step + 1;
  const nz = (z1 - z0) / step + 1;
  const buf = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) buf[j * nx + i] = H(x0 + i * step, z1 - j * step);
  writeFileSync('tools/act3-world/grid.f32', Buffer.from(buf.buffer));
  writeFileSync('tools/act3-world/grid.json', JSON.stringify({ x0, x1, z0, z1, step, nx, nz }));
  console.log(`grid ${nx} x ${nz} written`);
}


let full;
try {
  full = buildShaper(WORLD_SHAPE, shapeBaseHeight, opts);
} catch (e) {
  console.log(`\nWORLD SHAPE FAILS: ${(e as Error).message}`);
  if (process.argv.includes('grid')) writeGrid((x, z) => bare.heightAt(x, z));
  process.exit(0);
}
const unroaded = buildShaper({ ...WORLD_SHAPE, roads: WORLD_SHAPE.roads.filter((r) => !dsRoads.has(r)) }, shapeBaseHeight, opts);
const H = (x: number, z: number) => full.heightAt(x, z);
if (process.argv.includes('grid')) writeGrid(H);

console.log('\n== plateaus in the world');
for (const p of DRAGONSPINE_PLATEAUS) {
  const b = p.box;
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = b.minX; x <= b.maxX; x += 2) for (let z = b.minZ; z <= b.maxZ; z += 2) {
    const h = H(x, z);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  console.log(`${p.id.padEnd(18)} centre ${f1(H((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2))}  range ${f1(lo)}..${f1(hi)}`);
}

console.log('\n== roads');
for (const r of DRAGONSPINE_ROADS) {
  const len = full.roadLength(r.id);
  let grade = 0;
  for (let s = 0; s + 5 <= len; s += 5) grade = Math.max(grade, Math.abs(full.roadProfile(r.id, s + 5) - full.roadProfile(r.id, s)) / 5);
  // Cut and fill against the ground without the Dragonspine roads, and the steepest bank within 6 m of the road edge.
  let cut = 0;
  let cutAt = '';
  let bank = 0;
  let bankAt = '';
  let arc = 0;
  for (let i = 0; i < r.points.length - 1; i++) {
    const a = r.points[i];
    const b = r.points[i + 1];
    const sl = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / sl;
    const dz = (b.z - a.z) / sl;
    for (let t = 0; t < sl; t += 10) {
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const c = Math.abs(full.roadProfile(r.id, arc + t) - unroaded.heightAt(x, z));
      if (c > cut) { cut = c; cutAt = `s ${Math.round(arc + t)} (${Math.round(x)}, ${Math.round(z)})`; }
      if (t < 30 || t > sl - 30) continue; // bends: the neighbour leg's bank
      for (const side of [1, -1]) {
        for (let o = r.halfWidth; o < r.halfWidth + 6; o += 1) {
          const h0 = H(x - dz * side * o, z + dx * side * o);
          const h1 = H(x - dz * side * (o + 1), z + dx * side * (o + 1));
          const s = Math.abs(h1 - h0);
          if (s > bank) { bank = s; bankAt = `s ${Math.round(arc + t)}`; }
        }
      }
    }
    arc += sl;
  }
  console.log(`${r.id.padEnd(15)} length ${Math.round(len)}  grade ${(grade * 100).toFixed(2)}%  ends ${f1(full.roadProfile(r.id, 0))} -> ${f1(full.roadProfile(r.id, len))}  worst cut/fill ${f1(cut)} at ${cutAt}  bank<=6m ${(Math.atan(bank) * 180 / Math.PI).toFixed(0)} deg at ${bankAt}`);
}
// Spine Road clearance from the Waste box (x 7000..15000, z <= 11000).
{
  let minGap = Infinity;
  const pts = DRAGONSPINE_ROADS[0].points;
  for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t <= 1; t += 0.01) {
    const x = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
    const z = pts[i].z + (pts[i + 1].z - pts[i].z) * t;
    const dx = x < 7000 ? 7000 - x : x > 15000 ? x - 15000 : 0;
    const dz = z > 11000 ? z - 11000 : 0;
    minGap = Math.min(minGap, Math.hypot(dx, dz));
  }
  console.log(`spine-road gap to the Waste box ${f1(minGap)} m`);
}

console.log('\n== region (x 9400..17600, z 10400..17000, protected boxes excluded), 25 m grid');
const inProtected = (x: number, z: number) => ACT3_PROTECTED_BOXES.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
let max = -Infinity;
let maxAt = '';
let min = Infinity;
let minAt = '';
for (let x = 9400; x <= 17600; x += 25) for (let z = 10400; z <= 17000; z += 25) {
  if (inProtected(x, z)) continue;
  const h = H(x, z);
  if (h > max) { max = h; maxAt = `(${x}, ${z})`; }
  if (h < min) { min = h; minAt = `(${x}, ${z})`; }
}
console.log(`max ${f1(max)} at ${maxAt}, min ${f1(min)} at ${minAt}`);
const probe: [string, number, number][] = [
  ['chasm floor (14750, 16000)', 14750, 16000],
  ['chasm west rim (14400, 16000)', 14400, 16000],
  ['chasm east rim (15100, 16000)', 15100, 16000],
  ['frostfang waystone', 15600, 15950],
  ['hawk foot north edge +0', 11400, 13030],
  ['hawk +40', 11400, 13070],
  ['hawk +60', 11400, 13090],
  ['hawk +80', 11400, 13110],
  ['hawk +100', 11400, 13130],
  ['skyhold west 150', 12000, 15200],
  ['skyhold west 300', 11850, 15200],
  ['skyhold north 150', 12200, 15400],
  ['skyhold north 300', 12200, 15550],
  ['seam (17000, 11300)', 17000, 11300],
];
for (const [label, x, z] of probe) console.log(`${label.padEnd(32)} ${f1(H(x, z))}`);


const dump = process.argv.find((a) => a.startsWith('road='));
if (dump) {
  const r = DRAGONSPINE_ROADS.find((q) => q.id === dump.slice(5))!;
  let arc = 0;
  for (let i = 0; i < r.points.length - 1; i++) {
    const a = r.points[i];
    const b = r.points[i + 1];
    const sl = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t < sl; t += 50) {
      const x = a.x + ((b.x - a.x) * t) / sl;
      const z = a.z + ((b.z - a.z) * t) / sl;
      console.log(`seg ${i} s ${Math.round(arc + t)} (${Math.round(x)}, ${Math.round(z)}) road ${f1(full.roadProfile(r.id, arc + t))} ground ${f1(unroaded.heightAt(x, z))}`);
    }
    arc += sl;
  }
}
