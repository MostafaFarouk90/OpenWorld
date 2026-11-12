// Act 5 N1 PR 2: section V of docs/env/environment-needs-prompts.md, rendered from the catalogue (calderaEnvIds.ts) so the list
// Mostafa works from and the ids the game asks for cannot drift (calderaEnv.test.ts compares the doc with this).
import { CALDERA_ENV_IDS, type CalderaEnvId } from './calderaEnvIds';

export const SECTION_V_HEADING = '## V. Act 5 the Sunforge Caldera (added 2026-11-11 by Act 5 N1 PR 2, the environment pass; scripted stand-ins and greybox until these arrive)';

const fmt = (n: number): string => String(n);
const standIn = (e: CalderaEnvId): string =>
  e.use === 'structure' ? 'greybox box with its collider (`caldera.layout.ts`)' : 'scripted stand-in `public/assets/env-standin/' + e.id + '.glb`';
const line = (e: CalderaEnvId): string => `| ${e.id} | ${e.prompt.replace(/\|/g, '/')} | ${e.where.replace(/\|/g, '/')} | ${standIn(e)} | ${fmt(e.w)} x ${fmt(e.d)} x ${fmt(e.h)} |`;

export function renderSectionV(): string {
  const part = (use: CalderaEnvId['use']) => CALDERA_ENV_IDS.filter((e) => e.use === use).map(line);
  return [
    SECTION_V_HEADING,
    'Each id is one file under public/assets/env (Y up, 1 unit = 1 m, base-centre pivot, lowest point y = 0, front +Z, no baked rotation), authored at the size in the last column (src/env/targets.json has every one). Dropping the file in and ingesting it into the manifest swaps it in with no placement change: the dressing rows of tile c1 (src/caldera/env/calderaEnv.ts) resolve the real file before the stand-in, and the structures draw it by their layout id (src/caldera/env/calderaArt.ts). Emissive parts must be separate materials named as the prompt says (Fire flickers like a flame, Glow like embers). Reused without new art: brazier-standing-a, slag-heap, ore-pile, mine-cart, smelter-chimney, coal-heap-a, basalt-columns-a and the KayKit crates and barrels.',
    '',
    '### V1. Dressing (placed now, as scripted stand-ins)',
    '',
    '| id | prompt | where (count) | now | size (m, W x D x H) |',
    '| --- | --- | --- | --- | --- |',
    ...part('row'),
    '',
    '### V2. Rim Camp, Rim Gate and Inner Gate structures (greybox now)',
    '',
    '| id | prompt | where (count) | now | size (m, W x D x H) |',
    '| --- | --- | --- | --- | --- |',
    ...part('structure'),
    '',
    '### V3. The Anvil island and the Lava Stair (placed by code, as scripted stand-ins)',
    '',
    '| id | prompt | where (count) | now | size (m, W x D x H) |',
    '| --- | --- | --- | --- | --- |',
    ...part('piece'),
    '',
  ].join('\n');
}
