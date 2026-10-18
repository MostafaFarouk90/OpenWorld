import { describe, expect, it } from 'vitest';
import { actorsInCone, actorsInRadius } from './areas';
import { FakeActor, FakeActors } from './testHost';

function world() {
  const actors = new FakeActors(new FakeActor('player', 'player'));
  actors.add(new FakeActor('far', 'hostile', 0, 9));
  actors.add(new FakeActor('near', 'hostile', 0, 2));
  actors.add(new FakeActor('mid', 'hostile', 3, 0));
  const dead = actors.add(new FakeActor('dead', 'hostile', 1, 0));
  dead.kill();
  const npc = actors.add(new FakeActor('npc', 'neutral', 0, 1));
  npc.hittable = false;
  actors.add(new FakeActor('friend', 'ally', -1, 0));
  return actors;
}

describe('areas', () => {
  it('radius ignores dead and unhittable, sorted by distance', () => {
    const r = actorsInRadius(world(), { x: 0, y: 0, z: 0 }, 5, {});
    expect(r.map((h) => h.actor.id)).toEqual(['player', 'friend', 'near', 'mid']);
  });
  it('filters by team and can include dead', () => {
    const a = world();
    expect(actorsInRadius(a, { x: 0, y: 0, z: 0 }, 5, { team: 'hostile' }).map((h) => h.actor.id)).toEqual(['near', 'mid']);
    expect(actorsInRadius(a, { x: 0, y: 0, z: 0 }, 5, { team: ['ally', 'player'] }).map((h) => h.actor.id)).toEqual(['player', 'friend']);
    expect(actorsInRadius(a, { x: 0, y: 0, z: 0 }, 5, { team: 'hostile', alive: false }).map((h) => h.actor.id)).toContain('dead');
  });
  it('radius edge and bad input', () => {
    const a = world();
    expect(actorsInRadius(a, { x: 0, y: 0, z: 0 }, 3, { team: 'hostile' }).map((h) => h.actor.id)).toContain('mid');
    expect(actorsInRadius(a, { x: 0, y: 0, z: 0 }, Number.NaN, {})).toEqual([]);
    expect(actorsInRadius(a, { x: NaN, y: 0, z: 0 }, 5, {})).toEqual([]);
  });
  it('cone', () => {
    const a = world();
    // yaw 0 faces +z
    expect(actorsInCone(a, { x: 0, y: 0, z: 0 }, 0, Math.PI / 6, 10, { team: 'hostile' }).map((h) => h.actor.id)).toEqual(['near', 'far']);
    // yaw PI/2 faces +x
    expect(actorsInCone(a, { x: 0, y: 0, z: 0 }, Math.PI / 2, Math.PI / 6, 10, { team: 'hostile' }).map((h) => h.actor.id)).toEqual(['mid']);
    expect(actorsInCone(a, { x: 0, y: 0, z: 0 }, 0, Math.PI / 6, 5, { team: 'hostile' }).map((h) => h.actor.id)).toEqual(['near']);
    expect(actorsInCone(a, { x: 0, y: 0, z: 0 }, NaN, 1, 5)).toEqual([]);
  });
});
