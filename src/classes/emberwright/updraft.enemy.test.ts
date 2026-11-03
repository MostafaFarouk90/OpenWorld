// Updraft's stun against a real Enemy: does the enemy brain honour the `stun` status kind that the skill applies? The status
// engine writes `actor.data['status']` ({ stunned, stunRemaining, slow }) and `Enemy.think` reads it (enemies/Enemy.ts:612-614),
// which staggers the brain for the stun (Brain.stunned, enemies/ai/Brain.ts:388-391). These tests drive that whole chain.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../../enemies/EnemyManager';
import { FakeHost, loadKnight } from '../../enemies/testing/fakeHost';
import { AI } from '../../enemies/tuning';
import { StatusEngine } from '../../status/StatusEngine';
import { STATUS_DATA_KEY } from '../../status/view';
import { UPDRAFT } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: Awaited<ReturnType<typeof loadKnight>>;
beforeAll(async () => {
  gltf = await loadKnight();
});
beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

/** One chasing soldier at the origin and the player `playerZ` metres away, with a real status engine feeding `actor.data.status`. */
function rig(playerZ: number) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: playerZ } });
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 5, spawners: [] });
  const engine = new StatusEngine({
    actor: (id) => fake.actorMap.get(id) as never,
    tick: () => true,
    applied: () => {},
    expired: () => {},
    view: (id, view) => {
      const a = fake.actorMap.get(id);
      if (!a) return;
      if (view) a.data[STATUS_DATA_KEY] = view;
      else delete a.data[STATUS_DATA_KEY];
    },
  });
  const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: true, aggro: true })!;
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      engine.update(DT);
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const pos = () => {
    const p = fake.actorMap.get(id)!.root!.position;
    return { x: p.x, z: p.z };
  };
  const stun = () => engine.apply(id, { id: UPDRAFT.stunId, kind: 'stun', seconds: UPDRAFT.stunSeconds, sourceId: 'player' });
  /** Swings the foe started (its telegraphs) and hits it landed on the player. */
  const swings = () => fake.bus.of('telegraph').filter((e) => e.actorId === id).length;
  const hits = () => fake.bus.of('damage.dealt').filter((d) => d.attackerId === id).length;
  return { fake, m, id, engine, tick, pos, stun, swings, hits };
}
const moved = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('a stunned real Enemy (the kind Updraft applies)', () => {
  it('does not move for the stun, and walks again afterwards', () => {
    const control = rig(-12);
    control.tick(0.5);
    const c0 = control.pos();
    control.tick(1.2);
    expect(moved(c0, control.pos())).toBeGreaterThan(1);

    const t = rig(-12);
    t.tick(0.5);
    expect(t.stun()).toBe(true);
    t.tick(DT * 3);
    const p0 = t.pos();
    t.tick(1.3);
    expect(moved(p0, t.pos())).toBeLessThan(0.05);
    t.tick(0.6); // stun over (1.5 s), the stagger it held is over
    t.tick(1.2);
    expect(moved(p0, t.pos())).toBeGreaterThan(1);
  });

  it('does not attack for the stun: a foe in reach that swings at the player when free starts and lands nothing while stunned', () => {
    const control = rig(-1.6);
    control.tick(AI.riseSeconds + 1.4);
    expect(control.swings()).toBeGreaterThan(0);

    const t = rig(-1.6);
    t.tick(AI.riseSeconds);
    const before = { swings: t.swings(), hits: t.hits() };
    t.stun();
    t.tick(1.4);
    expect(t.swings()).toBe(before.swings);
    expect(t.hits()).toBe(before.hits);
    t.tick(3);
    expect(t.swings()).toBeGreaterThan(before.swings); // and it fights again afterwards
  });

  it('the status engine really sets the view the enemy reads, and clears it when the stun lapses', () => {
    const t = rig(-12);
    t.tick(0.1);
    t.stun();
    t.tick(DT * 2);
    expect(t.fake.actorMap.get(t.id)!.data[STATUS_DATA_KEY]).toMatchObject({ stunned: true });
    t.tick(1.6);
    expect(t.fake.actorMap.get(t.id)!.data[STATUS_DATA_KEY]).toBeUndefined();
  });

  it('the poise hit and the stun together (what Updraft does): the stagger recoil settles, then it is held for the whole 1.5 s stun (the 0.7 s break stagger alone would be over), and is free again soon after', () => {
    const t = rig(-12);
    t.tick(0.5);
    t.fake.apply({ attackerId: 'player', targetId: t.id, amount: 0, poise: UPDRAFT.poise, kind: 'spell', attackId: UPDRAFT.attackId } as never);
    t.stun();
    t.tick(0.3); // the stagger's own recoil slide
    const p0 = t.pos();
    t.tick(1.0);
    expect(moved(p0, t.pos())).toBeLessThan(0.05);
    expect(t.m.get(t.id)!.state).toBe('stagger');
    // Brain.stagger restarts the stagger clock on every stun refresh, so the break stagger's remainder runs on after the stun lapses: at most about the break stagger again.
    t.tick(2.5);
    expect(t.m.get(t.id)!.state).not.toBe('stagger');
    const control = rig(-12);
    control.tick(0.5);
    control.fake.apply({ attackerId: 'player', targetId: control.id, amount: 0, poise: UPDRAFT.poise, kind: 'spell', attackId: UPDRAFT.attackId } as never);
    control.tick(1.3);
    expect(control.m.get(control.id)!.state).not.toBe('stagger'); // without the stun the break stagger is over by 1.3 s
  });
});
