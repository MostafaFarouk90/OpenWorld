import { describe, expect, it } from 'vitest';
import { ASSET_PACKS, ASSETS, isSupportedModelUrl, validateManifest, type AssetEntry } from './AssetManifest';

const files = new Set(Object.keys(import.meta.glob('/public/assets/**/*.{glb,gltf}')));

function entry(id: string, overrides: Partial<AssetEntry> = {}): AssetEntry {
  return { id, url: `/assets/${id}.glb`, pack: 'kaykit-adventurers', kind: 'prop', ...overrides };
}

describe('shipped manifest', () => {
  it('passes validateManifest with no problems', () => {
    expect(validateManifest(ASSETS)).toEqual([]);
  });

  it('only lists .glb/.gltf urls whose files exist under public/', () => {
    for (const asset of Object.values(ASSETS)) {
      expect(isSupportedModelUrl(asset.url), asset.url).toBe(true);
      expect(files.has(`/public${asset.url}`), `${asset.url} missing on disk`).toBe(true);
    }
  });

  it('describes every pack with a CC0 license, https source and matching folder', () => {
    for (const [packId, pack] of Object.entries(ASSET_PACKS)) {
      expect(pack.license, packId).toBe('CC0-1.0');
      expect(pack.source, packId).toMatch(/^https:\/\//);
      expect(pack.folder, packId).toBe(`assets/${packId}/`);
    }
  });
});

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest({ a: entry('a'), b: entry('b') })).toEqual([]);
  });

  it('reports null and undefined entries as missing', () => {
    const errors = validateManifest({ a: null, b: undefined });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('a: entry is missing');
    expect(errors[1]).toContain('b: entry is missing');
  });

  it('reports an id that does not match its key', () => {
    const errors = validateManifest({ a: entry('other') });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('does not match its key');
  });

  it('reports an unknown pack', () => {
    const errors = validateManifest({ a: entry('a', { pack: 'nope' as AssetEntry['pack'] }) });
    expect(errors).toEqual(['a: unknown pack "nope"']);
  });

  it('reports a missing pack', () => {
    const errors = validateManifest({ a: { ...entry('a'), pack: undefined } });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unknown pack');
  });

  it('reports a missing kind', () => {
    const errors = validateManifest({ a: { ...entry('a'), kind: undefined } });
    expect(errors).toEqual(['a: kind is missing']);
  });

  it('reports an empty url', () => {
    expect(validateManifest({ a: entry('a', { url: '' }) })).toEqual(['a: url is empty']);
  });

  it('reports a whitespace-only url', () => {
    expect(validateManifest({ a: entry('a', { url: '   ' }) })).toEqual(['a: url is empty']);
  });

  it.each(['.fbx', '.obj'])('reports an unsupported extension %s', (ext) => {
    const errors = validateManifest({ a: entry('a', { url: `/assets/a${ext}` }) });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unsupported format');
  });

  it('reports a duplicate url and names the other key', () => {
    const errors = validateManifest({ a: entry('a', { url: '/x.glb' }), b: entry('b', { url: '/x.glb' }) });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('b: duplicate url');
    expect(errors[0]).toContain('"a"');
  });

  it('returns one message per problem for a mixed manifest', () => {
    const errors = validateManifest({
      ok: entry('ok'),
      gone: null,
      wrongId: entry('x'),
      badPack: entry('badPack', { pack: 'zzz' as AssetEntry['pack'] }),
      empty: entry('empty', { url: '' }),
      fbx: entry('fbx', { url: '/a.fbx' }),
      dup: entry('dup', { url: '/assets/ok.glb' }),
    });
    expect(errors).toHaveLength(6);
  });

  it('uses the packs argument to decide which packs are known', () => {
    expect(validateManifest({ a: entry('a') }, { 'kaykit-adventurers': {} })).toEqual([]);
    expect(validateManifest({ a: entry('a') }, {})).toHaveLength(1);
  });
});

describe('isSupportedModelUrl', () => {
  it.each(['/a.glb', '/a.gltf', '/a.GLB', '/a.GlTf', '/a.glb?v=2', '/a.gltf#frag', '/a.glb?x=1#y'])(
    'accepts %s',
    (url) => {
      expect(isSupportedModelUrl(url)).toBe(true);
    },
  );

  it.each(['/a.fbx', '/a.glb.zip', '/a', '/a.obj?file=b.glb', ''])('rejects %s', (url) => {
    expect(isSupportedModelUrl(url)).toBe(false);
  });
});
