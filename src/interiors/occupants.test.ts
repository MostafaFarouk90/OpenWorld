import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OccupantHider } from './occupants';

const inside = (at: { x: number; y: number }) => (at.y > 100 ? (at.x < 50 ? 'keep-hall' : 'archive') : null);
const actor = (x: number, y: number) => {
  const root = new THREE.Group();
  root.position.set(x, y, 0);
  root.updateMatrixWorld();
  return { root };
};

describe('OccupantHider', () => {
  it('hides actors in an interior the player is not in and shows them when the player is there', () => {
    const h = new OccupantHider();
    const edric = actor(0, 150);
    const farmer = actor(0, 0);
    h.update([edric, farmer], null, inside);
    expect(edric.root.visible).toBe(false);
    expect(farmer.root.visible).toBe(true);
    h.update([edric, farmer], 'keep-hall', inside);
    expect(edric.root.visible).toBe(true);
    h.update([edric, farmer], 'archive', inside);
    expect(edric.root.visible).toBe(false);
  });

  it('re-asserts every frame against another writer', () => {
    const h = new OccupantHider();
    const tobb = actor(0, 150);
    h.update([tobb], null, inside);
    tobb.root.visible = true; // the companion's applyPose
    h.update([tobb], null, inside);
    expect(tobb.root.visible).toBe(false);
  });

  it('never shows an actor someone else hid', () => {
    const h = new OccupantHider();
    const ghost = actor(0, 0);
    ghost.root.visible = false;
    h.update([ghost], 'keep-hall', inside);
    expect(ghost.root.visible).toBe(false);
  });

  it('does not adopt a root that is already hidden inside another interior, so its owner keeps it', () => {
    const h = new OccupantHider();
    const waiting = actor(0, 150);
    waiting.root.visible = false; // hidden by its own system
    h.update([waiting], null, inside);
    expect(h.size).toBe(0);
    h.update([waiting], 'keep-hall', inside);
    expect(waiting.root.visible).toBe(false);
  });

  it('skips the player and actors with no root, forgets despawned actors, and shows its own on dispose', () => {
    const h = new OccupantHider();
    const player = actor(0, 150);
    const guard = actor(0, 150);
    h.update([player, guard, { root: null }], null, inside, (a) => a === player);
    expect(player.root.visible).toBe(true);
    expect(h.size).toBe(1);
    h.update([], null, inside);
    expect(h.size).toBe(0);
    guard.root.visible = true; // spawned again
    h.update([guard], null, inside);
    h.dispose();
    expect(guard.root.visible).toBe(true);
  });
});
