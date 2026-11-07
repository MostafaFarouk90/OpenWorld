import { describe, expect, it } from 'vitest';
import { ULTHRED_CLIPS } from './UlthredModel';

type Fs = { readFileSync(p: string): Uint8Array };

/** Every clip Ulthred plays must exist on the Barbarian rig (a missing one logs and freezes the pose in the real game). */
async function clipNames(path: string): Promise<string[]> {
  // node:fs through a variable, as diskSource does: the tsconfig carries no node types.
  const fsModule = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsModule)) as unknown as Fs;
  const b = fs.readFileSync(path);
  const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as { animations?: { name: string }[] };
  return (json.animations ?? []).map((a) => a.name);
}

describe('Ulthred clips', () => {
  it('names only clips the Barbarian glb carries', async () => {
    const names = new Set(await clipNames('public/assets/kaykit-adventurers/characters/Barbarian.glb'));
    const missing = Object.values(ULTHRED_CLIPS).filter((c) => !names.has(c));
    expect(missing).toEqual([]);
  });
});
