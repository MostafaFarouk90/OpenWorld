// Regenerates src/region/ANCHORS.md from the layout table: `npx vite-node tools/gen-region-docs.ts`.
import { writeFileSync } from 'node:fs';
import { renderAnchorsDoc } from '../src/region/anchorsDoc';

writeFileSync(new URL('../src/region/ANCHORS.md', import.meta.url), renderAnchorsDoc());
