import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/env/manifest.json';
import { hueMatrix, resolveModel, resolveStandIn } from './resolve';
import targets from './targets.json';

describe('resolveModel', () => {
  it('uses the runtime copy for an id that has one', () => {
    expect(resolveModel('oak-a')).toEqual({ source: 'env', model: 'env/oak-a', scale: 1 });
  });

  it('makes variants of an existing model by id, tinted or rescaled', () => {
    const r = resolveModel('flower-patch-purple');
    expect(r).toMatchObject({ source: 'env', model: 'env/flower-patch-yellow' });
    expect(r.source === 'env' && r.tint?.hue).toBe(235);
    const b = resolveModel('boulder-large-b');
    expect(b).toMatchObject({ source: 'env', model: 'env/boulder-large-a', scale: 0.78 });
  });

  it('uses KayKit models the grids already have, with their fit factor', () => {
    const r = resolveModel('barrel');
    expect(r).toMatchObject({ source: 'kaykit', model: 'hex/barrel', scale: 4.3 });
    expect(resolveModel('post_lantern')).toMatchObject({ source: 'kaykit', model: 'hal/post_lantern' });
    expect(resolveModel('stonewall-high')).toMatchObject({ source: 'kaykit', model: 'hex/fence_stone_straight', fitHeight: 1.5 });
    expect(resolveModel('stonewall-wing')).toMatchObject({ source: 'kaykit', model: 'hex/fence_stone_straight', fitHeight: 1.0 });
    expect(resolveStandIn('scorched-fence')).toMatchObject({ source: 'kaykit', model: 'hex/fence_wood_straight', fitHeight: 1.6 });
  });

  it('maps the B3 ids to tinted variants or KayKit models', () => {
    expect(resolveStandIn('bush-holly-a')).toMatchObject({ source: 'env', model: 'env/bush-round-a', scale: 1.05 });
    expect(resolveStandIn('willow-a')).toMatchObject({ source: 'env', model: 'env/elm-or-ash-a', stretchY: 0.7 });
    for (const id of ['reeds-a', 'reeds-b']) {
      const r = resolveStandIn(id);
      expect(r).toMatchObject({ source: 'env', model: 'env/grass-clump-a' });
      expect(r.source === 'env' && (r.stretchY ?? 1) > 2, id).toBe(true);
      expect(r.source === 'env' && (r.girth ?? 1) > 1.5, `${id} is wide enough to read as a bed`).toBe(true);
      // Rendered size of the 0.454 x 0.5 m glb clump: 1.2 to 1.5 m tall, 0.8 to 1.0 m wide.
      if (r.source === 'env') {
        expect(0.5 * r.scale * (r.stretchY ?? 1), `${id} height`).toBeGreaterThanOrEqual(1.2);
        expect(0.5 * r.scale * (r.stretchY ?? 1), `${id} height`).toBeLessThanOrEqual(1.5);
        expect(0.454 * r.scale * (r.girth ?? 1), `${id} width`).toBeGreaterThanOrEqual(0.8);
        expect(0.454 * r.scale * (r.girth ?? 1), `${id} width`).toBeLessThanOrEqual(1.0);
      }
    }
    expect(resolveStandIn('roadside-shrine-a')).toMatchObject({ source: 'kaykit', model: 'hal/shrine_candles' });
    for (const id of ['flag_red', 'rock_single_B', 'rock_single_C', 'tent']) expect(resolveStandIn(id).source, id).toBe('kaykit');
    // variants without a stretch carry none
    expect('stretchY' in resolveModel('oak-b')).toBe(false);
  });

  it('maps the B4 ash-reach ids to variants and stretched dead trees instead of a green placeholder', () => {
    expect(resolveStandIn('ash-tree-dead-a')).toMatchObject({ source: 'kaykit', model: 'hal/tree_dead_medium', fitHeight: 6.5 });
    expect(resolveStandIn('ash-tree-dead-b')).toMatchObject({ source: 'kaykit', model: 'hal/tree_dead_large', fitHeight: 7.5 });
    expect(resolveStandIn('oak-ash-a')).toMatchObject({ source: 'env', model: 'env/oak-a', scale: 0.95 });
    expect(resolveStandIn('grass-clump-ash')).toMatchObject({ source: 'env', model: 'env/grass-clump-a' });
    expect(resolveStandIn('bush-round-ash')).toMatchObject({ source: 'env', model: 'env/bush-round-a' });
    // Ash scrub keeps almost no green, so it never reads as a green bush on the grey reach.
    const scrub = resolveStandIn('bush-round-ash');
    expect(scrub.source !== 'placeholder' && scrub.tint?.sat).toBeLessThanOrEqual(0.1);
    expect(resolveStandIn('charred-stump')).toMatchObject({ source: 'env', model: 'env/stump-a' });
    expect(resolveStandIn('basalt-columns-a')).toMatchObject({ source: 'env', model: 'env/boulder-large-a', scale: 1.3, girth: 0.35 });
    expect(resolveStandIn('crow-perch-post')).toMatchObject({ source: 'kaykit', model: 'hal/fence_pillar' });
    expect(resolveModel('milestone-a')).toMatchObject({ source: 'env', model: 'env/milestone-a' });
    expect(resolveStandIn('wagon-wreck-a')).toMatchObject({ source: 'env', model: 'env/haycart-a' });
  });

  it('generated glbs replace the stand-ins under the same id, and the stand-in stays as the fallback', () => {
    for (const id of ['tent', 'refugee-tent-a', 'willow-a', 'reeds-a', 'gibbet-post', 'ash-tree-dead-a', 'cairn-a', 'keg-a', 'greyfen-stilt-house']) {
      expect(Object.keys(manifest.objects), id).toContain(id);
      expect(resolveModel(id), id).toEqual({ source: 'env', model: `env/${id}`, scale: 1 });
    }
    expect(resolveStandIn('refugee-tent-a')).toEqual({ source: 'placeholder', shape: 'tent' });
    expect(resolveStandIn('oak-b')).toEqual(resolveModel('oak-b'));
  });

  it('falls back to a placeholder shape only when nothing matches', () => {
    expect(resolveModel('haybale-b')).toEqual({ source: 'placeholder', shape: 'haystack' });
    expect(resolveModel('signpost-b')).toEqual({ source: 'placeholder', shape: 'post' });
    expect(resolveModel('no-such-thing')).toEqual({ source: 'placeholder', shape: 'box' });
  });

  it('batch 2 glbs replace their stand-ins under the same id', () => {
    for (const id of ['haystack-round', 'signpost-a', 'picket-fence', 'woodpile-chop', 'garden-bed-a', 'barn-a', 'stable-a', 'market-stall-b'])
      expect(resolveModel(id), id).toEqual({ source: 'env', model: `env/${id}`, scale: 1 });
  });

  it('drains the colour of an -ashen id and keeps the base model and size', () => {
    const plain = resolveModel('oak-a');
    const ash = resolveModel('oak-a-ashen');
    expect(ash).toMatchObject({ source: 'env', model: 'env/oak-a', scale: 1 });
    expect(ash.source === 'env' && ash.tint?.sat).toBeLessThan(0.5);
    expect(plain.source === 'env' && plain.tint).toBeUndefined();
    // A variant keeps its own size and tint under the ash colour.
    const b = resolveModel('oak-b-ashen');
    expect(b).toMatchObject({ model: 'env/oak-a', scale: 0.85 });
    expect(b.source === 'env' && b.tint?.mul).toBeLessThan(0xe0eac8);
    expect(resolveModel('haystack-round-ashen')).toMatchObject({ source: 'env', model: 'env/haystack-round' });
  });

  it('builds the slim poplar from the birch and the dead trees from KayKit', () => {
    const p = resolveStandIn('poplar-a');
    expect(p).toMatchObject({ source: 'env', model: 'env/birch-a', scale: 1.75 });
    expect(p.source === 'env' && p.girth).toBeLessThan(1);
    expect(resolveStandIn('cairn-a')).toMatchObject({ source: 'env', model: 'env/rock-cluster-a', scale: 0.5 });
  });

  it('never leaves a targeted id unresolved', () => {
    for (const id of Object.keys(targets.objects)) expect(() => resolveModel(id), id).not.toThrow();
  });
});

describe('Dead Road ids (D1 to D3)', () => {
  it('make the corridor variants from existing models, none a placeholder', () => {
    for (const id of ['hedge-dead-a', 'fern-ash', 'grass-clump-dry', 'bush-gorse', 'bush-heather', 'apple-tree-a']) {
      const r = resolveModel(id);
      expect(r.source, id).toBe('env');
      expect(r.source === 'env' && r.tint, id).toBeTruthy();
    }
    expect(resolveModel('hedge-dead-a')).toMatchObject({ model: 'env/hedge-straight', girth: 0.7 });
    expect(resolveModel('bush-heather')).toMatchObject({ model: 'env/bush-round-a', scale: 0.55 });
  });
  it('keep the gibbet and the wayside shrine on KayKit pieces under their agreed ids', () => {
    for (const id of ['gatepost-a', 'field-gate-a']) expect(resolveStandIn(id).source, id).toBe('kaykit');
    expect(resolveStandIn('gibbet-post')).toMatchObject({ source: 'kaykit', model: 'hal/fence_pillar', fitHeight: 3.6 });
    expect(resolveStandIn('roadside-shrine-a').source).toBe('kaykit');
  });
});

describe('hueMatrix', () => {
  const apply = (m: number[], c: number[]) => [0, 1, 2].map((r) => m[r * 3] * c[0] + m[r * 3 + 1] * c[1] + m[r * 3 + 2] * c[2]);

  it('is the identity at 0 degrees and full saturation', () => {
    const m = hueMatrix(0, 1);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 6));
  });

  it('keeps grey unchanged for any hue', () => {
    for (const deg of [40, 120, 235]) expect(apply(hueMatrix(deg), [0.5, 0.5, 0.5]).every((v) => Math.abs(v - 0.5) < 0.01)).toBe(true);
  });

  it('turns yellow towards purple at +235 degrees', () => {
    const [r, g, b] = apply(hueMatrix(235), [0.9, 0.8, 0.2]);
    expect(b).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(g);
  });

  it('desaturates towards grey at low saturation', () => {
    const [r, g, b] = apply(hueMatrix(0, 0.1), [0.9, 0.8, 0.2]);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.15);
  });
});
