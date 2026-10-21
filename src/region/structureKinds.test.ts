import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingLookup, STRUCTURE_MODELS, type ModelLoader } from './buildingLookup';
import { DEFAULT_HEIGHT, buildGreybox, structureHeight } from './greybox';
import { BUILT_IN_STRUCTURE_KINDS, type LayoutData, type StructureSpec } from './layoutTypes';
import { isKnownStructureKind, registerStructureKind, structureRecipe } from './structureKinds';
import { validateLayout } from './validateLayout';

const spec = (kind: string, over: Partial<StructureSpec> = {}): StructureSpec => ({
  id: 'x.thing',
  kind,
  x: 0,
  z: 0,
  yawDeg: 0,
  footprint: [4, 6],
  mode: 'solid',
  ...over,
});
const layout = (kind: string): LayoutData => ({
  anchors: [{ id: 'brightwater.player-spawn', x: 50, z: 50, yawDeg: 0 }],
  triggers: [],
  structures: [spec(kind)],
  patrols: [],
  npcs: [],
  fields: [],
});

const undos: Array<() => void> = [];
afterEach(() => undos.splice(0).forEach((u) => u()));
const reg = (k: string, r: Parameters<typeof registerStructureKind>[1]) => {
  const u = registerStructureKind(k, r);
  undos.push(u);
  return u;
};

describe('structure kind registry', () => {
  it('lists the 25 built-ins, each with a height and a model slot', () => {
    expect(BUILT_IN_STRUCTURE_KINDS).toHaveLength(25);
    expect(new Set(BUILT_IN_STRUCTURE_KINDS).size).toBe(25);
    for (const k of BUILT_IN_STRUCTURE_KINDS) {
      expect(DEFAULT_HEIGHT[k], k).toBeGreaterThan(0);
      expect(k in STRUCTURE_MODELS, k).toBe(true);
      expect(isKnownStructureKind(k)).toBe(true);
      expect(structureRecipe(k)).toBeUndefined();
    }
  });

  it('builds a registered kind with the recipe height, and a spec height still wins', () => {
    reg('forge-shed', { height: 3.5, collider: 'solid' });
    expect(isKnownStructureKind('forge-shed')).toBe(true);
    expect(structureHeight(spec('forge-shed'))).toBe(3.5);
    expect(structureHeight(spec('forge-shed', { height: 6 }))).toBe(6);
    const b = new THREE.Box3().setFromObject(buildGreybox(spec('forge-shed')));
    expect(b.getSize(new THREE.Vector3()).y).toBeCloseTo(3.5);
    expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it('throws on a built-in, a duplicate and a bad recipe', () => {
    expect(() => registerStructureKind('house', { height: 1 })).toThrow(/built-in/);
    reg('dup-kind', { height: 2 });
    expect(() => registerStructureKind('dup-kind', { height: 2 })).toThrow(/already registered/);
    expect(() => registerStructureKind('', { height: 2 })).toThrow();
    expect(() => registerStructureKind('flat-kind', { height: 0 })).toThrow(/height/);
    expect(isKnownStructureKind('flat-kind')).toBe(false);
  });

  it('undo unregisters, once, and a stale undo leaves a later registration alone', () => {
    const undo = registerStructureKind('temp-kind', { height: 2 });
    undo();
    expect(isKnownStructureKind('temp-kind')).toBe(false);
    expect(() => buildGreybox(spec('temp-kind'))).toThrow(/unknown structure kind/);
    reg('temp-kind', { height: 4 });
    undo();
    expect(structureRecipe('temp-kind')?.height).toBe(4);
  });

  it('validateLayout rejects an unregistered kind and accepts a registered one', () => {
    const flat = () => 0;
    expect(validateLayout(layout('hosue'), flat).join('\n')).toMatch(/unknown kind "hosue"/);
    expect(validateLayout(layout('house'), flat).join('\n')).not.toMatch(/unknown kind/);
    reg('forge-shed', { height: 3 });
    expect(validateLayout(layout('forge-shed'), flat).join('\n')).not.toMatch(/unknown kind/);
  });

  it('BuildingLookup falls back to the recipe model, and rejects an unknown kind', async () => {
    reg('forge-shed', { height: 3, model: 'fake/forge-shed' });
    const loader: ModelLoader = {
      load: vi.fn(async () => undefined),
      instantiate: vi.fn(() => new THREE.Group()),
    };
    const lookup = new BuildingLookup(loader);
    expect(await lookup.tryReal(spec('forge-shed'))).not.toBeNull();
    expect(loader.load).toHaveBeenCalledWith('fake/forge-shed');
    reg('plain-kind', { height: 2 });
    expect(await lookup.tryReal(spec('plain-kind'))).toBeNull();
    await expect(lookup.tryReal(spec('nope'))).rejects.toThrow(/unknown structure kind/);
    // Built-ins are untouched.
    expect(await lookup.tryReal(spec('house'))).toBeNull();
  });
});
