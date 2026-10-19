import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BANNER_GLOW, bannerGlow, setBanners } from './Banners';

function scene() {
  const s = new THREE.Scene();
  for (const id of ['chapel.banner-1', 'chapel.banner-2', 'chapel.banner-3']) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 4.8), new THREE.MeshStandardMaterial({ color: 0xb02a2a }));
    m.name = `banner:${id}`;
    s.add(m);
  }
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  other.name = 'barrel';
  s.add(other);
  return s;
}

describe('setBanners', () => {
  it('glows the target, dims the seen, leaves the rest and never scales', () => {
    const s = scene();
    setBanners(s, 'chapel.banner-2', ['chapel.banner-1']);
    expect(bannerGlow(s, 'chapel.banner-2')).toBe(BANNER_GLOW.target);
    expect(bannerGlow(s, 'chapel.banner-1')).toBe(BANNER_GLOW.seen);
    expect(bannerGlow(s, 'chapel.banner-3')).toBe(0);
    expect(s.getObjectByName('banner:chapel.banner-2')!.scale.toArray()).toEqual([1, 1, 1]);
  });
  it('accepts mesh names, and a null target clears the glow', () => {
    const s = scene();
    setBanners(s, 'banner:chapel.banner-3', ['banner:chapel.banner-1']);
    expect(bannerGlow(s, 'chapel.banner-3')).toBe(BANNER_GLOW.target);
    expect(bannerGlow(s, 'chapel.banner-1')).toBe(BANNER_GLOW.seen);
    setBanners(s, null, []);
    for (const i of [1, 2, 3]) expect(bannerGlow(s, `chapel.banner-${i}`)).toBe(0);
  });
  it('a target that is also seen glows as the target; an empty scene is fine', () => {
    const s = scene();
    setBanners(s, 'chapel.banner-1', ['chapel.banner-1']);
    expect(bannerGlow(s, 'chapel.banner-1')).toBe(BANNER_GLOW.target);
    expect(() => setBanners(new THREE.Scene(), 'x', [])).not.toThrow();
  });
});
