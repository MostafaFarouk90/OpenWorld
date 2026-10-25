// Roof-deck rows (Rooftop Ward annex) carry `dy`: the loader lifts the instance by it above the ground at (x, z).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { PlacementField, rowLift, type PlacementRow } from './PlacementField';

async function heightOf(row: PlacementRow, ground = 20): Promise<number> {
  const field = new PlacementField(new ModelLibrary(undefined, () => undefined), () => ground);
  field.setDensity('high');
  await field.build([row]);
  const slot = field.object.children[0]!.children[0] as THREE.Group;
  const mesh = slot.children[0] as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(0, m);
  const y = new THREE.Vector3().setFromMatrixPosition(m).y;
  field.dispose();
  return y;
}

describe('rowLift', () => {
  it('passes a positive dy, and gives 0 for none, zero, a negative or a non-finite value', () => {
    expect(rowLift(7.5)).toBe(7.5);
    expect(rowLift(undefined)).toBe(0);
    expect(rowLift(0)).toBe(0);
    expect(rowLift(-3)).toBe(0);
    expect(rowLift(Number.NaN)).toBe(0);
    expect(rowLift(Infinity)).toBe(0);
  });
});

describe('PlacementField dy', () => {
  it('lifts an instance by a positive dy above the ground', async () => {
    expect(await heightOf({ id: 'barrel', x: 3, z: 4, dy: 7 })).toBeCloseTo(27);
  });

  it('leaves a row with dy 0 or no dy on the ground (unchanged)', async () => {
    expect(await heightOf({ id: 'barrel', x: 3, z: 4, dy: 0 })).toBeCloseTo(20);
    expect(await heightOf({ id: 'barrel', x: 3, z: 4 })).toBeCloseTo(20);
  });

  it('clamps a negative dy to 0: a row is never sunk below the ground', async () => {
    expect(await heightOf({ id: 'barrel', x: 3, z: 4, dy: -2 })).toBeCloseTo(20);
  });
});
