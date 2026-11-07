import { describe, expect, it } from 'vitest';
import { isStruckProp, STRUCK_PROP_KINDS } from './struckProps';
import { projectileHitShape } from './hitShapes';

describe('struck props', () => {
  it('the Bellows-Engine valves and the Last Gong are struck props, only as neutral actors', () => {
    expect([...STRUCK_PROP_KINDS].sort()).toEqual(['bellows-valve', 'eormen-gong']);
    expect(isStruckProp({ team: 'neutral', kind: 'eormen-gong' })).toBe(true);
    expect(isStruckProp({ team: 'hostile', kind: 'eormen-gong' })).toBe(false);
    expect(isStruckProp({ team: 'neutral', kind: 'deer' })).toBe(false);
  });

  it('the gong and Eormen get their own projectile cylinders; other kinds keep the default', () => {
    expect(projectileHitShape('eormen-gong')).toEqual({ radius: 1.0, height: 2.6 });
    expect(projectileHitShape('eormen')).toEqual({ radius: 0.6, height: 2.6 });
    expect(projectileHitShape('ash-wraith')).toBeNull();
  });
});
