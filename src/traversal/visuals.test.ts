import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { boxOf, drawsEnv, envDiskSource } from '../env/testing/envDiskSource';
import { DECK_HEIGHT } from './ferry/FerryRides';
import { PUNT_LIFT, boatMesh, sledMesh, useEnvModel } from './visuals';

let envLib: ModelLibrary;
beforeAll(async () => {
  envLib = new ModelLibrary(await envDiskSource(), () => undefined);
});

describe('traversal visuals with the generated models', () => {
  it('swaps the punt for its model with the floor DECK_HEIGHT above the waterline, under the same root', async () => {
    const boat = boatMesh();
    const scene = new THREE.Group();
    scene.add(boat);
    boat.position.set(5, 2, 7);
    expect(await useEnvModel(boat, 'prop.greyfen.ferry-punt', envLib, PUNT_LIFT)).toBe(true);
    expect(boat.parent).toBe(scene);
    expect(boat.position.y).toBe(2);
    expect(boat.children).toHaveLength(1);
    expect(drawsEnv(boat, 'prop.greyfen.ferry-punt')).toBe(true);
    boat.position.set(0, 0, 0);
    const b = boxOf(boat);
    // The floor planks' top is 0.40 m above the keel; lifted, it is the seated player's feet (the keel 0.05 m under the waterline).
    expect(PUNT_LIFT + 0.4).toBeCloseTo(DECK_HEIGHT, 5);
    expect(b.min.y).toBeCloseTo(PUNT_LIFT, 3);
    expect(b.max.z - b.min.z).toBeCloseTo(5, 1);
    expect(b.max.x - b.min.x).toBeCloseTo(1.8, 1);
  });

  it('swaps the sled for its model on the ground', async () => {
    const sled = sledMesh();
    expect(await useEnvModel(sled, 'prop.dragonspine.supply-sled', envLib)).toBe(true);
    expect(drawsEnv(sled, 'prop.dragonspine.supply-sled')).toBe(true);
    const b = boxOf(sled);
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.y).toBeCloseTo(0.8, 2);
  });

  it('keeps the stand-in when the library has no model, the id is unknown, or the root is gone', async () => {
    const boat = boatMesh();
    const n = boat.children.length;
    expect(await useEnvModel(boat, 'prop.greyfen.ferry-punt', new ModelLibrary(undefined))).toBe(false);
    expect(await useEnvModel(boat, 'prop.greyfen.no-such-boat', envLib)).toBe(false);
    boat.userData.gone = true;
    expect(await useEnvModel(boat, 'prop.greyfen.ferry-punt', envLib)).toBe(false);
    expect(boat.children).toHaveLength(n);
  });
});
