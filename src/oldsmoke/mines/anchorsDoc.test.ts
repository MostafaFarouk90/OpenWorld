import { describe, expect, it } from 'vitest';
import { readFileSync } from '../../region/testing/nodeFs';
import { minesAnchorsDoc } from './anchorsDoc';

describe('src/oldsmoke/mines/ANCHORS.md', () => {
  it('matches the defs exactly (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/oldsmoke/mines/ANCHORS.md', 'utf8')).toBe(minesAnchorsDoc());
  });
});
