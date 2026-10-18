import { describe, expect, it } from 'vitest';
import { TEAMS, type Team } from './Actor';
import { DUMMY_INIT, PLAYER_ID, PLAYER_STATS, canDamage, playerInit } from './teams';

const ALLOWED: Record<Team, Team[]> = {
  player: ['hostile', 'neutral'],
  ally: ['hostile', 'neutral'],
  hostile: ['player', 'ally', 'neutral'],
  neutral: [],
};

describe('canDamage', () => {
  for (const attacker of TEAMS) {
    for (const target of TEAMS) {
      const expected = ALLOWED[attacker].includes(target);
      it(`${attacker} -> ${target}: ${expected}`, () => {
        expect(canDamage(attacker, target)).toBe(expected);
      });
    }
  }

  it('covers all 16 pairs', () => {
    expect(TEAMS.length * TEAMS.length).toBe(16);
  });

  it('nobody hurts its own team', () => {
    for (const t of TEAMS) expect(canDamage(t, t)).toBe(false);
  });

  it('an unknown attacker team can hurt nobody', () => {
    expect(canDamage('bogus' as Team, 'player')).toBe(false);
  });
});

describe('player and dummy defaults', () => {
  it('player stats match the contract', () => {
    expect(PLAYER_STATS).toEqual({ maxHealth: 100, maxStamina: 100, maxPoise: 40, level: 1 });
  });

  it('playerInit has the explicit id and player team', () => {
    expect(playerInit()).toMatchObject({ id: PLAYER_ID, team: 'player', kind: 'player', maxHealth: 100 });
    expect(PLAYER_ID).toBe('player');
  });

  it('playerInit returns a fresh object each time', () => {
    expect(playerInit()).not.toBe(playerInit());
  });

  it('dummy is an immortal neutral with 100 health', () => {
    expect(DUMMY_INIT).toMatchObject({ kind: 'dummy', team: 'neutral', immortal: true, maxHealth: 100 });
  });
});
