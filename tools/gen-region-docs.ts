// Regenerates the anchor docs from the layout tables: `npx vite-node tools/gen-region-docs.ts`.
import { writeFileSync } from 'node:fs';
import { harrowmarkAnchorsDoc } from '../src/harrowmark/anchorsDoc';
import { renderAnchorsDoc } from '../src/region/anchorsDoc';

writeFileSync(new URL('../src/region/ANCHORS.md', import.meta.url), renderAnchorsDoc());
writeFileSync(new URL('../src/harrowmark/ANCHORS.md', import.meta.url), harrowmarkAnchorsDoc());
