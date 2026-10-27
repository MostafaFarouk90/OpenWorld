import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { boxOf, drawsEnv, envDiskSource } from '../env/testing/envDiskSource';
import { CINDERREACH_ENV_KINDS, createCinderreachArt } from './cinderreachArt';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { CINDERREACH_TOGGLES } from './toggles';
import { registerCinderKinds } from './structureKinds';

let envLib: ModelLibrary;
let release: () => void;
beforeAll(async () => {
  release = registerCinderKinds();
  envLib = new ModelLibrary(await envDiskSource(), () => undefined);
});
afterAll(() => release());

const specs = [...CINDERREACH_LAYOUT.structures, ...CINDERREACH_TOGGLES.map((t) => t.spec)];

describe('Cinderreach art with the generated models', () => {
  it('draws each swapped kind with env/<its kind>', async () => {
    const art = createCinderreachArt(new ModelLibrary(undefined), envLib);
    for (const kind of Object.keys(CINDERREACH_ENV_KINDS)) {
      const s = specs.find((x) => x.kind === kind);
      expect(s, `${kind} is used somewhere`).toBeDefined();
      expect(drawsEnv((await art(s!))!, kind), kind).toBe(true);
    }
  });

  it('fits the ring, the cairn and the cages to their layout footprints, and keeps the marker its own size', async () => {
    const art = createCinderreachArt(new ModelLibrary(undefined), envLib);
    for (const kind of ['cinder-trial-ring', 'cinder-cairn', 'cinder-cage', 'cinder-rune-stone', 'cinder-boarded-well']) {
      const s = specs.find((x) => x.kind === kind)!;
      const b = boxOf((await art(s))!);
      expect(b.max.x - b.min.x, kind).toBeLessThan(s.footprint[0] * 1.2);
      expect(b.max.x - b.min.x, kind).toBeGreaterThan(s.footprint[0] * 0.8);
    }
    const marker = boxOf((await art(specs.find((x) => x.kind === 'cinder-marker')!))!);
    expect(marker.max.y).toBeCloseTo(1.6, 1);
  });

  it('keeps the scripted piece when the model is unavailable, and leaves the other kinds alone', async () => {
    const art = createCinderreachArt(new ModelLibrary(undefined), new ModelLibrary(undefined));
    expect((await art(specs.find((x) => x.kind === 'cinder-cage')!))!.name).toMatch(/^cage:/);
    expect((await art(specs.find((x) => x.kind === 'cinder-trial-ring')!))!.name).toMatch(/^trial-ring:/);
    const withEnv = createCinderreachArt(new ModelLibrary(undefined), envLib);
    expect((await withEnv(specs.find((x) => x.kind === 'cinder-shield') ?? specs.find((x) => x.kind === 'cinder-blightbloom')!))!.name).toMatch(/^(shield|blightbloom):/);
  });
});
