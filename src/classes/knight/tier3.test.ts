import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HalvardCharge, SquiresResolve } from './tier3';
import { HALVARD, SQUIRE } from './tuning';

describe('Charge of the Halvard ledge stop', () => {
  const make = (heightAt: (x: number, z: number) => number) => {
    const holds: Array<unknown> = [];
    const st = { feet: { x: 0, y: 0, z: 0 } };
    const foe = { id: 'f', team: 'hostile', dead: false, hittable: true, worldPosition: (o: THREE.Vector3) => o.set(0, 0, -4.5) };
    const applied: unknown[] = [];
    const c = new HalvardCharge(
      {
        actors: { all: () => [foe] },
        damage: { apply: (r) => void applied.push(r) },
        classId: () => null,
        learned: () => true,
        heightAt,
        feet: () => st.feet,
        facingYaw: () => 0,
        blockedReason: () => null,
        playClip: () => true,
        hold: (m) => void holds.push(m),
        interrupted: () => false,
        reportTrigger: () => undefined,
        fx: () => undefined,
        skillId: 'knight.chargeOfTheHalvard',
      },
      () => 'player',
    );
    const run = (n: number) => {
      for (let i = 0; i < n; i++) {
        const h = holds.at(-1) as { z: number; speed: number } | null | undefined;
        if (h) st.feet.z += (h.z * h.speed) / 60;
        c.tick();
      }
    };
    return { c, holds, run, st, applied };
  };

  it('runs the full 5 m on flat ground', () => {
    const t = make(() => 0);
    t.c.start();
    t.run(HALVARD.ticks);
    expect(t.st.feet.z).toBeCloseTo(-5, 1);
    expect(t.applied).toHaveLength(1);
  });

  it('stops and releases the hold when the ground ahead drops more than 1 m', () => {
    const t = make((_x, z) => (z < -2 ? -3 : 0));
    t.c.start();
    t.run(HALVARD.ticks);
    expect(t.c.charging).toBe(false);
    expect(t.holds.at(-1)).toBeNull();
    expect(t.st.feet.z).toBeGreaterThan(-3);
    expect(t.applied).toHaveLength(0);
  });

  it('a drop of 1 m or less does not stop it', () => {
    const t = make((_x, z) => (z < -2 ? -1 : 0));
    t.c.start();
    t.run(HALVARD.ticks);
    expect(t.st.feet.z).toBeCloseTo(-5, 1);
  });
});

describe("Squire's Resolve without ai.aggro (boss-like)", () => {
  const make = () => {
    const st = { now: 0 };
    const s = new SquiresResolve({
      now: () => st.now,
      playerId: () => 'player',
      feet: () => ({ x: 0, y: 0, z: 0 }),
      classId: () => null,
      learned: () => true,
      fx: () => undefined,
      alive: () => true,
    });
    const ally = { id: 'a', team: 'ally', maxHealth: 50, health: 0, worldPosition: (o: THREE.Vector3) => o.set(2, 0, 0) };
    const advance = (sec: number) => {
      for (let i = 0; i < sec * 60; i++) {
        st.now += 1 / 60;
        s.tick();
      }
    };
    return { s, ally, advance };
  };

  it('damage between a hostile and an ally keeps one fight open past 6 s, so the ally is saved once', () => {
    const { s, ally, advance } = make();
    expect(s.lethal(ally)).toBe(true);
    for (let i = 0; i < 4; i++) {
      advance(4);
      s.onDamage('hostile', 'ally');
      ally.health = 0;
      expect(s.lethal(ally), `at ${i}`).toBe(false);
    }
    expect(s.fight.open).toBe(true);
  });

  it('either direction and the player count; hostile-to-hostile does not', () => {
    const { s, advance } = make();
    s.onDamage('hostile', 'hostile');
    expect(s.fight.open).toBe(false);
    s.onDamage('player', 'hostile');
    expect(s.fight.open).toBe(true);
    advance(7);
    expect(s.fight.open).toBe(false);
    s.onDamage('hostile', 'player');
    expect(s.fight.open).toBe(true);
  });

  it('closes 6 s after the last hit and re-arms', () => {
    const { s, ally, advance } = make();
    s.onDamage('hostile', 'ally');
    expect(s.lethal(ally)).toBe(true);
    advance(SQUIRE.graceSeconds + 0.5);
    expect(s.fight.open).toBe(false);
    ally.health = 0;
    expect(s.lethal(ally)).toBe(true);
  });
});
