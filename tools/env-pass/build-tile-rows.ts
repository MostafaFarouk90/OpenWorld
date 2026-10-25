// Turns a designer's placement file into the runtime rows of a tile:
//   npx vite-node tools/env-pass/build-tile-rows.ts <in.json> <out.json> [--annex <annex.json>]...
// Only rows inside the file's own `core` ([x0, x1] by [z0, z1]) are kept: band rows are for the blend preview and belong to the neighbour tile.
// An annex file (a site a ruling gave to this tile wholesale, e.g. B3's reed island) has no core: all its rows are kept.
// Keeps id, x, z, yaw, scale, and drops rows that sit inside a built structure's footprint (with a margin) or on top of an
// anchor, using the real layout geometry of every Brightwater layout (village, corridor, density); ground cover (grass, flowers)
// may sit under anchors. Prints what it dropped.
import { readFileSync, writeFileSync } from 'node:fs';
import { filterTileRows, LAYOUT_SETS, type DesignerRow, type ReservedPad } from './tileRows';

// Optional extra rectangles the tile owns outside its core (a seam ruled to this tile): `--also x0,x1,z0,z1` (repeatable).
const args = process.argv.slice(2);
const also: Array<[number, number, number, number]> = [];
for (let i = args.indexOf('--also'); i >= 0; i = args.indexOf('--also')) also.push(args.splice(i, 2)[1]!.split(',').map(Number) as [number, number, number, number]);
const annexes: string[] = [];
for (let i = args.indexOf('--annex'); i >= 0; i = args.indexOf('--annex')) annexes.push(...args.splice(i, 2).slice(1));
// `--deck <file>`: a roof-deck annex (rows with `dy` standing on top of buildings, e.g. H3's Rooftop Ward). All its non-band rows are kept with
// their dy; the footprint and anchor drops are skipped (they would remove every roof row; the generator keeps them off the chase line).
const decks: string[] = [];
for (let i = args.indexOf('--deck'); i >= 0; i = args.indexOf('--deck')) decks.push(...args.splice(i, 2).slice(1));
// `--layout harrowmark` checks footprints and anchors against Harrowmark plus the Dead Road (default: Brightwater's layouts).
let layoutName = 'brightwater';
for (let i = args.indexOf('--layout'); i >= 0; i = args.indexOf('--layout')) layoutName = args.splice(i, 2)[1]!;
const layouts = LAYOUT_SETS[layoutName];
if (!layouts) throw new Error(`unknown layout ${layoutName}`);
const [inPath, outPath] = args;
if (!inPath || !outPath) throw new Error('usage: build-tile-rows.ts <in.json> <out.json> [--annex <annex.json>]... [--also x0,x1,z0,z1]...');
type DesignerFile = { core?: { x: [number, number]; z: [number, number] }; placements: DesignerRow[]; meta?: { reserved?: ReservedPad[] } };
const read = (p: string): DesignerFile => JSON.parse(readFileSync(p, 'utf8')) as DesignerFile;
const file = read(inPath);
if (!file.core) throw new Error(`${inPath} has no core`);
const main = filterTileRows(file.placements, file.core, also, file.meta?.reserved ?? [], layouts);
const extra = annexes.map((p) => ({ p, ...filterTileRows(read(p).placements) }));
const deckRows = decks.flatMap((p) => read(p).placements.filter((r) => !r.band).map(({ id, x, z, yaw, scale, dy }) => ({ id, x, z, yaw, scale, dy })));
const rows = [...main.rows, ...extra.flatMap((a) => a.rows), ...deckRows];
writeFileSync(outPath, JSON.stringify(rows));
console.log(`${main.rows.length} of ${file.placements.length} rows kept (${main.inCore} in the core)`, main.dropped);
if (deckRows.length) console.log(`deck: ${deckRows.length} rows with dy kept`);
for (const a of extra) console.log(`annex ${a.p}: ${a.rows.length} of ${a.inCore} rows kept`, a.dropped);
