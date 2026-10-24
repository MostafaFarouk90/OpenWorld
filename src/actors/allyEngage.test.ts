import { describe, expect, it } from 'vitest';
import { GameEvents } from '../core/events';
import { ActorRegistry } from './ActorRegistry';
import { AllyEngagement } from './allyEngage';
import { playerInit } from './teams';

describe('AllyEngagement.exclude', () => {
  const make = () => {
    const events = new GameEvents(() => {});
    const actors = new ActorRegistry(events);
    const player = actors.spawn(playerInit());
    const foe = actors.spawn({ kind: 'yard-veteran', team: 'hostile', maxHealth: 50 });
    const eng = new AllyEngagement(events, actors);
    events.emit('ai.aggro', { actorId: foe.id, targetId: player.id } as never);
    return { eng, foe };
  };

  it('a foe aggroed on the player may be engaged, until it is excluded', () => {
    const { eng, foe } = make();
    expect(eng.mayEngage(foe.id)).toBe(true);
    const off = eng.exclude(foe.id);
    expect(eng.mayEngage(foe.id)).toBe(false);
    off();
    expect(eng.mayEngage(foe.id)).toBe(true);
  });

  it('exclusions stack and release once each', () => {
    const { eng, foe } = make();
    const a = eng.exclude(foe.id);
    const b = eng.exclude(foe.id);
    a();
    a();
    expect(eng.mayEngage(foe.id)).toBe(false);
    b();
    expect(eng.mayEngage(foe.id)).toBe(true);
  });
});
