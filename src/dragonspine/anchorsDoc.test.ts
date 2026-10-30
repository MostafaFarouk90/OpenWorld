import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { dragonspineAnchorsDoc } from './anchorsDoc';
import { DRAGONSPINE_LAYOUT } from './dragonspine.layout';

describe('src/dragonspine/ANCHORS.md', () => {
  const doc = readFileSync('src/dragonspine/ANCHORS.md', 'utf8');

  it('matches the layout exactly (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(doc).toBe(dragonspineAnchorsDoc());
  });

  it('lists every anchor, trigger and structure id', () => {
    for (const a of DRAGONSPINE_LAYOUT.anchors) expect(doc).toContain(`| ${a.id} |`);
    for (const t of DRAGONSPINE_LAYOUT.triggers) expect(doc).toContain(`| ${t.id} |`);
    for (const s of DRAGONSPINE_LAYOUT.structures) expect(doc).toContain(`| ${s.id} |`);
  });
});
