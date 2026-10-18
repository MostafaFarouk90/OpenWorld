import { readFileSync } from './testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { renderAnchorsDoc } from './anchorsDoc';

describe('ANCHORS.md', () => {
  const doc = readFileSync('src/region/ANCHORS.md', 'utf8');

  it('matches the layout table exactly (regenerate with tools/gen-region-docs.ts)', () => {
    expect(doc).toBe(renderAnchorsDoc());
  });

  it('lists every anchor and trigger id', () => {
    for (const a of BRIGHTWATER_LAYOUT.anchors) expect(doc).toContain(`| ${a.id} |`);
    for (const t of BRIGHTWATER_LAYOUT.triggers) expect(doc).toContain(`| ${t.id} |`);
  });

  it('renders an empty layout without throwing', () => {
    const empty = renderAnchorsDoc({ anchors: [], triggers: [], structures: [], patrols: [], npcs: [], fields: [] });
    expect(empty).toContain('## Anchors');
  });
});
