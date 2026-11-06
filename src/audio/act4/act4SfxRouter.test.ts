import { describe, expect, it } from 'vitest';
import { CREAK_EVERY_GUSTS, GUST_MAX_S, GUST_MIN_S, HUSK_SKIN } from './act4SfxEvents';
import { Act4SfxRouter, type Act4SfxPorts } from './act4SfxRouter';

function rig(opts: { audio?: boolean; attach?: boolean; throws?: boolean; random?: number } = {}) {
  const { audio = true, attach = true, throws = false, random = 0 } = opts;
  const played: string[] = [];
  const playedAt: string[] = [];
  const attached: Array<{ id: number; key: string; object: unknown }> = [];
  const detached: number[] = [];
  const ensured: string[] = [];
  let next = 1;
  const player = { name: 'player' };
  const svc = {
    play: (k: string) => {
      if (throws) throw new Error('boom');
      played.push(k);
      return 1;
    },
    playAt: (k: string) => void playedAt.push(k),
    ...(attach ? { attach: (key: string, object: unknown) => (attached.push({ id: next, key, object }), next++), detach: (id: number) => void detached.push(id) } : {}),
  };
  const ports: Act4SfxPorts = {
    audio: () => (audio ? svc : undefined),
    actorAt: (id) => (id === 'placed' ? { x: 1, y: 2, z: 3 } : id === 'unplaced' ? null : undefined),
    object: (id) => (id === 'gone' ? undefined : { id }),
    playerObject: () => player,
    random: () => random,
    ensure: (k) => void ensured.push(k),
  };
  return { router: new Act4SfxRouter(ports), played, playedAt, attached, detached, ensured, player };
}

describe('creatures and bosses', () => {
  it('a mapped telegraph plays at the actor; an unknown move or a prototype name plays nothing', () => {
    const r = rig();
    r.router.telegraph({ actorId: 'placed', moveId: 'bellows.punch' });
    r.router.telegraph({ actorId: 'unplaced', moveId: 'eormen.toll' });
    r.router.telegraph({ actorId: 'placed', moveId: 'wraith.slash' });
    r.router.telegraph({ actorId: 'placed', moveId: 'toString' });
    expect(r.playedAt).toEqual(['sfx.engine.piston']);
    expect(r.played).toEqual(['sfx.eormen.toll']);
    expect(r.ensured).toEqual(['sfx.engine.piston', 'sfx.eormen.toll']);
  });

  it('a husk (the wraith-husk skin) rises, rasps on its telegraphs, and crumbles on death; a plain wraith does not', () => {
    const r = rig();
    r.router.spawned({ actorId: 'placed', kind: 'ash-wraith', skin: HUSK_SKIN });
    r.router.spawned({ actorId: 'unplaced', kind: 'ash-wraith', skin: null });
    r.router.telegraph({ actorId: 'placed', moveId: 'wraith.slash' });
    r.router.telegraph({ actorId: 'unplaced', moveId: 'wraith.slash' });
    r.router.died({ actorId: 'placed', kind: 'ash-wraith' });
    r.router.died({ actorId: 'unplaced', kind: 'ash-wraith' });
    expect(r.playedAt).toEqual(['sfx.husk.rise', 'sfx.husk.rasp', 'sfx.husk.collapse']);
    expect(r.played).toEqual([]);
    // Dead: a later telegraph from a reused id is not a husk's.
    r.router.telegraph({ actorId: 'placed', moveId: 'wraith.slash' });
    expect(r.playedAt).toHaveLength(3);
  });

  it('kind deaths play their cue', () => {
    const r = rig();
    r.router.died({ actorId: 'placed', kind: 'waste-strider' });
    r.router.died({ actorId: 'placed', kind: 'cinder-gnat-swarm' });
    r.router.died({ actorId: 'placed', kind: 'blighted-soldier' });
    expect(r.playedAt).toEqual(['sfx.strider.die', 'sfx.gnats.scatter']);
  });

  it('looping kinds attach to the actor and stop on death or despawn; an actor with no object gets no loop', () => {
    const r = rig();
    r.router.spawned({ actorId: 'a', kind: 'waste-strider' });
    r.router.spawned({ actorId: 'b', kind: 'cinder-gnat-swarm' });
    r.router.spawned({ actorId: 'gone', kind: 'bellows-engine' });
    expect(r.attached.map((x) => x.key)).toEqual(['sfx.strider.click', 'sfx.gnats.buzz']);
    r.router.died({ actorId: 'a', kind: 'waste-strider' });
    r.router.gone('b');
    r.router.gone('b');
    expect(r.detached).toEqual([1, 2]);
    expect(r.router.activeLoops).toEqual([]);
  });

  it('the engine vents on each poise break (phase 2 and up), not on phase 1; Eormen released plays his release', () => {
    const r = rig();
    r.router.bossPhase({ bossId: 'bellows-engine', phase: 1 });
    r.router.bossPhase({ bossId: 'bellows-engine', phase: 2 });
    r.router.bossPhase({ bossId: 'eormen', phase: 2 });
    r.router.bossReleased({ bossId: 'eormen' });
    r.router.bossReleased({ bossId: 'bellows-engine' });
    expect(r.played).toEqual(['sfx.engine.vent', 'sfx.eormen.release']);
  });

  it('after a load, living actors are re-adopted silently: loops restart, a husk still crumbles, no rise', () => {
    const r = rig();
    r.router.spawned({ actorId: 'placed', kind: 'ash-wraith', skin: HUSK_SKIN });
    r.router.spawned({ actorId: 'a', kind: 'waste-strider' });
    r.router.saveLoaded();
    r.router.adopt([{ actorId: 'placed', kind: 'ash-wraith', skin: HUSK_SKIN }, { actorId: 'a', kind: 'waste-strider' }]);
    expect(r.attached.map((x) => x.key)).toEqual(['sfx.strider.click', 'sfx.strider.click']);
    r.router.died({ actorId: 'placed', kind: 'ash-wraith' });
    expect(r.playedAt).toEqual(['sfx.husk.rise', 'sfx.husk.collapse']);
  });

  it('a throwing player lookup never escapes a weather event', () => {
    const r = rig();
    const ports = (r.router as unknown as { ports: { playerObject: () => object } }).ports;
    ports.playerObject = () => {
      throw new Error('no player yet');
    };
    expect(() => r.router.weatherChanged({ kind: 'storm' })).not.toThrow();
    expect(r.played).toEqual(['sfx.storm.onset']);
  });

  it('a load drops actor loops and husk ids', () => {
    const r = rig();
    r.router.spawned({ actorId: 'placed', kind: 'waste-strider', skin: HUSK_SKIN });
    r.router.saveLoaded();
    expect(r.router.activeLoops).toEqual([]);
    r.router.telegraph({ actorId: 'placed', moveId: 'wraith.slash' });
    expect(r.playedAt).toEqual(['sfx.husk.rise']);
  });
});

describe('weather', () => {
  it('warning rumbles once; storm plays its onset and attaches the wind to the player; clear stops it', () => {
    const r = rig();
    r.router.weatherChanged({ kind: 'warning', from: 'clear' });
    r.router.weatherChanged({ kind: 'warning', from: 'warning' });
    r.router.weatherChanged({ kind: 'storm', from: 'warning' });
    expect(r.played).toEqual(['sfx.storm.warning', 'sfx.storm.onset']);
    expect(r.attached).toEqual([{ id: 1, key: 'sfx.storm.loop', object: r.player }]);
    r.router.weatherChanged({ kind: 'storm', from: 'storm' });
    expect(r.attached).toHaveLength(1);
    r.router.weatherChanged({ kind: 'clear', from: 'storm' });
    expect(r.detached).toEqual([1]);
    expect(r.router.activeLoops).toEqual([]);
  });

  it('a shelter flaps and muffles the wind; leaving the last shelter brings the full wind back', () => {
    const r = rig();
    r.router.weatherChanged({ kind: 'storm' });
    r.router.shelterEntered({ id: 's1' });
    r.router.shelterEntered({ id: 's1' });
    expect(r.attached.map((a) => a.key)).toEqual(['sfx.storm.loop', 'sfx.storm.muffled']);
    r.router.shelterLeft({ id: 's1' });
    r.router.shelterLeft({ id: 's1' });
    expect(r.attached.map((a) => a.key)).toEqual(['sfx.storm.loop', 'sfx.storm.muffled', 'sfx.storm.loop']);
    expect(r.played.filter((k) => k === 'sfx.shelter.flap')).toHaveLength(2);
  });

  it('a storm starting while sheltered plays the muffled wind', () => {
    const r = rig();
    r.router.shelterEntered({ id: 's1' });
    r.router.weatherChanged({ kind: 'storm' });
    expect(r.attached.map((a) => a.key)).toEqual(['sfx.storm.muffled']);
  });

  it('gusts come at seeded intervals during a storm, a rope creak every third, none sheltered or in clear weather', () => {
    const r = rig({ random: 0 });
    r.router.tick(GUST_MAX_S);
    expect(r.played).toEqual([]);
    r.router.weatherChanged({ kind: 'storm' });
    for (let i = 0; i < CREAK_EVERY_GUSTS; i++) r.router.tick(GUST_MIN_S);
    expect(r.played.filter((k) => k === 'sfx.storm.gust')).toHaveLength(CREAK_EVERY_GUSTS);
    expect(r.played.filter((k) => k === 'sfx.rope.creak')).toHaveLength(1);
    r.router.shelterEntered({ id: 's' });
    const before = r.played.length;
    r.router.tick(GUST_MAX_S * 3);
    expect(r.played.length).toBe(before + 0);
    r.router.tick(0);
    r.router.tick(Number.NaN);
    expect(r.played.length).toBe(before);
  });

  it('restore after a load sets the wind without an onset and forgets shelters', () => {
    const r = rig();
    r.router.shelterEntered({ id: 's' });
    r.router.restore('storm');
    expect(r.played).toEqual(['sfx.shelter.flap']);
    expect(r.attached.map((a) => a.key)).toEqual(['sfx.storm.loop']);
    r.router.restore('clear');
    expect(r.router.activeLoops).toEqual([]);
  });
});

describe('guards', () => {
  it('no audio service, no attach, or a throwing play is a silent no-op', () => {
    for (const opts of [{ audio: false }, { attach: false }, { throws: true }]) {
      const r = rig(opts);
      expect(() => {
        r.router.weatherChanged({ kind: 'storm' });
        r.router.telegraph({ actorId: 'placed', moveId: 'bellows.punch' });
        r.router.spawned({ actorId: 'a', kind: 'waste-strider' });
        r.router.tick(GUST_MAX_S);
        r.router.stopAll();
      }).not.toThrow();
    }
  });

  it('stopAll detaches every loop', () => {
    const r = rig();
    r.router.weatherChanged({ kind: 'storm' });
    r.router.spawned({ actorId: 'a', kind: 'waste-strider' });
    r.router.stopAll();
    expect(r.detached.sort()).toEqual([1, 2]);
    expect(r.router.weatherKind).toBe('clear');
  });
});
