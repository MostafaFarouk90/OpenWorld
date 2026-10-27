import { beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { boxOf, drawsEnv, envDiskSource } from '../env/testing/envDiskSource';
import { buildLiftCage, createOldsmokeArt, upgradeLiftCage } from './oldsmokeArt';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';

let envLib: ModelLibrary;
beforeAll(async () => {
  envLib = new ModelLibrary(await envDiskSource(), () => undefined);
});

describe('Oldsmoke art with the generated models', () => {
  const headframe = OLDSMOKE_LAYOUT.structures.find((s) => s.kind === 'deepgate-headframe')!;

  it('draws the headframe with env/deepgate-headframe at the layout footprint and height', async () => {
    const obj = (await createOldsmokeArt(new ModelLibrary(undefined), envLib)(headframe))!;
    expect(drawsEnv(obj, 'deepgate-headframe')).toBe(true);
    const b = boxOf(obj);
    expect(b.max.y).toBeGreaterThan(14 * 0.85);
    expect(b.max.y).toBeLessThan(14 * 1.15);
    expect(b.max.x - b.min.x).toBeLessThan(10 * 1.2);
  });

  it('keeps the scripted headframe when the env library cannot load it', async () => {
    const obj = (await createOldsmokeArt(new ModelLibrary(undefined), new ModelLibrary(undefined))(headframe))!;
    expect(obj.name).toBe(`headframe:${headframe.id}`);
  });

  it('puts the lift cage model over the pit and drops the scripted frame, or keeps the frame without the model', async () => {
    const kept = buildLiftCage();
    const n = kept.children.length;
    expect(await upgradeLiftCage(kept, new ModelLibrary(undefined))).toBe(false);
    expect(kept.children).toHaveLength(n);
    const cage = buildLiftCage();
    expect(await upgradeLiftCage(cage, envLib)).toBe(true);
    expect(cage.children.map((c) => c.name)).toEqual(['lift-pit', 'model:env/lift-cage']);
    expect(cage.getObjectByName('model:env/lift-cage')!.position.y).toBeCloseTo(1.0, 5);
    const gone = buildLiftCage();
    gone.userData.disposed = true;
    expect(await upgradeLiftCage(gone, envLib)).toBe(false);
    expect(gone.children.length).toBeGreaterThan(2);
  });
});
