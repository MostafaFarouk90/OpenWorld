import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HurtboxSet } from '../combat/HurtboxSet';
import { SCARECROW_DEFS, TOPPLE_SECONDS, spawnScarecrow, type ScarecrowDeps } from './scarecrow';
import { createFakeCore } from './testing/fakeCore';

const anchor = { position: { x: 3, y: 2, z: 27 }, yaw: 0 };

function setup() {
  const fc = createFakeCore();
  const removed: unknown[] = [];
  const combat = {
    addTarget: (set: unknown, actorId?: string) => {
      const off = fc.ctx.combat.addTarget(set as HurtboxSet, actorId);
      return () => {
        removed.push(set);
        off();
      };
    },
  };
  const deps = { ...fc.ctx, combat } as unknown as ScarecrowDeps;
  const s = spawnScarecrow(deps, anchor, () => 2);
  return { fc, s, removed };
}
const runTopple = (fc: ReturnType<typeof createFakeCore>, seconds = TOPPLE_SECONDS + 0.1): void => {
  for (let t = 0; t < seconds; t += 1 / 60) fc.tick('animation', 1 / 60);
};

describe('spawnScarecrow', () => {
  it('tags the actor with the straw audio material', () => {
    expect(setup().s.actor.data['audio']).toEqual({ material: 'straw' });
  });

  it('spawns a neutral mortal hittable actor on the terrain with four hurtboxes', () => {
    const { fc, s } = setup();
    expect(s.actor.kind).toBe('scarecrow');
    expect(s.actor.team).toBe('neutral');
    expect(s.actor.hittable).toBe(true);
    expect(s.actor.immortal).toBe(false);
    expect(s.root.position.toArray()).toEqual([3, 2, 27]);
    expect(fc.scene.children).toContain(s.root);
    expect(fc.targets).toHaveLength(1);
    const hb = fc.targets[0] as HurtboxSet;
    expect(hb.count).toBe(SCARECROW_DEFS.length);
    expect(hb.missing).toEqual([]);
    expect(hb.capsules.map((c) => c.name).sort()).toEqual(['armL', 'armR', 'head', 'torso']);
  });

  it('hurtboxes sit where a sword would hit (head above torso, near the root)', () => {
    const { fc } = setup();
    const caps = (fc.targets[0] as HurtboxSet).capsules;
    const head = caps.find((c) => c.name === 'head')!;
    expect(head.a.y).toBeGreaterThan(3.5);
    expect(head.a.x).toBeCloseTo(3);
  });

  it('topples on actor.died, then despawns the actor and removes the hurtboxes', () => {
    const { fc, s, removed } = setup();
    fc.fire('actor.died', { actorId: s.actor.id });
    expect(removed).toHaveLength(1);
    expect(fc.systems.size).toBe(1);
    const sys = [...fc.systems.values()][0];
    expect(sys.fixedPhase).toBe('animation');
    expect(sys.order).toBe(160);
    const rig = s.root.getObjectByName('sc-rig')!;
    runTopple(fc, TOPPLE_SECONDS / 2);
    expect(rig.rotation.x).toBeGreaterThan(0);
    expect(rig.rotation.x).toBeLessThan(Math.PI / 2);
    expect(fc.actors.has(s.actor.id)).toBe(true);
    runTopple(fc, TOPPLE_SECONDS);
    expect(rig.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(fc.actors.has(s.actor.id)).toBe(false);
    expect(fc.systems.size).toBe(0);
    expect(fc.scene.children).toContain(s.root); // toppled mesh stays
  });

  it('ignores other actors and a second died event for the same id', () => {
    const { fc, s, removed } = setup();
    fc.fire('actor.died', { actorId: 'someone-else' });
    fc.fire('actor.died', undefined);
    expect(fc.systems.size).toBe(0);
    fc.fire('actor.died', { actorId: s.actor.id });
    fc.fire('actor.died', { actorId: s.actor.id });
    expect(fc.systems.size).toBe(1);
    expect(removed).toHaveLength(1);
    runTopple(fc);
    fc.fire('actor.died', { actorId: s.actor.id });
    expect(fc.systems.size).toBe(0);
  });

  it('dispose mid-topple removes everything and is idempotent', () => {
    const { fc, s } = setup();
    fc.fire('actor.died', { actorId: s.actor.id });
    s.dispose();
    s.dispose();
    expect(fc.systems.size).toBe(0);
    expect(fc.actors.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    fc.fire('actor.died', { actorId: s.actor.id });
    expect(fc.systems.size).toBe(0);
  });

  it('dispose while alive removes the target, actor and mesh and ignores later deaths', () => {
    const { fc, s, removed } = setup();
    s.dispose();
    s.dispose();
    expect(removed).toHaveLength(1); // the remover runs exactly once
    expect(fc.targets).toHaveLength(0);
    expect(fc.actors.size).toBe(0);
    fc.fire('actor.died', { actorId: s.actor.id });
    expect(fc.systems.size).toBe(0);
  });

  it('a failing combat.addTarget cleans up and rethrows', () => {
    const fc = createFakeCore();
    const deps = { ...fc.ctx, combat: { addTarget: () => { throw new Error('nope'); } } } as unknown as ScarecrowDeps;
    expect(() => spawnScarecrow(deps, anchor, () => 0)).toThrow('nope');
    expect(fc.actors.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('HurtboxSet really accepts the rig (no missing bones) for a bare rig', () => {
    const root = new THREE.Group();
    expect(new HurtboxSet(root, SCARECROW_DEFS, root).missing).toHaveLength(4);
  });
});
