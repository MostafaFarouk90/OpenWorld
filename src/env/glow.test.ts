import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { createEnvPlugin } from './env.plugin';
import {
  assignSlots,
  collectSources,
  EnvGlow,
  FADE_SECONDS,
  flicker,
  flickerGlsl,
  GLOW,
  GlowLights,
  hash01,
  KEEP_MARGIN,
  LIGHT_RANGE,
  MIN_SPACING,
  newGlowUniforms,
  patchGlowMaterial,
  POOL_MAX,
  POOL_SIZE,
  PROFILES,
  SWAP_MARGIN,
  TIME_WRAP,
  unpatchGlowMaterial,
  type GlowTier,
  type ProfileName,
} from './glow';
import { createGlowRegistry, type GlowSource } from './glowSources';
import type { PlacementRow } from './PlacementField';

const src = (id: string, x: number, z: number, kind = 'forge-hearth-a'): GlowSource => ({ id, kind, x, y: 1, z });
const lightsIn = (scene: THREE.Object3D): THREE.Light[] => {
  const out: THREE.Light[] = [];
  scene.traverse((o) => (o as THREE.Light).isLight && out.push(o as THREE.Light));
  return out;
};

describe('flicker', () => {
  it.each(Object.keys(PROFILES) as ProfileName[])('%s stays within 0.6 to 1.2 of the model value and really moves', (name) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const v = flicker(name, i * 0.013, (i % 7) * 0.9);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      expect(v).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.2 + 1e-9);
    }
    expect(hi - lo, 'visible swing').toBeGreaterThan(0.25);
  });

  it('a phase shift de-syncs two fires, and the same phase repeats exactly', () => {
    expect(flicker('fire', 3.2, 0)).toBe(flicker('fire', 3.2, 0));
    expect(flicker('fire', 3.2, 0)).not.toBeCloseTo(flicker('fire', 3.2, 2.1), 3);
  });

  it('flames are quicker than embers', () => {
    const swing = (n: ProfileName): number => {
      let s = 0, prev = flicker(n, 0);
      for (let i = 1; i < 2000; i++) {
        const v = flicker(n, i * 0.01);
        s += Math.abs(v - prev);
        prev = v;
      }
      return s;
    };
    expect(swing('fire')).toBeGreaterThan(swing('ember') * 3);
  });

  it('the GLSL mirrors the JS constants', () => {
    const g = flickerGlsl('ember');
    expect(g).toContain('float glowFlicker(float t)');
    for (const a of PROFILES.ember.amps) expect(g).toContain(a.toFixed(4));
    for (const w of PROFILES.ember.freqs) expect(g).toContain(w.toFixed(4));
    expect(g).toContain(PROFILES.ember.mean.toFixed(4));
  });

  it('hash01 is stable and spread', () => {
    expect(hash01('a')).toBe(hash01('a'));
    expect(new Set(Array.from({ length: 50 }, (_, i) => hash01(`brazier-${i}`))).size).toBe(50);
    for (let i = 0; i < 50; i++) expect(hash01(`x${i}`)).toBeLessThan(1);
  });
});

describe('what glows', () => {
  it('lights the hearth, the brazier and the clamp; coal stays dark; slag cracks flicker without a light', () => {
    for (const id of ['forge-hearth-a', 'brazier-standing-a', 'charcoal-clamp-a']) expect(GLOW[id].light, id).toBeTruthy();
    expect(GLOW['coal-heap-a']).toBeUndefined();
    expect(GLOW['slag-heap'].light).toBeUndefined();
    expect(GLOW['slag-heap'].materials).toEqual({ Glow: 'ember' });
    expect(GLOW['forge-hearth-a'].materials).toMatchObject({ Fire: 'fire', FireCore: 'fire' });
  });

  it('the pool is 3 on high, 2 on medium and none on low', () => {
    expect(POOL_SIZE).toEqual({ high: 3, medium: 2, low: 0 });
    expect(POOL_MAX).toBe(3);
  });

  it('every light is shaped for eye-level spill: warm, a modest range, never shadowed by design', () => {
    for (const [id, k] of Object.entries(GLOW)) {
      if (!k.light) continue;
      expect(k.light.distance, id).toBeGreaterThanOrEqual(8);
      expect(k.light.distance, id).toBeLessThanOrEqual(16);
      expect((k.light.color >> 16) & 255, id).toBe(255); // red channel full: orange, never white or blue
      expect(k.light.peak, id).toBeGreaterThan(1);
    }
  });
});

describe('collectSources', () => {
  const rows: PlacementRow[] = [
    { id: 'forge-hearth-a', x: 10, z: 20, scale: 1 },
    { id: 'coal-heap-a', x: 12, z: 20 },
    { id: 'oak-a', x: 0, z: 0 },
    { id: 'brazier-standing-a', x: 30, z: 40, scale: 2, dy: 5 },
    { id: 'slag-heap', x: 50, z: 50 },
    { id: 'charcoal-clamp-a', x: Number.NaN, z: 1 },
  ];

  it('takes only the ids with a light, at the ground plus the flame height, scaled and lifted', () => {
    const s = collectSources('t', rows, (x, z) => x + z / 10);
    expect(s.map((e) => e.kind)).toEqual(['forge-hearth-a', 'brazier-standing-a']);
    expect(s[0]).toMatchObject({ id: 't:forge-hearth-a:0', x: 10, z: 20, y: 12 + 1.3 });
    expect(s[1].y).toBeCloseTo(34 + 5 + 1.5 * 2);
  });

  it('is empty for rows with no fire, an empty list or bad numbers', () => {
    expect(collectSources('t', [], () => 0)).toEqual([]);
    expect(collectSources('t', [{ id: 'oak-a', x: 1, z: 1 }], () => 0)).toEqual([]);
    expect(collectSources('t', [{ id: 'forge-hearth-a', x: 1, z: 1 }], () => Number.NaN)).toEqual([]);
  });

  it('ignores a negative dy like the placement field does', () => {
    const s = collectSources('t', [{ id: 'forge-hearth-a', x: 0, z: 0, dy: -4 }], () => 0);
    expect(s[0].y).toBeCloseTo(1.3);
  });
});

describe('assignSlots', () => {
  const ref = { x: 0, z: 0 };
  const fires = [src('a', 5, 0), src('b', 12, 0), src('c', 20, 0), src('d', 30, 0), src('far', 80, 0)];

  it('gives each slot one of the nearest fires, in range only', () => {
    const out = assignSlots(fires, ref, [null, null]);
    expect(out.map((s) => s?.id)).toEqual(['a', 'b']);
    expect(assignSlots(fires, ref, [null, null, null, null, null]).map((s) => s?.id)).toEqual(['a', 'b', 'c', 'd', undefined]);
  });

  it('is empty without slots or sources, and nothing outside LIGHT_RANGE', () => {
    expect(assignSlots(fires, ref, [])).toEqual([]);
    expect(assignSlots([], ref, [null, null])).toEqual([null, null]);
    expect(assignSlots([src('x', LIGHT_RANGE + 0.5, 0)], ref, [null])).toEqual([null]);
    expect(assignSlots([src('x', LIGHT_RANGE - 0.5, 0)], ref, [null])[0]?.id).toBe('x');
  });

  it('keeps fires apart: a cluster does not eat the whole pool', () => {
    const cluster = [src('a', 5, 0), src('a2', 5 + MIN_SPACING / 2, 0), src('a3', 5, MIN_SPACING / 2), src('z', 25, 0)];
    expect(assignSlots(cluster, ref, [null, null]).map((s) => s?.id)).toEqual(['a', 'z']);
  });

  it('hysteresis: a held fire keeps its slot against a slightly nearer one, and loses it to a much nearer one', () => {
    const held = src('held', 20, 0);
    const slightly = src('near', 20 - SWAP_MARGIN / 2, 10);
    // `near` is only a little closer than `held` (about 22 vs 20): `held` stays
    expect(assignSlots([held, slightly], ref, [held])[0]?.id).toBe('held');
    const much = src('much', 3, 0);
    expect(assignSlots([held, much], ref, [held])[0]?.id).toBe('much');
  });

  it('lets go of a held fire that walked out of range plus the margin, or that is no longer a source', () => {
    const held = src('held', LIGHT_RANGE + KEEP_MARGIN - 1, 0);
    expect(assignSlots([held], ref, [held])[0]?.id).toBe('held');
    expect(assignSlots([held], { x: -3, z: 0 }, [held])[0]).toBeNull();
    expect(assignSlots([src('other', 5, 0)], ref, [held])[0]?.id).toBe('other');
  });

  it('is deterministic and never gives one fire to two slots', () => {
    const a = assignSlots(fires, ref, [null, null, null]);
    expect(assignSlots(fires, ref, [null, null, null])).toEqual(a);
    const ids = a.filter(Boolean).map((s) => s!.id);
    expect(new Set(ids).size).toBe(ids.length);
    // two slots holding the same fire collapse to one
    const twice = assignSlots(fires, ref, [fires[0], fires[0]]);
    expect(twice.filter((s) => s?.id === 'a')).toHaveLength(1);
  });
});

describe('patchGlowMaterial', () => {
  const fakeShader = () => ({
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: 'varying vec2 vUv;\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <emissivemap_fragment>\n}',
  });

  it('injects the flicker into the emissive of a standard material and shares the uniforms', () => {
    const u = newGlowUniforms();
    const m = new THREE.MeshStandardMaterial({ emissive: 0xff6600, emissiveIntensity: 3 });
    expect(patchGlowMaterial(m, 'fire', u)).toBe(true);
    const sh = fakeShader();
    m.onBeforeCompile(sh as never, undefined as never);
    expect(sh.uniforms.uGlowTime).toBe(u.uGlowTime);
    expect(sh.uniforms.uGlowDesync).toBe(u.uGlowDesync);
    expect(sh.fragmentShader).toContain('totalEmissiveRadiance *= glowFlicker(uGlowTime + vGlowPhase * uGlowDesync);');
    expect(sh.fragmentShader).toContain('float glowFlicker');
    expect(sh.vertexShader).toContain('varying float vGlowPhase;');
    expect(sh.vertexShader).toContain('instanceMatrix[3].xz');
    expect(m.emissiveIntensity).toBe(3); // the file's own strength is untouched
  });

  it('is idempotent and tells profiles apart in the program cache key', () => {
    const u = newGlowUniforms();
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    expect(patchGlowMaterial(a, 'fire', u)).toBe(true);
    expect(patchGlowMaterial(a, 'fire', u)).toBe(false);
    patchGlowMaterial(b, 'ember', u);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).toContain('env-glow-fire');
  });

  it('leaves materials that are not standard alone (a basic or a Lambert flame)', () => {
    const u = newGlowUniforms();
    expect(patchGlowMaterial(new THREE.MeshBasicMaterial(), 'fire', u)).toBe(false);
    expect(patchGlowMaterial(new THREE.MeshLambertMaterial(), 'fire', u)).toBe(false);
  });

  it('keeps an earlier onBeforeCompile and gives everything back on unpatch', () => {
    const u = newGlowUniforms();
    const m = new THREE.MeshStandardMaterial();
    let earlier = 0;
    m.onBeforeCompile = () => void earlier++;
    const keyBefore = m.customProgramCacheKey();
    patchGlowMaterial(m, 'ember', u);
    m.onBeforeCompile(fakeShader() as never, undefined as never);
    expect(earlier).toBe(1);
    unpatchGlowMaterial(m);
    expect(m.customProgramCacheKey()).toBe(keyBefore);
    unpatchGlowMaterial(m); // twice is harmless
    expect(patchGlowMaterial(m, 'ember', u)).toBe(true);
  });
});

describe('GlowLights', () => {
  const frames = (g: GlowLights, n: number, ref = { x: 0, z: 0 }, sources: GlowSource[] = [], t0 = 0): void => {
    for (let i = 0; i < n; i++) g.update(1 / 60, t0 + i / 60, ref, sources);
  };

  it('creates the whole pool once, unshadowed and dark, and only `visible` follows the tier', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    expect(lightsIn(scene)).toHaveLength(POOL_MAX);
    for (const l of lightsIn(scene)) {
      expect(l.castShadow).toBe(false);
      expect(l.visible).toBe(false);
      expect((l as THREE.PointLight).intensity).toBe(0);
    }
    for (const tier of ['high', 'medium', 'low', 'high'] as GlowTier[]) {
      g.setTier(tier);
      expect(lightsIn(scene)).toHaveLength(POOL_MAX);
      expect(lightsIn(scene).filter((l) => l.visible)).toHaveLength(POOL_SIZE[tier]);
    }
    g.dispose();
  });

  it('never adds or removes a light over 1000 frames, tier changes and moving fires', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    const fires = [src('a', 5, 0), src('b', 15, 5), src('c', 25, -5), src('d', 60, 0)];
    const tiers: GlowTier[] = ['high', 'medium', 'low', 'medium', 'high'];
    for (let i = 0; i < 1000; i++) {
      if (i % 200 === 0) g.setTier(tiers[i / 200]);
      g.update(1 / 60, i / 60, { x: (i % 300) / 4, z: 0 }, fires);
      expect(lightsIn(scene)).toHaveLength(POOL_MAX);
    }
    g.dispose();
  });

  it('puts one light on each of the nearest fires, flickering within the fire profile, and fades in', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    g.setTier('medium');
    const fires = [src('a', 5, 0), src('b', 14, 0), src('c', 22, 0)];
    g.update(1 / 60, 0, { x: 0, z: 0 }, fires);
    const first = g.lights.filter((l) => l.visible).map((l) => l.intensity);
    expect(Math.max(...first)).toBeLessThan(GLOW['forge-hearth-a'].light!.peak * 0.3); // a fresh light starts dark and fades in
    frames(g, 40, { x: 0, z: 0 }, fires, 1);
    const lit = g.lights.filter((l) => l.visible && l.intensity > 0);
    expect(lit).toHaveLength(2);
    expect(lit.map((l) => l.position.x).sort((a, b) => a - b)).toEqual([5, 14]);
    const peak = GLOW['forge-hearth-a'].light!.peak;
    for (const l of lit) {
      expect(l.intensity).toBeGreaterThanOrEqual(peak * 0.6 - 1e-6);
      expect(l.intensity).toBeLessThanOrEqual(peak * 1.2 + 1e-6);
      expect(l.castShadow).toBe(false);
    }
    g.dispose();
  });

  it('fades a light out before it moves, so it never pops', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    g.setTier('high');
    const a = src('a', 5, 0), z = src('z', 5, 60);
    frames(g, 60, { x: 0, z: 0 }, [a, z]);
    const l = g.lights.find((x) => x.intensity > 0)!;
    expect(l.position.x).toBe(5);
    // walk to the other fire: the light must pass through (near) darkness at its old place before it appears at the new one
    let minWhileMoving = Infinity;
    let movedAt = -1;
    for (let i = 0; i < 180; i++) {
      g.update(1 / 60, 2 + i / 60, { x: 0, z: 60 }, [a, z]);
      if (l.position.z === 60 && movedAt < 0) movedAt = i;
      if (movedAt < 0) minWhileMoving = Math.min(minWhileMoving, l.intensity);
    }
    expect(movedAt).toBeGreaterThan(0);
    expect(minWhileMoving).toBeLessThan(0.05);
    expect(FADE_SECONDS).toBeLessThanOrEqual(0.5);
    expect(l.intensity).toBeGreaterThan(0.5);
    g.dispose();
  });

  it('drops to dark when no fire is in range', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    g.setTier('high');
    frames(g, 60, { x: 0, z: 0 }, [src('a', 5, 0)]);
    expect(g.counts().lit).toBe(1);
    frames(g, 60, { x: 500, z: 0 }, [src('a', 5, 0)], 2);
    expect(g.counts().lit).toBe(0);
    expect(g.counts().visible).toBe(3); // still part of the scene's light count: no shader recompile when a fire is out of range
    g.dispose();
  });

  it('low tier: no visible lights and update does nothing', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    g.setTier('low');
    frames(g, 30, { x: 0, z: 0 }, [src('a', 5, 0)]);
    expect(g.counts()).toMatchObject({ visible: 0, lit: 0 });
    g.dispose();
  });

  it('going from high to low forgets the fires, and back up starts clean', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    g.setTier('high');
    frames(g, 60, { x: 0, z: 0 }, [src('a', 5, 0)]);
    g.setTier('low');
    expect(g.lights.every((l) => l.intensity === 0 && !l.visible)).toBe(true);
    g.setTier('medium');
    expect(g.counts().lit).toBe(0);
    frames(g, 60, { x: 0, z: 0 }, [src('a', 5, 0)]);
    expect(g.counts().lit).toBe(1);
    g.dispose();
  });

  it('dispose removes every light, and later calls are harmless', () => {
    const scene = new THREE.Scene();
    const g = new GlowLights(scene);
    g.setTier('high');
    g.dispose();
    expect(lightsIn(scene)).toHaveLength(0);
    expect(() => g.update(1 / 60, 0, { x: 0, z: 0 }, [src('a', 1, 1)])).not.toThrow();
    expect(() => g.setTier('high')).not.toThrow();
    expect(g.provider.acquire()).toBeNull();
    g.dispose();
  });

  describe('the shared FireLightProvider (CrisisDressing)', () => {
    it('hands out a slot on medium and high, takes it out of the automatic pool, and takes it back on release', () => {
      const scene = new THREE.Scene();
      const g = new GlowLights(scene);
      g.setTier('medium');
      const slot = g.provider.acquire()!;
      expect(slot).not.toBeNull();
      slot.set({ x: 1, y: 2, z: 3 }, 2.2);
      const held = g.lights.find((l) => l.intensity === 2.2)!;
      expect(held.position.toArray()).toEqual([1, 2, 3]);
      // one automatic slot is left on medium: it serves only the nearest fire
      frames(g, 60, { x: 0, z: 0 }, [src('a', 5, 0), src('b', 15, 0)]);
      expect(g.counts()).toMatchObject({ reserved: 1, lit: 2 });
      expect(held.intensity).toBe(2.2);
      expect(g.lights.filter((l) => l !== held && l.intensity > 0)).toHaveLength(1);
      slot.release();
      expect(held.intensity).toBe(0);
      frames(g, 60, { x: 0, z: 0 }, [src('a', 5, 0), src('b', 15, 0)], 1);
      expect(g.counts()).toMatchObject({ reserved: 0, lit: 2 });
      g.dispose();
    });

    it('returns null on low, when the tier has no free slot, and ignores bad values and double release', () => {
      const scene = new THREE.Scene();
      const g = new GlowLights(scene);
      g.setTier('low');
      expect(g.provider.acquire()).toBeNull();
      g.setTier('medium');
      const a = g.provider.acquire()!;
      const b = g.provider.acquire()!;
      expect(g.provider.acquire()).toBeNull();
      a.set({ x: Number.NaN, y: 0, z: 0 }, 1);
      a.set({ x: 0, y: 0, z: 0 }, Number.POSITIVE_INFINITY);
      expect(g.lights.every((l) => Number.isFinite(l.intensity))).toBe(true);
      a.set({ x: 0, y: 0, z: 0 }, -3);
      expect(g.lights.every((l) => l.intensity >= 0)).toBe(true);
      a.release();
      a.release();
      a.set({ x: 9, y: 9, z: 9 }, 5); // after release a slot may not write
      expect(g.lights.some((l) => l.position.x === 9)).toBe(false);
      expect(g.provider.acquire()).not.toBeNull();
      b.release();
      g.dispose();
    });

    it('a slot held while the tier falls to low just goes dark', () => {
      const scene = new THREE.Scene();
      const g = new GlowLights(scene);
      g.setTier('high');
      const s = g.provider.acquire()!;
      s.set({ x: 0, y: 1, z: 0 }, 2);
      g.setTier('low');
      expect(g.lights.every((l) => l.intensity === 0)).toBe(true);
      expect(() => s.set({ x: 0, y: 1, z: 0 }, 2)).not.toThrow();
      expect(g.lights.every((l) => l.intensity === 0)).toBe(true);
      s.release();
      g.dispose();
    });
  });
});

// A stand-in for ModelLibrary.peek: loaded templates with the glb's material names.
function fakeLib(ids: string[]) {
  const mats = new Map<string, Record<string, THREE.MeshStandardMaterial>>();
  const peek = (id: string) => {
    const base = id.replace(/^env(-standin)?\//, '');
    if (!ids.includes(base)) return null;
    if (!mats.has(id)) {
      const names = Object.keys(GLOW[base]?.materials ?? {}).concat('Stone');
      mats.set(id, Object.fromEntries(names.map((n) => [n, Object.assign(new THREE.MeshStandardMaterial(), { name: n })])));
    }
    return { parts: Object.values(mats.get(id)!).map((material) => ({ material })) };
  };
  return { peek, mats };
}

describe('EnvGlow', () => {
  const rows: PlacementRow[] = [
    { id: 'forge-hearth-a', x: 10, z: 0 },
    { id: 'forge-hearth-a', x: 40, z: 0 },
    { id: 'brazier-standing-a', x: 12, z: 6 },
    { id: 'coal-heap-a', x: 11, z: 1 },
    { id: 'oak-a', x: 3, z: 3 },
  ];
  const make = (tier: GlowTier | undefined, ids = ['forge-hearth-a', 'brazier-standing-a', 'charcoal-clamp-a', 'coal-heap-a']) => {
    const scene = new THREE.Scene();
    const lib = fakeLib(ids);
    let t = tier;
    const registry = createGlowRegistry();
    const glow = new EnvGlow({ scene, lib, tier: () => t, heightAt: () => 0, registry });
    return { scene, lib, glow, registry, setT: (x: GlowTier) => (t = x) };
  };

  it('takes the tile fires, patches only the flickering materials, and leaves coal and stone alone', () => {
    const { glow, lib } = make('medium');
    expect(glow.addTile('t', rows)).toBe(3);
    const hearth = lib.mats.get('env/forge-hearth-a')!;
    expect(glow.counts()).toMatchObject({ sources: 3, lights: POOL_MAX, materials: 5 }); // hearth Fire, FireCore, Glow + brazier Fire, FireCore
    expect(Object.keys(hearth).sort()).toEqual(['Fire', 'FireCore', 'Glow', 'Stone']);
    expect(hearth.Stone.onBeforeCompile.toString()).toBe(new THREE.MeshStandardMaterial().onBeforeCompile.toString());
    expect(lib.mats.get('env/coal-heap-a')).toBeUndefined();
    glow.dispose();
  });

  it('re-adding a tile replaces its sources instead of doubling them, and a tile with no fires adds none', () => {
    const { glow } = make('medium');
    glow.addTile('t', rows);
    glow.addTile('t', rows);
    expect(glow.counts().sources).toBe(3);
    expect(glow.addTile('u', [{ id: 'oak-a', x: 0, z: 0 }])).toBe(0);
    expect(glow.counts().sources).toBe(3);
    glow.dispose();
  });

  it('a model that is not loaded yet (or failed) is skipped without error, and its fires still count', () => {
    const { glow } = make('medium', []);
    expect(() => glow.addTile('t', rows)).not.toThrow();
    expect(glow.counts()).toMatchObject({ sources: 3, materials: 0 });
    glow.dispose();
  });

  it('the registry (Keep-road braziers) joins the pool and leaves it again', () => {
    const { glow, registry } = make('high');
    glow.addTile('t', rows);
    const off = registry.add([{ id: 'k1', kind: 'keep-brazier', x: 500, y: 2, z: 500 }]);
    expect(glow.counts().sources).toBe(4);
    for (let i = 0; i < 90; i++) glow.update(1 / 60, { x: 500, z: 505 });
    expect(glow.counts().litLights).toBe(1);
    off();
    for (let i = 0; i < 90; i++) glow.update(1 / 60, { x: 500, z: 505 });
    expect(glow.counts()).toMatchObject({ sources: 3, litLights: 0 });
    glow.dispose();
  });

  it('drives the shared uniforms: time on medium, de-sync on high only, frozen on low', () => {
    const { glow, setT } = make('medium');
    glow.update(0.1, { x: 0, z: 0 });
    glow.update(0.1, { x: 0, z: 0 });
    expect(glow.uniforms.uGlowTime.value).toBeCloseTo(0.2);
    expect(glow.uniforms.uGlowDesync.value).toBe(0);
    setT('high');
    glow.update(0.1, { x: 0, z: 0 });
    expect(glow.uniforms.uGlowDesync.value).toBe(1);
    setT('low');
    const frozen = glow.uniforms.uGlowTime.value;
    for (let i = 0; i < 10; i++) glow.update(0.1, { x: 0, z: 0 });
    expect(glow.uniforms.uGlowTime.value).toBe(frozen);
    expect(glow.counts()).toMatchObject({ tier: 'low', visibleLights: 0 });
    glow.dispose();
  });

  it('time wraps so the shader keeps its precision, and a bad or huge dt is tamed', () => {
    const { glow } = make('medium');
    for (let i = 0; i < 1300; i++) glow.update(0.5, { x: 0, z: 0 });
    expect(glow.uniforms.uGlowTime.value).toBeLessThan(TIME_WRAP);
    const before = glow.uniforms.uGlowTime.value;
    glow.update(Number.NaN, { x: 0, z: 0 });
    glow.update(-5, { x: 0, z: 0 });
    expect(glow.uniforms.uGlowTime.value).toBe(before);
    glow.update(1e9, { x: 0, z: 0 });
    expect(Number.isFinite(glow.uniforms.uGlowTime.value)).toBe(true);
    glow.dispose();
  });

  it('a quality change toggles visibility only: the light count in the scene never changes over 1000 frames', () => {
    const { scene, glow, setT } = make('high');
    glow.addTile('t', rows);
    const tiers: GlowTier[] = ['high', 'medium', 'low', 'high', 'medium'];
    for (let i = 0; i < 1000; i++) {
      if (i % 200 === 0) setT(tiers[i / 200]);
      glow.update(1 / 60, { x: 10 + (i % 50) / 10, z: 0 });
      expect(lightsIn(scene)).toHaveLength(POOL_MAX);
    }
    glow.dispose();
  });

  it('an undefined quality service means medium', () => {
    const { glow } = make(undefined);
    expect(glow.counts().tier).toBe('medium');
    expect(glow.counts().visibleLights).toBe(2);
    glow.dispose();
  });

  it('dispose takes every light out of the scene and puts the materials back', () => {
    const { scene, glow, lib } = make('high');
    glow.addTile('t', rows);
    const fire = lib.mats.get('env/forge-hearth-a')!.Fire;
    const key = fire.customProgramCacheKey();
    expect(key).toContain('env-glow');
    glow.dispose();
    expect(lightsIn(scene)).toHaveLength(0);
    expect(fire.customProgramCacheKey()).not.toContain('env-glow');
    expect(glow.addTile('t', rows)).toBe(0);
    expect(() => glow.update(1 / 60, { x: 0, z: 0 })).not.toThrow();
    glow.dispose();
  });

  it('exposes the tutorial provider, sharing the pool', () => {
    const { glow } = make('medium');
    const slot = glow.fireLights.acquire()!;
    expect(glow.counts().reserved).toBe(1);
    slot.release();
    expect(glow.counts().reserved).toBe(0);
    glow.dispose();
  });
});

describe('env plugin glow wiring', () => {
  const tick = () => new Promise((r) => setTimeout(r, 60));
  const rows = { t: [{ id: 'forge-hearth-a', x: 5, z: 5 }, { id: 'brazier-standing-a', x: 9, z: 5 }, { id: 'oak-b', x: 1, z: 1 }] as PlacementRow[] };

  it('creates the pool once with the plugin, reports the fires and runs on the render system', async () => {
    const fc = createFakeCore();
    fc.services.set('quality', { step: 'high' });
    const plugin = createEnvPlugin({ tiles: rows, heightAt: () => 0 });
    plugin.setup(fc.ctx);
    await tick();
    const env = fc.ctx.services.get('env')!;
    expect(lightsIn(fc.scene).filter((l) => l.name === 'env.glow')).toHaveLength(POOL_MAX);
    expect(env.glow()).toMatchObject({ tier: 'high', lights: POOL_MAX, visibleLights: 3, sources: 2 });
    const system = fc.systems.get('env.update')!;
    for (let i = 0; i < 120; i++) system.render!(0, 1 / 60, fc.ctx as never);
    expect(lightsIn(fc.scene).filter((l) => l.name === 'env.glow')).toHaveLength(POOL_MAX);
    expect(env.fireLights.acquire()).not.toBeNull();
    plugin.dispose?.();
    expect(lightsIn(fc.scene)).toHaveLength(0);
  });

  it('a quality drop to low switches the lights off without removing any', async () => {
    const fc = createFakeCore();
    const q = { step: 'medium' };
    fc.services.set('quality', q);
    const plugin = createEnvPlugin({ tiles: rows, heightAt: () => 0 });
    plugin.setup(fc.ctx);
    await tick();
    const system = fc.systems.get('env.update')!;
    q.step = 'low';
    system.render!(0, 1 / 60, fc.ctx as never);
    const lights = lightsIn(fc.scene).filter((l) => l.name === 'env.glow');
    expect(lights).toHaveLength(POOL_MAX);
    expect(lights.every((l) => !l.visible)).toBe(true);
    expect(fc.ctx.services.get('env')!.fireLights.acquire()).toBeNull();
    plugin.dispose?.();
  });

  it('?env=off creates no glow, no lights and no system', () => {
    const fc = createFakeCore();
    const real = (globalThis as { location?: unknown }).location;
    (globalThis as { location?: unknown }).location = { search: '?env=off' };
    try {
      const plugin = createEnvPlugin({ tiles: rows, heightAt: () => 0 });
      plugin.setup(fc.ctx);
      expect(lightsIn(fc.scene)).toHaveLength(0);
      expect(fc.ctx.services.get('env')).toBeUndefined();
      expect(fc.systems.has('env.update')).toBe(false);
      plugin.dispose?.();
    } finally {
      (globalThis as { location?: unknown }).location = real;
    }
  });
});
