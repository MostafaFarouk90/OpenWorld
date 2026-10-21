import { describe, expect, it } from 'vitest';
import { platformLoadTarget } from './save.plugin';

const platforms = {
  standingPoint: (id: string) => (id === 'lift' ? { x: 3, y: 10, z: -4 } : null),
};

describe('platformLoadTarget', () => {
  it('puts the player on top of the registered platform at its last stop', () => {
    expect(platformLoadTarget({ x: 0, y: 0, z: 0, yaw: 0, platformId: 'lift' }, platforms)).toEqual({ x: 3, y: 10.05, z: -4 });
  });

  it('is null without a platformId, for an unknown platform, or without the service', () => {
    expect(platformLoadTarget({ x: 0, y: 0, z: 0, yaw: 0 }, platforms)).toBeNull();
    expect(platformLoadTarget({ platformId: 'gone' }, platforms)).toBeNull();
    expect(platformLoadTarget({ platformId: 'lift' }, undefined)).toBeNull();
    expect(platformLoadTarget(null, platforms)).toBeNull();
    expect(platformLoadTarget({ platformId: 7 }, platforms)).toBeNull();
  });
});
