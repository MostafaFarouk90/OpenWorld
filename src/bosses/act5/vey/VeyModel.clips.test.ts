import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VEY_CLIPS } from './VeyModel';

/** Every clip Vey plays must exist on the Knight rig (a missing one logs and freezes the pose in the real game). */
function clipNames(path: string): string[] {
  const b = readFileSync(path);
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as { animations?: { name: string }[] };
  return (json.animations ?? []).map((a) => a.name);
}

describe('Vey clips', () => {
  it('names only clips the Knight glb carries', () => {
    const names = new Set(clipNames('public/assets/kaykit-adventurers/characters/Knight.glb'));
    const missing = Object.values(VEY_CLIPS).filter((c) => !names.has(c));
    expect(missing).toEqual([]);
  });
});
