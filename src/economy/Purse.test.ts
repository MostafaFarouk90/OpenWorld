import { describe, expect, it } from 'vitest';
import { PurseTracker, purseFor } from './Purse';

const kill = (over: Record<string, unknown> = {}) => ({
  actorId: 'enemy-1',
  killerId: 'player',
  kind: 'blighted-soldier',
  spawnTag: 'deadroad.camp-1',
  ...over,
});

describe('purse', () => {
  it('pays a camp Footman the player killed', () => {
    expect(purseFor(kill())).toBe(4);
    expect(purseFor(kill({ spawnTag: 'deadroad.camp-2' }))).toBe(4);
  });

  it('pays R03 thugs', () => {
    expect(purseFor(kill({ kind: 'guildhall-thug', spawnTag: 'r03.guildhall' }))).toBe(10);
  });

  it.each([
    ['ford pair', { spawnTag: 'brightwater.ford.pair-1' }],
    ['replay blocker', { spawnTag: 'replay.blocker' }],
    ['tutorial soldier', { spawnTag: 't09.soldier' }],
    ['patrol wraith', { kind: 'ash-wraith', spawnTag: 'brightwater.deadroad.patrol-1' }],
    ['camp wraith kind', { kind: 'ash-wraith' }],
    ['no spawn tag', { spawnTag: undefined }],
    ['killed by Tobb', { killerId: 'tobb-1' }],
    ['no killer', { killerId: null }],
  ])('pays nothing for %s', (_n, over) => {
    expect(purseFor(kill(over))).toBe(0);
  });

  it('pays once per actor even if the death is announced twice', () => {
    const paid: number[] = [];
    const t = new PurseTracker((g) => paid.push(g));
    expect(t.onDied(kill())).toBe(4);
    expect(t.onDied(kill())).toBe(0);
    expect(t.onDied(kill({ actorId: 'enemy-2' }))).toBe(4);
    expect(paid).toEqual([4, 4]);
  });
});
