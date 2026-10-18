import { readFileSync } from './testing/nodeFs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ASSETS, validateManifest } from '../assets/AssetManifest';

const FILES = { barbarian: 'Barbarian', mage: 'Mage', rogue: 'Rogue', rogueHooded: 'Rogue_Hooded', knight: 'Knight' } as const;
const path = (name: string) => `public/assets/kaykit-adventurers/characters/${name}.glb`;

async function parse(name: string) {
  (globalThis as any).self ??= globalThis;
  const file = readFileSync(path(name));
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
}

describe('NPC character assets', () => {
  it('registers the four NPC models in a valid manifest', () => {
    expect(validateManifest(ASSETS)).toEqual([]);
    for (const id of ['barbarian', 'mage', 'rogue', 'rogueHooded'] as const) {
      expect(ASSETS[id].url).toContain('/characters/');
      expect(ASSETS[id].kind).toBe('character');
    }
  });

  it('keeps the four GLBs on disk as binary glTF', () => {
    for (const name of Object.values(FILES)) {
      const head = readFileSync(path(name)).subarray(0, 4).toString('ascii');
      expect(head, name).toBe('glTF');
    }
  });

  it('the NPC models share the Knight rig and animation set', async () => {
    const knight = await parse('Knight');
    const knightClips = new Set(knight.animations.map((c: any) => c.name));
    const knightBones = new Set<string>();
    knight.scene.traverse((o: any) => o.isBone && knightBones.add(o.name));
    for (const name of ['Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded']) {
      const g = await parse(name);
      const clips = new Set(g.animations.map((c: any) => c.name));
      expect(clips.has('Idle'), name).toBe(true);
      for (const c of knightClips) expect(clips.has(c), `${name} lacks ${String(c)}`).toBe(true);
      const bones = new Set<string>();
      g.scene.traverse((o: any) => o.isBone && bones.add(o.name));
      for (const b of knightBones) expect(bones.has(b), `${name} lacks bone ${b}`).toBe(true);
    }
  }, 30_000);
});
