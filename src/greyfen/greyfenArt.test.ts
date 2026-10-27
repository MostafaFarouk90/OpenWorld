import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { hasEnvModel } from '../env/envStructureArt';
import { boxOf, drawsEnv, envDiskSource } from '../env/testing/envDiskSource';
import { createGreyfenArt, greyfenEnvEntry } from './greyfenArt';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { GREYFEN_KINDS, registerGreyfenKinds } from './structureKinds';
import { GREYFEN_TOGGLES } from './toggles';

let envLib: ModelLibrary;
let release: () => void;
beforeAll(async () => {
  release = registerGreyfenKinds();
  envLib = new ModelLibrary(await envDiskSource(), () => undefined);
});
afterAll(() => release());

const specs = [...GREYFEN_LAYOUT.structures, ...GREYFEN_TOGGLES.map((t) => t.spec)];

describe('Greyfen art with the generated models', () => {
  it('has a model for every Greyfen kind in the manifest, and maps no other', () => {
    for (const kind of Object.keys(GREYFEN_KINDS)) {
      const s = specs.find((x) => x.kind === kind);
      if (!s) continue;
      expect(greyfenEnvEntry(s) !== undefined, kind).toBe(hasEnvModel(kind));
    }
    expect(hasEnvModel('greyfen-jetty')).toBe(true);
  });

  it('draws every layout and toggle structure of a mapped kind with its env model', async () => {
    const art = createGreyfenArt(envLib);
    const seen = new Set<string>();
    for (const s of specs) {
      const entry = greyfenEnvEntry(s);
      if (!entry) {
        expect(await art(s), s.id).toBeNull();
        continue;
      }
      const id = entry.id ?? s.kind;
      expect(drawsEnv((await art(s))!, id), s.id).toBe(true);
      seen.add(id);
    }
    for (const id of ['greyfen-stilt-house', 'greyfen-plank-walk', 'greyfen-jetty', 'greyfen-boathouse', 'greyfen-ranger-platform', 'greyfen-reed-bed', 'greyfen-reed-bed-charred', 'greyfen-stocks', 'greyfen-stilt-hut', 'greyfen-herb-bed', 'greyfen-chapel-ruin', 'greyfen-bell-tower', 'greyfen-monastery-ruin', 'greyfen-marker']) {
      expect(seen.has(id), id).toBe(true);
    }
  });

  it('draws the ferry jetties, not the M23 bridge decks, with the jetty model, tiled along their length at the deck height', async () => {
    const art = createGreyfenArt(envLib);
    const jetty = specs.find((s) => s.id === 'greyfen-jetty-reedgate')!;
    const obj = (await art(jetty))!;
    expect(obj.children.length).toBe(2);
    const b = boxOf(obj);
    expect(b.max.x - b.min.x).toBeCloseTo(jetty.footprint[0], 1);
    expect(b.max.z - b.min.z).toBeCloseTo(jetty.footprint[1], 1);
    expect(b.max.y).toBeCloseTo(jetty.height!, 1);
    const bridge = GREYFEN_TOGGLES.find((t) => t.spec.kind === 'bridge')!.spec;
    expect(await art(bridge)).toBeNull();
  });

  it('repeats the plank walk along its length', async () => {
    const art = createGreyfenArt(envLib);
    const walk = specs.find((s) => s.id === 'greyfen-reedgate-walk-1')!;
    const obj = (await art(walk))!;
    expect(obj.children.length).toBe(Math.round(walk.footprint[0] / 4));
    const b = boxOf(obj);
    expect(b.max.x - b.min.x).toBeCloseTo(walk.footprint[0], 1);
  });

  it('draws nothing without the models', async () => {
    const art = createGreyfenArt(new ModelLibrary(undefined));
    for (const s of specs.slice(0, 40)) expect(await art(s), s.id).toBeNull();
  });
});
