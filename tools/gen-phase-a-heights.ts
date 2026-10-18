// Regenerates src/terrain/__fixtures__/phase-a-anchor-heights.json: the terrain height under every anchor of the
// Brightwater layout, keyed by anchor id. Run at the slice2-phase-a tag: `npx vite-node tools/gen-phase-a-heights.ts`.
// Natural (unshaped) ground, so the fixture never just echoes the shaping it guards. The regression test (heightfield.phaseA.test.ts) then pins that terrain shaping never moves them.
import { writeFileSync } from 'node:fs';
import { BRIGHTWATER_LAYOUT } from '../src/region/brightwater.layout';
import { naturalHeightAt } from '../src/terrain/heightfield';

const out: Record<string, number> = {};
for (const a of [...BRIGHTWATER_LAYOUT.anchors].sort((p, q) => p.id.localeCompare(q.id))) out[a.id] = naturalHeightAt(a.x, a.z);
writeFileSync('src/terrain/__fixtures__/phase-a-anchor-heights.json', JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${Object.keys(out).length} anchor heights`);
