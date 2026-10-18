import { describe, expect, it } from 'vitest';
import type { HurtboxSet } from '../combat/HurtboxSet';
import {
  COLLAPSE_SECONDS, TOLL_POST_BROKEN_FLAG, TOLL_POST_DEFS, TOLL_POST_HEALTH, TOLL_POST_HEAVY_ATTACKS, TOLL_POST_KIND, TOLL_POST_SPAWN_TAG,
  spawnTollPost, type TollPostDeps,
} from './tollPost';
import { createFakeCore } from './testing/fakeCore';

const anchor = { position: { x: -412, y: -1.6, z: -150 }, yaw: Math.PI / 2 };

function setup(opts: { broken?: boolean } = {}) {
  const fc = createFakeCore();
  const t = spawnTollPost(fc.ctx as unknown as TollPostDeps, anchor, opts);
  return { fc, t };
}
const collapse = (fc: ReturnType<typeof createFakeCore>, seconds = COLLAPSE_SECONDS + 0.1) => {
  for (let s = 0; s < seconds; s += 1 / 60) fc.tick('animation', 1 / 60);
};
/** Runs the registered modifier on a request, as the damage pipeline would. */
function hit(fc: ReturnType<typeof createFakeCore>, targetId: string, attackId: string | undefined) {
  const req = { targetId, attackId, outcome: 'hit' as string };
  for (const m of fc.modifiers.values()) m(req, { id: targetId }, null);
  return req.outcome;
}

describe('spawnTollPost', () => {
  it('spawns a neutral mortal actor with the kind and spawn tag the quest filters on', () => {
    const { fc, t } = setup();
    expect(t.actor).toMatchObject({ kind: TOLL_POST_KIND, team: 'neutral', hittable: true, immortal: false });
    expect(t.actor!.data['audio']).toEqual({ material: 'wood' });
    expect(TOLL_POST_SPAWN_TAG).toBe('ford.toll-post');
    expect(TOLL_POST_HEALTH).toBeGreaterThan(0);
    expect(fc.scene.children).toContain(t.root);
    expect(t.root.position.toArray()).toEqual([-412, -1.6, -150]);
  });

  it('is neutral so killing it pays no XP (Progression pays only hostile kills)', () => {
    expect(setup().t.actor!.team).not.toBe('hostile');
  });

  it('gives the post, the other post and the bar a hurtbox each', () => {
    const { fc } = setup();
    const hb = fc.targets[0] as HurtboxSet;
    expect(hb.count).toBe(TOLL_POST_DEFS.length);
    expect(hb.missing).toEqual([]);
  });

  it('turns every attack but a heavy one into immune, and lets heavy ones through', () => {
    const { fc, t } = setup();
    const id = t.actor!.id;
    expect(hit(fc, id, '1H_Melee_Attack_Slice')).toBe('immune');
    expect(hit(fc, id, '1H_Melee_Attack_Stab')).toBe('immune');
    expect(hit(fc, id, undefined)).toBe('immune');
    for (const a of TOLL_POST_HEAVY_ATTACKS) expect(hit(fc, id, a)).toBe('hit');
  });

  it('leaves other targets, and requests that are already not hits, alone', () => {
    const { fc } = setup();
    expect(hit(fc, 'someone-else', '1H_Melee_Attack_Slice')).toBe('hit');
    const blocked = { targetId: [...fc.actors.keys()][0], attackId: 'x', outcome: 'blocked' };
    for (const m of fc.modifiers.values()) m(blocked, { id: blocked.targetId }, null);
    expect(blocked.outcome).toBe('blocked');
  });

  it('breaks on actor.died: sets the flag, drops the hurtboxes and the modifier, collapses, then despawns the actor', () => {
    const { fc, t } = setup();
    const id = t.actor!.id;
    fc.fire('actor.died', { actorId: id });
    expect(fc.flags.get(TOLL_POST_BROKEN_FLAG)).toBe(true);
    expect(fc.targets).toHaveLength(0);
    expect(fc.modifiers.size).toBe(0);
    expect(fc.actors.has(id)).toBe(true);
    collapse(fc);
    expect(fc.actors.has(id)).toBe(false);
    expect(fc.systems.size).toBe(0);
    expect(fc.scene.children).toContain(t.root); // the toppled posts stay
    const rig = t.root.getObjectByName('tp-rig')!;
    expect(rig.rotation.z).toBeGreaterThan(0.5);
  });

  it('ignores the death of another actor, and a second death of its own', () => {
    const { fc, t } = setup();
    fc.fire('actor.died', { actorId: 'other' });
    expect(fc.flags.has(TOLL_POST_BROKEN_FLAG)).toBe(false);
    fc.fire('actor.died', { actorId: t.actor!.id });
    fc.fire('actor.died', { actorId: t.actor!.id });
    collapse(fc);
    expect(fc.systems.size).toBe(0);
  });

  it('spawns already broken when the save says so: toppled debris, no actor, no target, no modifier', () => {
    const { fc, t } = setup({ broken: true });
    expect(t.actor).toBeNull();
    expect(fc.actors.size).toBe(0);
    expect(fc.targets).toHaveLength(0);
    expect(fc.modifiers.size).toBe(0);
    expect(t.root.getObjectByName('tp-rig')!.rotation.z).toBeGreaterThan(0.5);
  });

  it('dispose removes the actor, target, modifier, system and scene node, and is safe twice', () => {
    const { fc, t } = setup();
    t.dispose();
    t.dispose();
    expect(fc.actors.size).toBe(0);
    expect(fc.targets).toHaveLength(0);
    expect(fc.modifiers.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('dispose in the middle of the collapse leaves no system behind', () => {
    const { fc, t } = setup();
    fc.fire('actor.died', { actorId: t.actor!.id });
    collapse(fc, 0.2);
    t.dispose();
    expect(fc.systems.size).toBe(0);
    expect(fc.actors.size).toBe(0);
  });

  it('two posts can coexist (a reload before the old one is gone): modifier ids are per actor', () => {
    const fc = createFakeCore();
    const a = spawnTollPost(fc.ctx as unknown as TollPostDeps, anchor);
    expect(() => spawnTollPost(fc.ctx as unknown as TollPostDeps, anchor)).not.toThrow();
    a.dispose();
  });
});
