import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { boxOf, drawsEnv, envDiskSource } from '../env/testing/envDiskSource';
import { createDragonspineArt, DRAGONSPINE_ENV_KINDS } from './dragonspineArt';
import { DRAGONSPINE_LAYOUT } from './dragonspine.layout';
import { registerDragonspineKinds } from './structureKinds';

let envLib: ModelLibrary;
let release: () => void;
beforeAll(async () => {
  release = registerDragonspineKinds();
  envLib = new ModelLibrary(await envDiskSource(), () => undefined);
});
afterAll(() => release());

const first = (kind: string) => DRAGONSPINE_LAYOUT.structures.find((s) => s.kind === kind)!;

describe('Dragonspine art with the generated models', () => {
  it('draws each swapped kind with its model id', async () => {
    const art = createDragonspineArt(new ModelLibrary(undefined), envLib);
    for (const [kind, entry] of Object.entries(DRAGONSPINE_ENV_KINDS)) {
      expect(drawsEnv((await art(first(kind)))!, entry.id ?? kind), kind).toBe(true);
    }
  });

  it('tiles the 12 m trophy wall from three 4 m models and sizes the carving stone to its height', async () => {
    const art = createDragonspineArt(new ModelLibrary(undefined), envLib);
    const wall = (await art(first('dragonspine-trophy-wall')))!;
    expect(wall.children).toHaveLength(3);
    expect(boxOf(wall).max.y).toBeCloseTo(2.6, 1);
    const stone = boxOf((await art(first('dragonspine-carving')))!);
    expect(stone.max.y).toBeCloseTo(2.2, 2);
  });

  it('keeps the primitives when the models are unavailable', async () => {
    const art = createDragonspineArt(new ModelLibrary(undefined), new ModelLibrary(undefined));
    expect((await art(first('dragonspine-leanto')))!.name).toMatch(/^dragonspine-leanto:/);
    expect((await art(first('dragonspine-nest')))!.name).toMatch(/^dragonspine-nest:/);
  });
});
