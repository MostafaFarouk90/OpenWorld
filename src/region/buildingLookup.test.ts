import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetId } from '../assets/AssetManifest';
import { BuildingLookup, STRUCTURE_MODELS } from './buildingLookup';
import type { StructureSpec } from './layoutTypes';

const spec = (kind: string): StructureSpec =>
  ({ id: 's', kind, x: 0, z: 0, yawDeg: 0, footprint: [4, 4], mode: 'solid' }) as StructureSpec;

afterEach(() => vi.restoreAllMocks());

describe('BuildingLookup', () => {
  it('maps every kind to null for now', () => {
    expect(Object.values(STRUCTURE_MODELS).every((v) => v === null)).toBe(true);
  });

  it('returns the greybox without a loader', async () => {
    const o = await new BuildingLookup().get(spec('house'));
    expect(o.userData.greybox).toBe(true);
  });

  it('returns the greybox for a mapped-but-null kind, never touching the loader', async () => {
    const loader = { load: vi.fn(), instantiate: vi.fn() };
    const o = await new BuildingLookup(loader, { house: null }).get(spec('house'));
    expect(o.userData.greybox).toBe(true);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('returns a clone of the real model when mapped and loaded', async () => {
    const model = new THREE.Group();
    const loader = { load: vi.fn(async () => ({})), instantiate: vi.fn(() => model.clone()) };
    const lookup = new BuildingLookup(loader, { house: 'house-pack' as AssetId });
    const a = await lookup.get(spec('house'));
    expect(a.userData.greybox).toBeUndefined();
    expect(a).not.toBe(model);
    expect(loader.load).toHaveBeenCalledWith('house-pack');
  });

  it('falls back to the greybox and warns once per kind when the loader rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = { load: vi.fn(async () => Promise.reject(new Error('404'))), instantiate: vi.fn() };
    const lookup = new BuildingLookup(loader, { house: 'x' as AssetId, mill: 'y' as AssetId });
    expect((await lookup.get(spec('house'))).userData.greybox).toBe(true);
    expect((await lookup.get(spec('house'))).userData.greybox).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    await lookup.get(spec('mill'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('falls back when instantiate throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = { load: async () => ({}), instantiate: () => { throw new Error('bad'); } };
    const o = await new BuildingLookup(loader, { house: 'x' as AssetId }).get(spec('house'));
    expect(o.userData.greybox).toBe(true);
  });

  it('throws for an unknown kind', async () => {
    await expect(new BuildingLookup().get(spec('castle'))).rejects.toThrow(/unknown structure kind/);
    await expect(new BuildingLookup().tryReal(spec('castle'))).rejects.toThrow(/unknown structure kind/);
  });
});
