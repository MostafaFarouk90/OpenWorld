import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { cinderreachAnchorsDoc } from './anchorsDoc';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';

describe('src/cinderreach/ANCHORS.md', () => {
  const doc = readFileSync('src/cinderreach/ANCHORS.md', 'utf8');

  it('matches the layout exactly (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(doc).toBe(cinderreachAnchorsDoc());
  });

  it('lists every anchor, trigger and structure id', () => {
    for (const a of CINDERREACH_LAYOUT.anchors) expect(doc).toContain(`| ${a.id} |`);
    for (const t of CINDERREACH_LAYOUT.triggers) expect(doc).toContain(`| ${t.id} |`);
    for (const s of CINDERREACH_LAYOUT.structures) expect(doc).toContain(`| ${s.id} |`);
  });
});
