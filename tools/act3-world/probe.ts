// Bare-massif (or world with "world") height grid: npx vite-node tools/act3-world/probe.ts -- x0 x1 z0 z1 step [world]
import { buildShaper, type TerrainShape } from '../../src/terrain/shaping';
import { WORLD_SHAPE } from '../../src/terrain/shape';
import { DRAGONSPINE_PLATEAUS, DRAGONSPINE_ROADS } from '../../src/terrain/shape/dragonspine';
import { shapeBaseHeight, WORLD_SHAPER_OPTIONS } from './base';
const args = process.argv.slice(2).filter((a) => a !== '--');
const [x0, x1, z0, z1, step] = args.slice(0, 5).map(Number);
const ps = new Set(DRAGONSPINE_PLATEAUS);
const rs = new Set(DRAGONSPINE_ROADS);
const shape: TerrainShape = args.includes('world') ? WORLD_SHAPE : { ...WORLD_SHAPE, plateaus: WORLD_SHAPE.plateaus.filter((p) => !ps.has(p)), roads: WORLD_SHAPE.roads.filter((r) => !rs.has(r)) };
const s = buildShaper(shape, shapeBaseHeight, WORLD_SHAPER_OPTIONS);
let head = '   z\\x ';
for (let x = x0; x <= x1; x += step) head += String(x).padStart(6);
console.log(head);
for (let z = z1; z >= z0; z -= step) {
  let row = String(z).padStart(7);
  for (let x = x0; x <= x1; x += step) row += String(Math.round(s.heightAt(x, z))).padStart(6);
  console.log(row);
}
