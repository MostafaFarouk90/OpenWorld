import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { oldsmokeAnchorsDoc } from './anchorsDoc';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';

describe('src/oldsmoke/ANCHORS.md', () => {
  const doc = readFileSync('src/oldsmoke/ANCHORS.md', 'utf8');

  it('matches the layout exactly (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(doc).toBe(oldsmokeAnchorsDoc());
  });

  it('lists every anchor, trigger and structure id', () => {
    for (const a of OLDSMOKE_LAYOUT.anchors) expect(doc).toContain(`| ${a.id} |`);
    for (const t of OLDSMOKE_LAYOUT.triggers) expect(doc).toContain(`| ${t.id} |`);
    for (const s of OLDSMOKE_LAYOUT.structures) expect(doc).toContain(`| ${s.id} |`);
  });
});
