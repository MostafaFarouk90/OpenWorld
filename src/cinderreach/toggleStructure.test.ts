import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { ToggleStructure } from './toggleStructure';
import { CINDERREACH_TOGGLES } from './toggles';
import { registerCinderKinds } from './structureKinds';

let physics: PhysicsWorld;
let unregister: () => void;
beforeAll(async () => {
  unregister = registerCinderKinds();
  physics = new PhysicsWorld();
  await physics.init();
});

afterAll(() => unregister());

const flat = () => 10;
function make(id: string) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  const def = CINDERREACH_TOGGLES.find((t) => t.id === id)!;
  const deps = { ...fc.ctx, rapier: physics.rapier };
  return { fc, toggle: new ToggleStructure(deps, def.spec, flat), def };
}

describe('ToggleStructure', () => {
  it('adds a mesh and a collider when shown (solid) and removes both when hidden', () => {
    const { fc, toggle } = make('boarded-well');
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    toggle.setVisible(true);
    expect(toggle.visible).toBe(true);
    expect(fc.colliders.size).toBe(1);
    expect(fc.scene.children).toContain(toggle.root);
    toggle.setVisible(true);
    expect(fc.colliders.size).toBe(1);
    toggle.setVisible(false);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('is visual only for an open spec', () => {
    const { fc, toggle } = make('well-blight');
    toggle.setVisible(true);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toContain(toggle.root);
  });

  it('frees everything on dispose and ignores later calls', () => {
    const { fc, toggle } = make('boarded-well');
    toggle.setVisible(true);
    toggle.dispose();
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    toggle.setVisible(true);
    toggle.setArt(new THREE.Group());
    expect(fc.colliders.size).toBe(0);
    expect(() => toggle.dispose()).not.toThrow();
  });

  it('swaps in art, ignoring null', () => {
    const { toggle } = make('den-marker');
    const art = new THREE.Group();
    toggle.setArt(null);
    toggle.setArt(art);
    expect(toggle.root.children).toContain(art);
  });

  it('registers its kinds with a refcount: two plugins in one session do not throw, the last one unregisters', () => {
    const a = registerCinderKinds();
    const b = registerCinderKinds();
    a();
    expect(() => registerCinderKinds()()).not.toThrow();
    b();
  });
});
