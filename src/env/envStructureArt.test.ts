import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import type { StructureSpec } from '../region/layoutTypes';
import { registerCinderKinds } from '../cinderreach/structureKinds';
import { registerGreyfenKinds } from '../greyfen/structureKinds';
import { registerDragonspineKinds } from '../dragonspine/structureKinds';
import { createEnvStructureArt, envModelLibraryFor, envStructure, hasEnvModel } from './envStructureArt';
import { boxOf, drawsEnv, envDiskSource } from './testing/envDiskSource';

const spec = (kind: string, w: number, d: number, extra: Partial<StructureSpec> = {}): StructureSpec => ({ id: `t-${kind}`, kind, x: 0, z: 0, yawDeg: 0, footprint: [w, d], mode: 'solid', ...extra }) as StructureSpec;

let lib: ModelLibrary;
beforeAll(async () => {
  registerCinderKinds();
  registerGreyfenKinds();
  registerDragonspineKinds();
  lib = new ModelLibrary(await envDiskSource(), () => undefined);
});

describe('hasEnvModel', () => {
  it('is true for ids in the manifest and false otherwise', () => {
    expect(hasEnvModel('cinder-cage')).toBe(true);
    expect(hasEnvModel('prop.greyfen.ferry-punt')).toBe(true);
    expect(hasEnvModel('cinder-shield')).toBe(false);
    expect(hasEnvModel('dragonspine-leanto')).toBe(false);
  });
});

describe('envStructure', () => {
  it('returns the env model fitted to the footprint and height of a manifest kind', async () => {
    const obj = (await envStructure(lib, spec('cinder-cage', 3, 3, { height: 2.4 })))!;
    expect(obj).toBeDefined();
    expect(drawsEnv(obj, 'cinder-cage')).toBe(true);
    const b = boxOf(obj);
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.y).toBeGreaterThan(2.4 * 0.85);
    expect(b.max.y).toBeLessThan(2.4 * 1.15);
    expect((b.max.x + b.min.x) / 2).toBeCloseTo(0, 2);
    expect((b.max.z + b.min.z) / 2).toBeCloseTo(0, 2);
    expect(b.max.x - b.min.x).toBeGreaterThan(3 * 0.8);
    expect(b.max.x - b.min.x).toBeLessThan(3 * 1.2);
  });

  it('caps the footprint stretch at 15% of the uniform scale', async () => {
    // A 3 x 3 cage asked to fill 6 x 3: the uniform scale is sqrt(2), so x ends at most 15% above it.
    const b = boxOf((await envStructure(lib, spec('cinder-cage', 6, 3, { height: 2.4 })))!);
    const sx = (b.max.x - b.min.x) / (b.max.z - b.min.z);
    expect(sx).toBeLessThan(1.15 / 0.85 + 0.01);
  });

  it('keeps the authored size in natural mode and the proportions in height mode', async () => {
    const natural = boxOf((await envStructure(lib, spec('cinder-marker', 4, 4, { height: 0.5 }), { mode: 'natural' }))!);
    expect(natural.max.y).toBeCloseTo(1.6, 1);
    expect(natural.max.x - natural.min.x).toBeLessThan(1);
    const tall = boxOf((await envStructure(lib, spec('dragonspine-carving', 1.6, 1.2, { height: 2.2 }), { id: 'dragonspine-carving-stone', mode: 'height' }))!);
    expect(tall.max.y).toBeCloseTo(2.2, 2);
    expect(tall.max.x - tall.min.x).toBeCloseTo((1 * 2.2) / 1.8, 1);
  });

  it('repeats the model along a long plank walk instead of stretching it', async () => {
    const obj = (await envStructure(lib, spec('greyfen-plank-walk', 52, 1.6, { mode: 'open' }), { mode: 'tile' }))!;
    expect(obj.children).toHaveLength(13);
    const b = boxOf(obj);
    expect(b.max.x - b.min.x).toBeCloseTo(52, 1);
    expect(b.max.z - b.min.z).toBeCloseTo(1.6, 1);
    expect(b.max.y).toBeCloseTo(0.15, 2);
  });

  it('tiles a square deck as a grid and a trophy wall as a line', async () => {
    const deck = (await envStructure(lib, spec('greyfen-plank-walk', 16, 16), { mode: 'tile' }))!;
    expect(deck.children).toHaveLength(10 * 4);
    const wall = (await envStructure(lib, spec('dragonspine-trophy-wall', 12, 2.2, { height: 2.6 }), { mode: 'tile', crossUniform: true }))!;
    expect(wall.children).toHaveLength(3);
    const b = boxOf(wall);
    expect(b.max.x - b.min.x).toBeCloseTo(12, 1);
    expect(b.max.z - b.min.z).toBeLessThan(0.6);
  });

  it('returns undefined for a kind the manifest lacks, without asking the library', async () => {
    const template = vi.spyOn(lib, 'template');
    expect(await envStructure(lib, spec('cinder-shield', 1, 1))).toBeUndefined();
    expect(template).not.toHaveBeenCalled();
    template.mockRestore();
  });

  it('returns undefined when the model fails to load', async () => {
    const broken = new ModelLibrary({ load: () => Promise.reject(new Error('404')), instantiate: () => new THREE.Group() }, () => undefined);
    expect(await envStructure(broken, spec('cinder-cage', 3, 3, { height: 2.4 }))).toBeUndefined();
    expect(await envStructure(new ModelLibrary(undefined), spec('cinder-cage', 3, 3, { height: 2.4 }))).toBeUndefined();
    expect(await envStructure(envModelLibraryFor(null), spec('cinder-cage', 3, 3, { height: 2.4 }))).toBeUndefined();
  });
});

describe('createEnvStructureArt', () => {
  it('draws the kinds of its table and gives null for the rest', async () => {
    const art = createEnvStructureArt(lib, { 'cinder-cage': {}, 'cinder-shield': {} });
    expect(drawsEnv((await art(spec('cinder-cage', 3, 3, { height: 2.4 })))!, 'cinder-cage')).toBe(true);
    expect(await art(spec('cinder-shield', 1, 1))).toBeNull(); // in the table, not in the manifest
    expect(await art(spec('cinder-cairn', 2.4, 2.4))).toBeNull(); // not in the table
    expect(await art(spec('toString', 1, 1))).toBeNull();
  });
});
