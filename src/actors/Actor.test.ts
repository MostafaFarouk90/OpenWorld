import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Actor, TEAMS } from './Actor';

const base = { kind: 'dummy', team: 'neutral' as const, maxHealth: 50 };

describe('Actor construction', () => {
  it('applies defaults', () => {
    const a = new Actor('dummy#1', base);
    expect(a).toMatchObject({
      id: 'dummy#1',
      kind: 'dummy',
      team: 'neutral',
      level: 1,
      health: 50,
      maxHealth: 50,
      poise: 0,
      maxPoise: 0,
      stamina: 0,
      maxStamina: 0,
      immortal: false,
      hittable: true,
      invulnerable: false,
      root: null,
    });
    expect(a.dead).toBe(false);
    expect(a.alive).toBe(true);
    expect(a.data).toEqual({});
  });

  it('starts poise and stamina at their maxima', () => {
    const a = new Actor('x', { ...base, maxPoise: 30, maxStamina: 70, level: 4, immortal: true, hittable: false });
    expect(a.poise).toBe(30);
    expect(a.stamina).toBe(70);
    expect(a.level).toBe(4);
    expect(a.immortal).toBe(true);
    expect(a.hittable).toBe(false);
  });

  it('lists the four teams', () => {
    expect([...TEAMS].sort()).toEqual(['ally', 'hostile', 'neutral', 'player']);
  });

  it('data scratch is per actor', () => {
    const a = new Actor('a', base);
    const b = new Actor('b', base);
    a.data['enemies'] = 1;
    expect(b.data['enemies']).toBeUndefined();
  });

  it.each([
    ['no kind', { ...base, kind: '' }, /kind is required/],
    ['zero maxHealth', { ...base, maxHealth: 0 }, /maxHealth must be > 0/],
    ['negative maxHealth', { ...base, maxHealth: -5 }, /maxHealth/],
    ['NaN maxHealth', { ...base, maxHealth: NaN }, /maxHealth/],
    ['Infinity maxHealth', { ...base, maxHealth: Infinity }, /maxHealth/],
    ['negative maxPoise', { ...base, maxPoise: -1 }, /maxPoise/],
    ['NaN maxStamina', { ...base, maxStamina: NaN }, /maxStamina/],
    ['level 0', { ...base, level: 0 }, /level/],
    ['fractional level', { ...base, level: 1.5 }, /level/],
    ['NaN level', { ...base, level: NaN }, /level/],
  ])('rejects %s', (_n, init, re) => {
    expect(() => new Actor('x', init)).toThrow(re);
  });
});

describe('Actor.worldPosition', () => {
  it('returns out unchanged without a root', () => {
    const a = new Actor('a', base);
    const out = new THREE.Vector3(1, 2, 3);
    expect(a.worldPosition(out)).toBe(out);
    expect(out.toArray()).toEqual([1, 2, 3]);
  });

  it('writes the root world position into out', () => {
    const parent = new THREE.Object3D();
    parent.position.set(10, 0, 0);
    const root = new THREE.Object3D();
    root.position.set(0, 5, 0);
    parent.add(root);
    parent.updateMatrixWorld(true);
    const a = new Actor('a', { ...base, root });
    const out = new THREE.Vector3();
    expect(a.worldPosition(out)).toBe(out);
    expect(out.toArray()).toEqual([10, 5, 0]);
  });
});

describe('Actor stamina', () => {
  it('spends when enough, and spends nothing when short', () => {
    const a = new Actor('a', { ...base, maxStamina: 10 });
    expect(a.spendStamina(4)).toBe(true);
    expect(a.stamina).toBe(6);
    expect(a.spendStamina(7)).toBe(false);
    expect(a.stamina).toBe(6);
    expect(a.spendStamina(6)).toBe(true);
    expect(a.stamina).toBe(0);
  });

  it('n <= 0 or non-finite is a no-op returning true', () => {
    const a = new Actor('a', { ...base, maxStamina: 10 });
    for (const n of [0, -3, NaN, Infinity, -Infinity]) expect(a.spendStamina(n)).toBe(true);
    expect(a.stamina).toBe(10);
  });

  it('an actor with no stamina pool cannot spend', () => {
    expect(new Actor('a', base).spendStamina(1)).toBe(false);
  });

  it('restores and clamps to max; ignores bad amounts', () => {
    const a = new Actor('a', { ...base, maxStamina: 10 });
    a.spendStamina(8);
    a.restoreStamina(3);
    expect(a.stamina).toBe(5);
    a.restoreStamina(100);
    expect(a.stamina).toBe(10);
    a.spendStamina(5);
    for (const n of [0, -1, NaN, Infinity]) a.restoreStamina(n);
    expect(a.stamina).toBe(5);
  });
});

describe('Actor poise', () => {
  it('restores to max by default', () => {
    const a = new Actor('a', { ...base, maxPoise: 40 });
    a.poise = 3;
    a.restorePoise();
    expect(a.poise).toBe(40);
  });

  it('restores a given amount, clamped; bad amounts ignored', () => {
    const a = new Actor('a', { ...base, maxPoise: 40 });
    a.poise = 10;
    a.restorePoise(5);
    expect(a.poise).toBe(15);
    a.restorePoise(1000);
    expect(a.poise).toBe(40);
    a.poise = 10;
    for (const n of [0, -2, NaN, Infinity]) a.restorePoise(n);
    expect(a.poise).toBe(10);
  });
});
