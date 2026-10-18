import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { harrowmarkAnchorsDoc } from './anchorsDoc';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';

describe('src/harrowmark/ANCHORS.md', () => {
  const doc = readFileSync('src/harrowmark/ANCHORS.md', 'utf8');

  it('matches the layout exactly (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(doc).toBe(harrowmarkAnchorsDoc());
  });

  it('lists every anchor, trigger and structure id', () => {
    for (const a of HARROWMARK_LAYOUT.anchors) expect(doc).toContain(`| ${a.id} |`);
    for (const t of HARROWMARK_LAYOUT.triggers) expect(doc).toContain(`| ${t.id} |`);
    for (const s of HARROWMARK_LAYOUT.structures) expect(doc).toContain(`| ${s.id} |`);
  });
});
