import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DamageNumberSprites, DamageNumbers, formatDamage } from './DamageNumbers';

describe('DamageNumbers', () => {
  it('rises, fades and expires at its lifetime', () => {
    const d = new DamageNumbers(1, 2, 10);
    const n = d.spawn(10, { x: 1, y: 2, z: 3 });
    expect(d.offsetY(n)).toBe(0);
    expect(d.opacity(n)).toBe(1);
    d.update(0.5);
    expect(d.offsetY(n)).toBeCloseTo(1);
    expect(d.opacity(n)).toBe(1);
    d.update(0.25);
    expect(d.opacity(n)).toBeCloseTo(0.5);
    expect(d.update(0.25)).toEqual([n]);
    expect(d.live).toHaveLength(0);
  });

  it('caps live numbers, dropping the oldest', () => {
    const d = new DamageNumbers(1, 1, 2);
    const a = d.spawn(1, { x: 0, y: 0, z: 0 });
    d.spawn(2, { x: 0, y: 0, z: 0 });
    d.spawn(3, { x: 0, y: 0, z: 0 });
    expect(d.update(0)).toEqual([a]);
    expect(d.live.map((n) => n.text)).toEqual(['2', '3']);
  });

  it('formats damage, including non-finite values', () => {
    expect(formatDamage(20)).toBe('20');
    expect(formatDamage(7.5)).toBe('7.5');
    expect(formatDamage(6.000001)).toBe('6');
    expect(formatDamage(NaN)).toBe('?');
    expect(formatDamage(Infinity)).toBe('?');
  });

  it('progress clamps for a negative or huge age', () => {
    const d = new DamageNumbers(1, 1, 4);
    const n = d.spawn(1, { x: 0, y: 0, z: 0 });
    n.age = -5;
    expect(d.progress(n)).toBe(0);
    n.age = 9;
    expect(d.progress(n)).toBe(1);
  });
});

describe('DamageNumberSprites', () => {
  it('adds a sprite, moves it, and frees it on expiry and dispose', () => {
    const parent = new THREE.Group();
    const s = new DamageNumberSprites(parent, new DamageNumbers(1, 2, 4));
    s.spawn(10, { x: 0, y: 1, z: 0 });
    s.spawn(20, { x: 0, y: 1, z: 0 });
    expect(parent.children).toHaveLength(2);
    s.update(0.5);
    expect(parent.children[0].position.y).toBeCloseTo(2);
    s.update(0.6);
    expect(parent.children).toHaveLength(0);
    expect(s.spriteCount).toBe(0);
    s.spawn(1, { x: 0, y: 0, z: 0 });
    s.dispose();
    expect(parent.children).toHaveLength(0);
    expect(s.spriteCount).toBe(0);
  });
});
