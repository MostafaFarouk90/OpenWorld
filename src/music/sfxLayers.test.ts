import { describe, expect, it } from 'vitest';
import { HEAVY_POISE, impactLayers, isHeavyHit, resolveMaterial, SFX, SFX_IDS, swingLayer } from './sfxLayers';

describe('SFX ids', () => {
  it('match the contract strings', () => {
    expect(SFX).toEqual({
      swingLight: 'sfx.swing.light',
      swingHeavy: 'sfx.swing.heavy',
      impactFlesh: 'sfx.impact.flesh',
      impactAsh: 'sfx.impact.ash',
      impactMetal: 'sfx.impact.metal',
      impactWood: 'sfx.impact.wood',
      impactStraw: 'sfx.impact.straw',
      thump: 'sfx.thump',
      armourRing: 'sfx.armour-ring',
      block: 'sfx.block',
      parry: 'sfx.parry',
    });
    expect(SFX_IDS).toHaveLength(11);
  });
});

describe('resolveMaterial', () => {
  it.each(['flesh', 'ash', 'metal', 'wood', 'straw'])('knows %s', (m) => {
    expect(resolveMaterial(m)).toEqual({ material: m, known: true });
  });
  it('defaults undefined and null to flesh, known', () => {
    expect(resolveMaterial(undefined)).toEqual({ material: 'flesh', known: true });
    expect(resolveMaterial(null)).toEqual({ material: 'flesh', known: true });
  });
  it('flags unknown strings and non-strings', () => {
    for (const v of ['stone', '', 'Metal', 5, {}, true, []]) {
      expect(resolveMaterial(v)).toEqual({ material: 'flesh', known: false });
    }
  });
  it('treats prototype keys as unknown', () => {
    for (const v of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      expect(resolveMaterial(v)).toEqual({ material: 'flesh', known: false });
    }
  });
});

describe('isHeavyHit', () => {
  const base = { poiseDealt: 0, killed: false };
  it('uses the poise threshold', () => {
    expect(HEAVY_POISE).toBe(30);
    expect(isHeavyHit({ ...base, poiseDealt: 29 })).toBe(false);
    expect(isHeavyHit({ ...base, poiseDealt: 30 })).toBe(true);
  });
  it('is heavy when killed', () => expect(isHeavyHit({ ...base, killed: true })).toBe(true));
  it('is heavy for chop attacks in any case', () => {
    for (const a of ['chop', 'Chop', 'heavyCHOP2', 'overhead-chop']) expect(isHeavyHit({ ...base, attackId: a })).toBe(true);
  });
  it('is light otherwise', () => {
    expect(isHeavyHit(base)).toBe(false);
    expect(isHeavyHit({ ...base, attackId: 'slash' })).toBe(false);
  });
});

describe('swingLayer', () => {
  it('picks light vs heavy', () => {
    expect(swingLayer(undefined)).toBe(SFX.swingLight);
    expect(swingLayer('slash')).toBe(SFX.swingLight);
    expect(swingLayer('Chop')).toBe(SFX.swingHeavy);
    expect(swingLayer('big_chop')).toBe(SFX.swingHeavy);
  });
});

describe('impactLayers', () => {
  it('plays one impact per material on a light hit', () => {
    expect(impactLayers('hit', 'flesh', false)).toEqual([SFX.impactFlesh]);
    expect(impactLayers('hit', 'ash', false)).toEqual([SFX.impactAsh]);
    expect(impactLayers('hit', 'metal', false)).toEqual([SFX.impactMetal]);
    expect(impactLayers('hit', 'wood', false)).toEqual([SFX.impactWood]);
    expect(impactLayers('hit', 'straw', false)).toEqual([SFX.impactStraw]);
  });
  it('adds thump on heavy hits', () => {
    expect(impactLayers('hit', 'flesh', true)).toEqual([SFX.impactFlesh, SFX.thump]);
    expect(impactLayers('hit', 'wood', true)).toEqual([SFX.impactWood, SFX.thump]);
  });
  it('adds armour ring on heavy metal hits', () => {
    expect(impactLayers('hit', 'metal', true)).toEqual([SFX.impactMetal, SFX.thump, SFX.armourRing]);
  });
  it('maps block, parry, immune and unknown outcomes', () => {
    expect(impactLayers('blocked', 'metal', true)).toEqual([SFX.block]);
    expect(impactLayers('parried', 'flesh', false)).toEqual([SFX.parry]);
    expect(impactLayers('immune', 'flesh', true)).toEqual([]);
    expect(impactLayers('bogus', 'flesh', true)).toEqual([]);
    expect(impactLayers('', 'flesh', false)).toEqual([]);
  });
});
