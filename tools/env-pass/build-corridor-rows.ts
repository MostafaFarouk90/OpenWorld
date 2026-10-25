// Turns a Dead Road designer file (D1, D2 or D3) into the tile's runtime rows:
//   npx vite-node tools/env-pass/build-corridor-rows.ts <d1.placements.json> src/env/d1.placements.json
// Keeps only the rows the tile owns (`tile` equals the file's tile; band rows and the neighbour's rows are previews), rounds to the
// precision the game can show (1 cm, 1 degree, 3 digits of scale), and drops the notes. Patch rows (grass-patch-*) stay one row each:
// PlacementField expands them at load (src/env/patches.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { roadDistance } from '../../src/env/ashGradient';
import { classOf } from '../../src/env/PlacementField';
import { isPatch, PATCH_RADIUS } from '../../src/env/patches';
import { ROAD_WIDTH } from '../../src/region/deadRoad';

/**
 * Trees, rocks and logs stay this far from an eye camera's line (the camera, the Knight 4 m ahead of it and 10 m beyond): a trunk or a boulder
 * closer than that fills the frame (B4 round 3 lesson). Ground cover, bushes, hedges and props are not touched.
 */
const EYE_CLEAR = 8;
const EYE_AHEAD = 14;
 /** Tufts of a patch keep this far from the road's centre line beyond its half width (a clump is about 0.5 m across). */
const ROAD_CLEAR = 0.3;

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error('usage: build-corridor-rows.ts <in.json> <out.json>');
const file = JSON.parse(readFileSync(inPath, 'utf8')) as { tile: string; placements: Array<{ id: string; x: number; z: number; yaw?: number; scale?: number; tile?: string }> };
const cams = (JSON.parse(readFileSync(new URL('./cameras.json', import.meta.url), 'utf8')) as { tiles: Record<string, { cameras: Record<string, { pos: number[]; look: number[] }> }> }).tiles;
const eyes = Object.entries(cams)
  .filter(([k]) => /^d[123]-/.test(k) && cams[k]!.cameras.eye)
  .map(([, v]) => v.cameras.eye!);
const nearEye = (x: number, z: number, clear = EYE_CLEAR): boolean =>
  eyes.some((e) => {
    const [px, , pz] = e.pos as [number, number, number];
    const dx = e.look[0]! - px;
    const dz = e.look[2]! - pz;
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.min(EYE_AHEAD, Math.max(0, ((x - px) * dx + (z - pz) * dz) / len));
    return Math.hypot(x - (px + (dx / len) * t), z - (pz + (dz / len) * t)) < clear;
  });
const bigThing = (id: string): boolean => classOf(id) === 'tree' || classOf(id) === 'rock' || classOf(id) === 'wood';
/** Trees are cleared by canopy radius (an oak crown is up to 7 m across from its trunk), not by trunk. */
const TREE_CLEAR = 15;
/** A hedge run this close to the line of an eye camera (the verge shots stand between road and hedge) fills the frame. */
const HEDGE_CLEAR = 3;
/** A bush (not a fern) this close to an eye camera's line stands in the Knight's lap (d1-gate: a grey bush ball 1 m ahead of him). */
const BUSH_CLEAR = 4;
const rows = file.placements
  .filter((r) => r.tile === file.tile)
  .filter((r) => !(bigThing(r.id) && nearEye(r.x, r.z, classOf(r.id) === 'tree' ? TREE_CLEAR : EYE_CLEAR)))
  .filter((r) => !(classOf(r.id) === 'hedge' && nearEye(r.x, r.z, HEDGE_CLEAR)))
  .filter((r) => !(classOf(r.id) === 'bush' && !r.id.startsWith('fern') && nearEye(r.x, r.z, BUSH_CLEAR)))
  .map((r) => {
    const out: { id: string; x: number; z: number; yaw?: number; scale?: number } = { id: r.id, x: Math.round(r.x * 100) / 100, z: Math.round(r.z * 100) / 100 };
    if (r.yaw) out.yaw = Math.round(r.yaw);
    if (r.scale !== undefined && r.scale !== 1) out.scale = Math.round(r.scale * 1000) / 1000;
    // A patch beside the road gets a narrower spread so none of its tufts lands on the ribbon.
    if (isPatch(r.id)) {
      const room = roadDistance(r.x, r.z) - ROAD_WIDTH / 2 - ROAD_CLEAR;
      const spread = PATCH_RADIUS * (r.scale ?? 1);
      if (room < spread) (out as { spread?: number }).spread = Math.max(0.1, Math.round(room * 100) / 100);
    }
    return out;
  });
writeFileSync(outPath, JSON.stringify(rows));
console.log(`${file.tile}: ${rows.length} of ${file.placements.length} rows kept`);
