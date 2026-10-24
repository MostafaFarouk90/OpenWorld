import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { greyfenAnchorsDoc } from './anchorsDoc';
import { GREYFEN_LAYOUT } from './greyfen.layout';

describe('src/greyfen/ANCHORS.md', () => {
  const doc = readFileSync('src/greyfen/ANCHORS.md', 'utf8');

  it('matches the layout exactly (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(doc).toBe(greyfenAnchorsDoc());
  });

  it('lists every anchor, trigger and structure id', () => {
    for (const a of GREYFEN_LAYOUT.anchors) expect(doc).toContain(`| ${a.id} |`);
    for (const t of GREYFEN_LAYOUT.triggers) expect(doc).toContain(`| ${t.id} |`);
    for (const s of GREYFEN_LAYOUT.structures) expect(doc).toContain(`| ${s.id} |`);
  });
});
