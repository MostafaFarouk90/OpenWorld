// Regenerates the anchor docs from the layout tables: `npx vite-node tools/gen-region-docs.ts`.
import { writeFileSync } from 'node:fs';
import { harrowmarkAnchorsDoc } from '../src/harrowmark/anchorsDoc';
import { renderAnchorsDoc } from '../src/region/anchorsDoc';
import { DEADROAD_DOC, DEADROAD_LAYOUT } from '../src/region/deadroad.layout';
import { ACT2_WORLD_DOC, ACT2_WORLD_LAYOUT } from '../src/region/act2/act2World.layout';

writeFileSync(new URL('../src/region/ANCHORS.md', import.meta.url), renderAnchorsDoc());
writeFileSync(new URL('../src/harrowmark/ANCHORS.md', import.meta.url), harrowmarkAnchorsDoc());
writeFileSync(new URL('../src/region/DEADROAD_ANCHORS.md', import.meta.url), renderAnchorsDoc(DEADROAD_LAYOUT, DEADROAD_DOC));
writeFileSync(new URL('../src/region/act2/ACT2_WORLD_ANCHORS.md', import.meta.url), renderAnchorsDoc(ACT2_WORLD_LAYOUT, ACT2_WORLD_DOC));
