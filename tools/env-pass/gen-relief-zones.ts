// Regenerates the keep-flat table of the Brightwater detail relief: `npx vite-node tools/env-pass/gen-relief-zones.ts`.
import { writeFileSync } from 'node:fs';
import { BRIGHTWATER_LAYOUT } from '../../src/region/brightwater.layout';
import { buildReliefZones, renderReliefZones } from '../../src/terrain/shape/reliefZonesBuild';

const zones = buildReliefZones(BRIGHTWATER_LAYOUT);
writeFileSync(new URL('../../src/terrain/shape/detailReliefZones.ts', import.meta.url), renderReliefZones(zones));
console.log(`${zones.length} zones`);
