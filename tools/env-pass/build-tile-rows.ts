// Turns a designer's placement file into the runtime rows of a tile:
//   npx vite-node tools/env-pass/build-tile-rows.ts <in.json> <out.json> [--annex <annex.json>]...
// Only rows inside the file's own `core` ([x0, x1] by [z0, z1]) are kept: band rows are for the blend preview and belong to the neighbour tile.
// An annex file (a site a ruling gave to this tile wholesale, e.g. B3's reed island) has no core: all its rows are kept.
// Keeps id, x, z, yaw, scale, and drops rows that sit inside a built structure's footprint (with a margin) or on top of an
// anchor, using the real layout geometry of every Brightwater layout (village, corridor, density); ground cover (grass, flowers)
// may sit under anchors. Prints what it dropped.
import { readFileSync, writeFileSync } from 'node:fs';
import { filterTileRows, type DesignerRow } from './tileRows';

const args = process.argv.slice(2);
const annexes: string[] = [];
for (let i = args.indexOf('--annex'); i >= 0; i = args.indexOf('--annex')) annexes.push(...args.splice(i, 2).slice(1));
const [inPath, outPath] = args;
if (!inPath || !outPath) throw new Error('usage: build-tile-rows.ts <in.json> <out.json> [--annex <annex.json>]...');
type DesignerFile = { core?: { x: [number, number]; z: [number, number] }; placements: DesignerRow[] };
const read = (p: string): DesignerFile => JSON.parse(readFileSync(p, 'utf8')) as DesignerFile;
const file = read(inPath);
if (!file.core) throw new Error(`${inPath} has no core`);
const main = filterTileRows(file.placements, file.core);
const extra = annexes.map((p) => ({ p, ...filterTileRows(read(p).placements) }));
const rows = [...main.rows, ...extra.flatMap((a) => a.rows)];
writeFileSync(outPath, JSON.stringify(rows));
console.log(`${main.rows.length} of ${file.placements.length} rows kept (${main.inCore} in the core)`, main.dropped);
for (const a of extra) console.log(`annex ${a.p}: ${a.rows.length} of ${a.inCore} rows kept`, a.dropped);
