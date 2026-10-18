import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CompanionFigure } from './CompanionFigure';
import { TOBB_CLOAK_COLOUR, applyTobbCloak, buildLute, disposeLute } from './tobbLook';
import type { NpcModelLoader } from '../npcs/types';

const matOf = (o: THREE.Object3D | undefined) => (o as THREE.Mesh).material as THREE.MeshStandardMaterial;

function rig() {
  const shared = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const root = new THREE.Group();
  const cape = new THREE.Mesh(geo, shared);
  cape.name = 'Rogue_Cape';
  const body = new THREE.Mesh(geo, shared);
  body.name = 'Rogue_Body';
  const other = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x123456 }));
  other.name = 'Rogue_Head';
  root.add(cape, body, other);
  return { root, cape, body, other, shared, geo };
}

describe('applyTobbCloak', () => {
  it('tints only the cape, on its own cloned material', () => {
    const { root, cape, body, other, shared } = rig();
    const bodyMat = body.material;
    const otherMat = other.material as THREE.MeshStandardMaterial;
    expect(applyTobbCloak(root)).toBe(true);
    expect(cape.material).not.toBe(shared);
    expect(matOf(cape).color.getHex()).toBe(TOBB_CLOAK_COLOUR);
    expect(body.material).toBe(bodyMat);
    expect(matOf(body).color.getHex()).toBe(0xffffff);
    expect(other.material).toBe(otherMat);
    expect(otherMat.color.getHex()).toBe(0x123456);
  });
  it('disposes the material it replaced', () => {
    const { root, shared } = rig();
    const spy = vi.spyOn(shared, 'dispose');
    applyTobbCloak(root);
    expect(spy).toHaveBeenCalled();
  });
  it('returns false and changes nothing with no cape', () => {
    const { root, cape, body } = rig();
    cape.name = 'Rogue_Hood';
    const before = [cape.material, body.material];
    expect(applyTobbCloak(root)).toBe(false);
    expect([cape.material, body.material]).toEqual(before);
    expect(matOf(cape).color.getHex()).toBe(0xffffff);
  });
  it('returns false for an empty object', () => {
    expect(applyTobbCloak(new THREE.Group())).toBe(false);
  });
  it('returns false for a cape node that holds no mesh', () => {
    const g = new THREE.Group();
    const n = new THREE.Group();
    n.name = 'Rogue_Cape';
    g.add(n);
    expect(applyTobbCloak(g)).toBe(false);
  });
  it('tints meshes under a cape group, and every slot of a material array', () => {
    const g = new THREE.Group();
    const cape = new THREE.Group();
    cape.name = 'Rogue_Cape';
    const m1 = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const m2 = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [m1, m2]);
    cape.add(mesh);
    g.add(cape);
    expect(applyTobbCloak(g)).toBe(true);
    const mats = mesh.material as THREE.MeshStandardMaterial[];
    expect(mats).toHaveLength(2);
    expect(mats.map((m) => m.color.getHex())).toEqual([TOBB_CLOAK_COLOUR, TOBB_CLOAK_COLOUR]);
    expect(mats[0]).not.toBe(m1);
  });
  it('copes with a material that has no colour', () => {
    const g = new THREE.Group();
    const cape = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial());
    cape.name = 'Rogue_Cape';
    g.add(cape);
    expect(applyTobbCloak(g)).toBe(true);
  });
});

describe('buildLute / disposeLute', () => {
  it('builds a named group of meshes on the back', () => {
    const lute = buildLute();
    expect(lute.name).toBe('tobb-lute');
    const meshes: THREE.Mesh[] = [];
    lute.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    expect(meshes.length).toBe(3);
    expect(lute.position.z).toBeGreaterThan(0); // +Z is behind a figure facing -Z
  });
  it('disposeLute disposes every geometry and each material once', () => {
    const lute = buildLute();
    const meshes: THREE.Mesh[] = [];
    lute.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    const geoSpies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'));
    const mats = new Set(meshes.map((m) => m.material as THREE.Material));
    const matSpies = [...mats].map((m) => vi.spyOn(m, 'dispose'));
    disposeLute(lute);
    geoSpies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    expect(mats.size).toBe(2);
    matSpies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });
  it('disposeLute tolerates an object with no meshes', () => {
    expect(() => disposeLute(new THREE.Group())).not.toThrow();
  });
  it('each lute is independent', () => {
    expect(buildLute()).not.toBe(buildLute());
  });
});

function loaderOf(over: Partial<NpcModelLoader> = {}) {
  const loads: string[] = [];
  const loader: NpcModelLoader = {
    load: async (id) => void loads.push(id),
    instantiate: () => rig().root,
    animations: () => ['Idle', 'Walking_A', 'Running_A'].map((n) => new THREE.AnimationClip(n, 1, [])),
    ...over,
  };
  return { loader, loads };
}

const currentClip = (f: CompanionFigure): string | undefined =>
  (f as unknown as { current: THREE.AnimationAction | null }).current?.getClip().name;

describe('CompanionFigure', () => {
  it('starts with a placeholder and a lute', () => {
    const f = new CompanionFigure();
    expect(f.hasModel).toBe(false);
    expect(f.root.name).toBe('companion:tobb');
    expect(f.root.children.length).toBe(2);
    expect(f.root.getObjectByName('tobb-lute')).toBeDefined();
  });
  it('load(undefined) and load(null) keep the placeholder', async () => {
    const f = new CompanionFigure();
    await f.load(undefined);
    await f.load(null);
    expect(f.hasModel).toBe(false);
    expect(f.root.children.length).toBe(2);
  });
  it('a rejecting loader keeps the placeholder and calls warn', async () => {
    const f = new CompanionFigure();
    const warn = vi.fn();
    await expect(f.load(loaderOf({ load: async () => Promise.reject(new Error('boom')) }).loader, warn)).resolves.toBeUndefined();
    expect(f.hasModel).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('boom');
    expect(f.root.children.length).toBe(2);
  });
  it('a non-Error rejection is reported too', async () => {
    const f = new CompanionFigure();
    const warn = vi.fn();
    await f.load(loaderOf({ load: () => Promise.reject('nope') }).loader, warn);
    expect(warn.mock.calls[0][0]).toContain('nope');
  });
  it('an instantiate that throws keeps the placeholder', async () => {
    const f = new CompanionFigure();
    const warn = vi.fn();
    await f.load(
      loaderOf({
        instantiate: () => {
          throw new Error('bad glb');
        },
      }).loader,
      warn,
    );
    expect(f.hasModel).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('a good loader swaps in the model with a green cape', async () => {
    const f = new CompanionFigure();
    const { loader, loads } = loaderOf();
    const warn = vi.fn();
    await f.load(loader, warn);
    expect(loads).toEqual(['rogueHooded']);
    expect(warn).not.toHaveBeenCalled();
    expect(f.hasModel).toBe(true);
    expect(f.root.children.length).toBe(2); // model + lute; the placeholder is gone
    expect(matOf(f.root.getObjectByName('Rogue_Cape')).color.getHex()).toBe(TOBB_CLOAK_COLOUR);
    expect(matOf(f.root.getObjectByName('Rogue_Body')).color.getHex()).toBe(0xffffff);
    expect(currentClip(f)).toBe('Idle');
  });
  it('a model with no cape still loads', async () => {
    const f = new CompanionFigure();
    await f.load(loaderOf({ instantiate: () => new THREE.Group() }).loader, vi.fn());
    expect(f.hasModel).toBe(true);
  });
  it('setGait plays Walking_A for walk and Running_A for run and sprint', async () => {
    const f = new CompanionFigure();
    await f.load(loaderOf().loader);
    f.setGait('walk');
    expect(currentClip(f)).toBe('Walking_A');
    f.setGait('run');
    expect(currentClip(f)).toBe('Running_A');
    f.setGait('sprint');
    expect(currentClip(f)).toBe('Running_A');
    f.setGait('idle');
    expect(currentClip(f)).toBe('Idle');
  });
  it('a gait set before the model loads is applied on load', async () => {
    const f = new CompanionFigure();
    f.setGait('run');
    await f.load(loaderOf().loader);
    expect(currentClip(f)).toBe('Running_A');
  });
  it('setGait before any model is harmless, and missing clips are tolerated', async () => {
    const f = new CompanionFigure();
    expect(() => f.setGait('walk')).not.toThrow();
    await f.load(loaderOf({ animations: () => [new THREE.AnimationClip('Idle', 1, [])] }).loader);
    expect(() => f.setGait('walk')).not.toThrow();
    expect(() => f.setGait('idle')).not.toThrow();
    expect(currentClip(f)).toBe('Idle');
  });
  it('update ignores dt <= 0 and works with or without a model', async () => {
    const f = new CompanionFigure();
    expect(() => f.update(0.1)).not.toThrow();
    await f.load(loaderOf().loader);
    expect(() => {
      f.update(-1);
      f.update(0);
      f.update(0.1);
    }).not.toThrow();
  });
  it('dispose after load is safe, repeatable, and removes root from its parent', async () => {
    const parent = new THREE.Group();
    const f = new CompanionFigure();
    parent.add(f.root);
    await f.load(loaderOf().loader);
    f.dispose();
    expect(f.root.parent).toBeNull();
    expect(parent.children.length).toBe(0);
    expect(f.root.children.length).toBe(0);
    expect(() => f.dispose()).not.toThrow();
  });
  it('dispose with only the placeholder is safe too', () => {
    const parent = new THREE.Group();
    const f = new CompanionFigure();
    parent.add(f.root);
    expect(() => f.dispose()).not.toThrow();
    expect(f.root.parent).toBeNull();
  });
  it('load after dispose does nothing', async () => {
    const f = new CompanionFigure();
    f.dispose();
    const { loader, loads } = loaderOf();
    await f.load(loader);
    expect(f.hasModel).toBe(false);
    expect(loads).toEqual([]);
    expect(f.root.children.length).toBe(0);
  });
  it('disposing while a load is in flight keeps the placeholder state and attaches nothing', async () => {
    const f = new CompanionFigure();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = f.load(loaderOf({ load: () => gate }).loader);
    f.dispose();
    release();
    await p;
    expect(f.hasModel).toBe(false);
    expect(f.root.children.length).toBe(0);
  });
  it('setGait and update after dispose do not throw', async () => {
    const f = new CompanionFigure();
    await f.load(loaderOf().loader);
    f.dispose();
    expect(() => {
      f.setGait('run');
      f.update(0.1);
    }).not.toThrow();
  });
});
