// Regenerates the anchor docs from the layout tables: `npx vite-node tools/gen-region-docs.ts`.
import { writeFileSync } from 'node:fs';
import { harrowmarkAnchorsDoc } from '../src/harrowmark/anchorsDoc';
import { renderAnchorsDoc } from '../src/region/anchorsDoc';
import { DEADROAD_DOC, DEADROAD_LAYOUT } from '../src/region/deadroad.layout';

writeFileSync(new URL('../src/region/ANCHORS.md', import.meta.url), renderAnchorsDoc());
writeFileSync(new URL('../src/harrowmark/ANCHORS.md', import.meta.url), harrowmarkAnchorsDoc());
writeFileSync(new URL('../src/region/DEADROAD_ANCHORS.md', import.meta.url), renderAnchorsDoc(DEADROAD_LAYOUT, DEADROAD_DOC));
