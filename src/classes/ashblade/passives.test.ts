import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Actor } from '../../actors/Actor';
import type { DamageResult, ModifiableRequest } from '../../actors/DamageResolver';
import { backSlitModifier, bleedingEmberHandler, sparkDodgeHandler } from './passives';
import { BLEEDING_EMBER, SPARK_DODGE } from './tuning';

const mkActor = (id: string, yaw = 0, withRoot = true) => {
  const root = new THREE.Object3D();
  root.rotation.y = yaw;
  root.updateMatrixWorld(true);
  return new Actor(id, { kind: 'test', team: 'hostile', maxHealth: 100, maxPoise: 50, maxStamina: 0, root: withRoot ? root : null });
};

const req = (over: Partial<ModifiableRequest> = {}): ModifiableRequest => ({
  attackerId: 'player',
  targetId: 'foe',
  amount: 10,
  poise: 10,
  kind: 'melee',
  outcome: 'hit',
  direction: new THREE.Vector3(0, 0, -1),
  ...over,
});

describe('Back-Slit', () => {
  const run = (target: Actor, r: ModifiableRequest, active = true) => {
    const triggered = vi.fn();
    backSlitModifier({ playerId: () => 'player', active: () => active, triggered })(r, target, null);
    return { r, triggered };
  };

  it('doubles the damage, not the poise, when the attacker is straight behind', () => {
    const { r, triggered } = run(mkActor('foe'), req());
    expect(r.amount).toBe(20);
    expect(r.poise).toBe(10);
    expect(triggered).toHaveBeenCalledOnce();
  });

  it('leaves a hit from the front or the side alone', () => {
    expect(run(mkActor('foe'), req({ direction: new THREE.Vector3(0, 0, 1) })).r.amount).toBe(10);
    expect(run(mkActor('foe'), req({ direction: new THREE.Vector3(1, 0, 0) })).r.amount).toBe(10);
  });

  it('follows the target turning: facing +X, an attacker at -X is behind it', () => {
    const facingPlusX = mkActor('foe', -Math.PI / 2);
    expect(run(facingPlusX, req({ direction: new THREE.Vector3(1, 0, 0) })).r.amount).toBe(20);
    expect(run(facingPlusX, req({ direction: new THREE.Vector3(0, 0, -1) })).r.amount).toBe(10);
  });

  it('uses a 120 degree rear arc', () => {
    const at = (deg: number) => req({ direction: new THREE.Vector3(Math.sin((deg * Math.PI) / 180), 0, -Math.cos((deg * Math.PI) / 180)) });
    expect(run(mkActor('foe'), at(59)).r.amount).toBe(20);
    expect(run(mkActor('foe'), at(61)).r.amount).toBe(10);
  });

  it('ignores status and spell damage, other attackers, a missing root or direction, and an inactive skill', () => {
    expect(run(mkActor('foe'), req({ kind: 'status' })).r.amount).toBe(10);
    expect(run(mkActor('foe'), req({ kind: 'spell' })).r.amount).toBe(10);
    expect(run(mkActor('foe'), req({ attackerId: 'other' })).r.amount).toBe(10);
    expect(run(mkActor('foe', 0, false), req()).r.amount).toBe(10);
    expect(run(mkActor('foe'), req({ direction: undefined })).r.amount).toBe(10);
    expect(run(mkActor('foe'), req(), false).r.amount).toBe(10);
  });

  it('still lets the hit land on a watch guard: the damage is doubled, never suppressed (a hit is a stealth catch)', () => {
    const guard = mkActor('guard');
    const { r } = run(guard, req({ targetId: 'guard' }));
    expect(r.amount).toBe(20);
    expect(r.outcome).toBe('hit');
  });
});

const result = (over: Partial<DamageResult> = {}): DamageResult =>
  ({ attackerId: 'player', targetId: 'foe', amount: 10, poise: 10, kind: 'melee', outcome: 'hit', dealt: 10, poiseDealt: 10, healthAfter: 90, killed: false, saved: false, staggered: false, ...over }) as DamageResult;

describe('Bleeding Ember', () => {
  const setup = (over: { status?: boolean; active?: boolean } = {}) => {
    const apply = vi.fn(() => true);
    const warn = vi.fn();
    const triggered = vi.fn();
    const h = bleedingEmberHandler({
      playerId: () => 'player',
      active: () => over.active ?? true,
      status: () => (over.status === false ? undefined : { apply }),
      warn,
      triggered,
    });
    return { h, apply, warn, triggered };
  };

  it('ignites a target after a landing melee hit, with one shared id so repeats refresh', () => {
    const { h, apply, triggered } = setup();
    h(result());
    h(result());
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith('foe', { id: BLEEDING_EMBER.statusId, kind: 'ignite', dps: 3, seconds: 4, sourceId: 'player' });
    expect(triggered).toHaveBeenCalled();
  });

  it('does nothing on blocked, parried or immune hits, zero damage, kills, status ticks, spells or other attackers', () => {
    const { h, apply } = setup();
    for (const outcome of ['blocked', 'parried', 'immune'] as const) h(result({ outcome }));
    h(result({ dealt: 0 }));
    h(result({ killed: true }));
    h(result({ kind: 'status' }));
    h(result({ kind: 'spell' }));
    h(result({ attackerId: 'other' }));
    expect(apply).not.toHaveBeenCalled();
  });

  it('does nothing when the skill is not learned', () => {
    const { h, apply } = setup({ active: false });
    h(result());
    expect(apply).not.toHaveBeenCalled();
  });

  it('warns once and skips while the status service is absent, then works when it appears', () => {
    const { h, warn, apply } = setup({ status: false });
    h(result());
    h(result());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('looks the status service up at hit time', () => {
    let svc: { apply: ReturnType<typeof vi.fn> } | undefined;
    const warn = vi.fn();
    const h = bleedingEmberHandler({ playerId: () => 'player', active: () => true, status: () => svc, warn });
    h(result());
    svc = { apply: vi.fn(() => true) };
    h(result());
    expect(svc.apply).toHaveBeenCalledOnce();
  });
});

describe('Spark Dodge', () => {
  const setup = (over: { tick?: { v: number }; active?: boolean; near?: { id: string; state: string | undefined }[] } = {}) => {
    const apply = vi.fn(() => true);
    const spark = vi.fn();
    const tick = over.tick ?? { v: 0 };
    const h = sparkDodgeHandler({
      playerId: () => 'player',
      active: () => over.active ?? true,
      tick: () => tick.v,
      feet: () => ({ x: 1, y: 0, z: 2 }),
      hostilesNear: () => over.near ?? [{ id: 'a', state: 'chase' }, { id: 'b', state: 'patrol' }, { id: 'c', state: undefined }],
      spark,
      status: () => ({ apply }),
      warn: () => undefined,
    });
    return { h, apply, spark, tick };
  };

  it('sparks at the feet and ignites only hostiles already on the player', () => {
    const { h, apply, spark } = setup();
    h();
    expect(spark).toHaveBeenCalledWith({ x: 1, y: 0, z: 2 });
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith('a', { id: SPARK_DODGE.statusId, kind: 'ignite', dps: 2, seconds: 3, sourceId: 'player' });
  });

  it('has a 1.5 s internal cooldown', () => {
    const { h, spark, tick } = setup();
    h();
    tick.v = 89;
    h();
    expect(spark).toHaveBeenCalledTimes(1);
    tick.v = 90;
    h();
    expect(spark).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the skill is not learned', () => {
    const off = setup({ active: false });
    off.h();
    expect(off.spark).not.toHaveBeenCalled();
  });
});
