import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeActor, FakeActors } from '../../spells/testHost';
import { BoulderShoulder } from './BoulderShoulder';
import { BOULDER, SKILL_IDS } from './tuning';

function rig() {
  const player = new FakeActor('player', 'player', 0, 0);
  const actors = new FakeActors(player);
  const applied: any[] = [];
  const holds: Array<{ x: number; z: number; speed: number } | null> = [];
  const st = { blocked: null as string | null, clip: true, interrupted: false, yaw: 0, feet: { x: 0, y: 0, z: 0 } };
  const clips: string[] = [];
  const triggers: string[] = [];
  const b = new BoulderShoulder(
    {
      actors,
      damage: { apply: (r) => void applied.push(r) },
      feet: () => st.feet,
      facingYaw: () => st.yaw,
      blockedReason: () => st.blocked,
      playClip: (c) => (clips.push(c), st.clip),
      hold: (m) => void holds.push(m && { ...m }),
      interrupted: () => st.interrupted,
      reportTrigger: (id) => void triggers.push(id),
      skillId: SKILL_IDS.boulderShoulder,
    },
    () => 'player',
  );
  const foe = (id: string, x: number, z: number) => actors.add(new FakeActor(id, 'hostile', x, z));
  /** Moves the player along its hold the way the controller would, one tick. */
  const step = () => {
    const h = [...holds].reverse().find((m) => m !== undefined);
    if (b.charging && h) {
      st.feet = { ...st.feet, x: st.feet.x + (h.x * h.speed) / 60, z: st.feet.z + (h.z * h.speed) / 60 };
    }
    b.tick();
  };
  return { player, actors, applied, holds, st, clips, triggers, b, foe, step };
}

describe('Boulder Shoulder', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => (r = rig()));

  it('starts: plays the shoulder clip, holds a 5 m in 0.35 s move along the facing and reports the trigger', () => {
    expect(r.b.start()).toEqual({ ok: true });
    expect(r.clips).toEqual([BOULDER.clip]);
    const m = r.holds[0]!;
    expect(m.x).toBeCloseTo(0);
    expect(m.z).toBeCloseTo(-1);
    expect(m.speed).toBeCloseTo(5 / 0.35, 5);
    expect(r.b.charging).toBe(true);
    expect(r.triggers).toEqual([SKILL_IDS.boulderShoulder]);
  });

  it('the facing sets the direction (the player looks along -sin yaw, -cos yaw)', () => {
    r.st.yaw = Math.PI / 2;
    r.b.start();
    expect(r.holds[0]!.x).toBeCloseTo(-1);
    expect(r.holds[0]!.z).toBeCloseTo(0);
  });

  it('covers about 5 m, then releases the hold exactly once', () => {
    r.b.start();
    for (let i = 0; i < BOULDER.ticks + 5; i++) r.step();
    expect(r.st.feet.z).toBeCloseTo(-5, 0);
    expect(r.b.charging).toBe(false);
    expect(r.holds.filter((m) => m === null)).toHaveLength(1);
  });

  it('hits each hostile in the way once with 6 damage and 40 unblockable poise, not what is behind or off to the side', () => {
    r.foe('front', 0, -1);
    r.foe('later', 0, -4);
    r.foe('behind', 0, 0.8);
    r.foe('side', 2, -1);
    r.b.start();
    for (let i = 0; i < BOULDER.ticks; i++) r.step();
    const ids = r.applied.map((a) => a.targetId);
    expect(ids.sort()).toEqual(['front', 'later']);
    for (const a of r.applied) {
      expect(a).toMatchObject({ attackerId: 'player', amount: 6, poise: 40, kind: 'melee', attackId: BOULDER.attackId, unblockable: true });
      expect(a.direction).toBeInstanceOf(THREE.Vector3);
    }
    // 40 poise is a heavy blow, so a raised enemy guard breaks (heavyBlow.HEAVY_POISE is 30).
    expect(r.applied[0].poise).toBeGreaterThanOrEqual(30);
  });

  it('skips dead, friendly and unhittable actors', () => {
    r.foe('dead', 0, -1).kill();
    r.foe('ghost', 0, -1.1).hittable = false;
    r.actors.add(new FakeActor('ally', 'ally', 0, -1));
    r.b.start();
    for (let i = 0; i < BOULDER.ticks; i++) r.step();
    expect(r.applied).toEqual([]);
  });

  it.each(['dead', 'staggered', 'busy'])('is refused while %s and charges nothing', (why) => {
    r.st.blocked = why;
    expect(r.b.start()).toEqual({ ok: false, reason: why });
    expect(r.holds).toEqual([]);
    expect(r.clips).toEqual([]);
    expect(r.b.charging).toBe(false);
  });

  it('is refused when the controller will not play the clip, and while already charging', () => {
    r.st.clip = false;
    expect(r.b.start()).toEqual({ ok: false, reason: 'busy' });
    expect(r.holds).toEqual([]);
    r.st.clip = true;
    r.b.start();
    expect(r.b.start()).toEqual({ ok: false, reason: 'charging' });
    expect(r.holds).toHaveLength(1);
  });

  it('an interruption (stagger, death, dodge) ends the charge at once and releases the hold', () => {
    r.b.start();
    r.step();
    r.st.interrupted = true;
    r.step();
    expect(r.b.charging).toBe(false);
    expect(r.holds.at(-1)).toBeNull();
  });

  it('cancel (respec, class change, load) releases the hold and a later start works', () => {
    r.b.start();
    r.b.cancel();
    expect(r.b.charging).toBe(false);
    expect(r.holds.at(-1)).toBeNull();
    r.b.cancel();
    expect(r.b.start()).toEqual({ ok: true });
  });

  it('tick without a charge does nothing', () => {
    r.b.tick();
    expect(r.holds).toEqual([]);
    expect(r.applied).toEqual([]);
  });
});
