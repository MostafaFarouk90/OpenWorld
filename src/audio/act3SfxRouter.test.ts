import { describe, expect, it } from 'vitest';
import { ACT3_SFX_KEYS } from './act3Sfx';
import {
  Act3SfxRouter,
  BREATH_WARN_AT,
  DIED_SFX_ACT3,
  EVENT_SFX_ACT3,
  HATHREN_BEAT_SFX,
  LOOP_SFX_ACT3,
  MOVE_SFX_ACT3,
  WADE_STEP_METRES,
  type Act3SfxPorts,
} from './act3SfxRouter';

interface Rig {
  router: Act3SfxRouter;
  played: string[];
  playedAt: Array<{ key: string; at: { x: number; y: number; z: number } }>;
  attached: Array<{ id: number; key: string; object: object }>;
  detached: number[];
  audioOn: { v: boolean };
  throwing: { v: boolean };
  returnNull: { v: boolean };
  ensured: string[];
}

function rig(opts: { objects?: Record<string, object>; player?: object | undefined } = { player: {} }): Rig {
  const played: string[] = [];
  const playedAt: Rig['playedAt'] = [];
  const attached: Rig['attached'] = [];
  const detached: number[] = [];
  const ensured: string[] = [];
  const audioOn = { v: true };
  const throwing = { v: false };
  const returnNull = { v: false };
  let nextId = 1;
  const guard = () => {
    if (throwing.v) throw new Error('no such sound');
  };
  const audio = {
    play: (key: string) => (guard(), played.push(key), returnNull.v ? null : 1),
    playAt: (key: string, at: { x: number; y: number; z: number }) => (guard(), playedAt.push({ key, at }), returnNull.v ? null : 1),
    attach: (key: string, object: object) => (guard(), attached.push({ id: nextId, key, object }), nextId++),
    detach: (id: number) => void detached.push(id),
  };
  const ports: Act3SfxPorts = {
    audio: () => (audioOn.v ? audio : undefined),
    actor: (id) => (id === 'a#1' ? { kind: 'x', position: { x: 1, y: 2, z: 3 } } : id === 'unplaced' ? { kind: 'x', position: null } : undefined),
    object: (id) => opts.objects?.[id],
    playerObject: () => ('player' in opts ? opts.player : {}),
    ensure: (k) => void ensured.push(k),
  };
  return { router: new Act3SfxRouter(ports), played, playedAt, attached, detached, audioOn, throwing, returnNull, ensured };
}

describe('route tables', () => {
  it('every value of every table is a registered key', () => {
    const all = [
      ...Object.values(MOVE_SFX_ACT3),
      ...Object.values(DIED_SFX_ACT3),
      ...Object.values(HATHREN_BEAT_SFX),
      ...Object.values(EVENT_SFX_ACT3),
      ...Object.values(LOOP_SFX_ACT3),
    ];
    expect(all.length).toBeGreaterThan(30);
    for (const k of all) expect(ACT3_SFX_KEYS as readonly string[], k).toContain(k);
  });

  it('every key has a route to it, except the ones with no emitter yet (registered and silent)', () => {
    const routed = new Set<string>([
      ...Object.values(MOVE_SFX_ACT3),
      ...Object.values(DIED_SFX_ACT3),
      ...Object.values(HATHREN_BEAT_SFX),
      ...Object.values(EVENT_SFX_ACT3),
      ...Object.values(LOOP_SFX_ACT3),
    ]);
    expect(ACT3_SFX_KEYS.filter((k) => !routed.has(k))).toEqual(['sfx.ysmeryth.roar']);
  });

  it('uses the shipped kind strings and the Hathren spelling', () => {
    expect(Object.keys(DIED_SFX_ACT3)).toEqual(['fen-leech', 'peat-shambler', 'rime-hawk', 'crag-ogre']);
    expect(Object.values(HATHREN_BEAT_SFX).every((k) => k.startsWith('sfx.wyrm.hathren.'))).toBe(true);
  });
});

describe('Act3SfxRouter one-shots', () => {
  it('plays each telegraph and death at the actor, or flat when the actor is unplaced or unknown', () => {
    for (const [moveId, key] of Object.entries(MOVE_SFX_ACT3)) {
      const r = rig();
      r.router.telegraph({ actorId: 'a#1', moveId });
      expect(r.playedAt, moveId).toEqual([{ key, at: { x: 1, y: 2, z: 3 } }]);
    }
    const r = rig();
    r.router.telegraph({ actorId: 'unplaced', moveId: 'leech.lunge' });
    r.router.telegraph({ actorId: 'ghost', moveId: 'leech.bite' });
    r.router.died({ actorId: 'a#1', kind: 'fen-leech' });
    expect(r.played).toEqual(['sfx.leech.lunge', 'sfx.leech.bite']);
    expect(r.playedAt.map((p) => p.key)).toEqual(['sfx.leech.squelch']);
  });

  it('hawk.stoop plays the shriek', () => {
    const r = rig();
    r.router.telegraph({ actorId: 'a#1', moveId: 'hawk.stoop' });
    expect(r.playedAt[0].key).toBe('sfx.hawk.shriek');
  });

  it('an unknown move or kind plays nothing', () => {
    const r = rig();
    r.router.telegraph({ actorId: 'a#1', moveId: 'wraith.claw' });
    r.router.telegraph({ actorId: 'a#1', moveId: 'toString' });
    r.router.telegraph({ actorId: 'a#1', moveId: '__proto__' });
    r.router.died({ actorId: 'a#1', kind: 'wraith' });
    r.router.died({ actorId: 'a#1', kind: 'constructor' });
    r.router.hathren({ beat: 'toString' });
    expect([...r.played, ...r.playedAt]).toEqual([]);
  });

  it('water enter and leave cue only wading water', () => {
    const r = rig();
    r.router.waterEntered({ kind: 'deep' });
    r.router.waterEntered({ kind: 'dive' });
    r.router.waterLeft({ kind: 'dive' });
    expect(r.played).toEqual([]);
    r.router.waterEntered({ kind: 'wade' });
    r.router.waterLeft({ kind: 'wade' });
    expect(r.played).toEqual(['sfx.water.enter', 'sfx.water.leave']);
  });

  it('routes the Hathren beats, with nothing for netDropped, scale and gone', () => {
    const r = rig();
    for (const beat of ['wake', 'thrash', 'spray', 'netDropped', 'rise', 'roar', 'quiet', 'dive', 'scale', 'gone'])
      r.router.hathren({ beat });
    expect(r.played).toEqual([
      'sfx.wyrm.hathren.splash',
      'sfx.wyrm.hathren.thrash',
      'sfx.wyrm.hathren.spray',
      'sfx.wyrm.hathren.splash',
      'sfx.wyrm.hathren.roar',
      'sfx.wyrm.hathren.song',
      'sfx.wyrm.hathren.dive',
    ]);
  });

  it('plays the dive, glide landing and drake cues', () => {
    const r = rig();
    r.router.diveStarted();
    r.router.diveSurfaced();
    r.router.glideLanded();
    r.router.drakeChainStruck();
    r.router.drakeFreed();
    expect(r.played).toEqual(['sfx.dive.in', 'sfx.dive.out', 'sfx.glide.land', 'sfx.drake.chain', 'sfx.drake.freed']);
  });

  it('asks for the key to be rendered before playing it', () => {
    const r = rig();
    r.router.telegraph({ actorId: 'a#1', moveId: 'ogre.slam' });
    r.router.waterEntered({ kind: 'wade' });
    expect(r.ensured).toEqual(['sfx.ogre.slam', 'sfx.water.enter']);
  });
});

describe('Act3SfxRouter failure paths', () => {
  const everything = (r: Rig) => {
    r.router.telegraph({ actorId: 'a#1', moveId: 'ogre.slam' });
    r.router.telegraph({ actorId: 'ghost', moveId: 'ogre.slam' });
    r.router.died({ actorId: 'a#1', kind: 'crag-ogre' });
    r.router.waterEntered({ kind: 'wade' });
    r.router.waterLeft({ kind: 'wade' });
    r.router.wadeStep(1, 3, true);
    r.router.diveStarted();
    r.router.breathChanged({ value: 3 });
    r.router.diveSurfaced();
    r.router.glideStarted();
    r.router.glideLanded();
    r.router.glideEnded();
    r.router.ferryBoarded();
    r.router.ferryArrived();
    r.router.hathren({ beat: 'roar' });
    r.router.dragonFlight({ actorId: 'a#1', on: true });
    r.router.dragonFlight({ actorId: 'a#1', on: false });
    r.router.drakeChainStruck();
    r.router.drakeFreed();
    r.router.saveLoaded();
  };

  it('is silent without an audio service', () => {
    const r = rig({ objects: { 'a#1': {} } });
    r.audioOn.v = false;
    expect(() => everything(r)).not.toThrow();
    expect(r.played).toEqual([]);
    expect(r.attached).toEqual([]);
  });

  it('swallows a play or attach that throws (an unregistered key)', () => {
    const r = rig({ objects: { 'a#1': {} } });
    r.throwing.v = true;
    expect(() => everything(r)).not.toThrow();
    expect(r.router.activeLoops).toEqual([]);
  });

  it('a suspended context (play returns null) never throws', () => {
    const r = rig({ objects: { 'a#1': {} } });
    r.returnNull.v = true;
    expect(() => everything(r)).not.toThrow();
    expect(r.played.length).toBeGreaterThan(3);
  });

  it('a failed attach is not remembered, so a later start can try again', () => {
    const r = rig();
    r.throwing.v = true;
    r.router.glideStarted();
    r.throwing.v = false;
    r.router.glideStarted();
    expect(r.attached).toHaveLength(1);
  });

  it('a glide with no player object starts no loop', () => {
    const r = rig({ player: undefined });
    r.router.glideStarted();
    r.router.ferryBoarded();
    expect(r.attached).toEqual([]);
    expect(r.played).toEqual(['sfx.ferry.board']);
  });
});

describe('Act3SfxRouter breath warning', () => {
  it('stays silent above the threshold and fires once per whole second at or below it', () => {
    const r = rig();
    for (const v of [30, 12, 6, 5.01]) r.router.breathChanged({ value: v });
    expect(r.played).toEqual([]);
    for (const v of [5, 4.9, 4.5, 4.01]) r.router.breathChanged({ value: v });
    // 5 and 4.9 are two different whole seconds (5, 4); 4.5 and 4.01 stay in 4.
    expect(r.played).toEqual(['sfx.dive.breath-warn', 'sfx.dive.breath-warn']);
    r.router.breathChanged({ value: 3.99 });
    r.router.breathChanged({ value: 3.5 });
    expect(r.played).toHaveLength(3);
    expect(BREATH_WARN_AT).toBe(5);
  });

  it('does not fire twice for the same second, however often the value is reported', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) r.router.breathChanged({ value: 3.2 });
    expect(r.played).toHaveLength(1);
  });

  it('counts down one cue per second', () => {
    const r = rig();
    for (let v = 5.5; v > 0; v -= 0.1) r.router.breathChanged({ value: v });
    expect(r.played).toHaveLength(5); // 5, 4, 3, 2, 1 and the last 0.x is whole 0
    expect(r.played.length).toBeLessThanOrEqual(6);
  });

  it('resets on surfacing and on a refill, and ignores garbage', () => {
    const r = rig();
    r.router.breathChanged({ value: 3.5 });
    r.router.diveSurfaced();
    r.router.breathChanged({ value: 3.5 });
    expect(r.played.filter((k) => k === 'sfx.dive.breath-warn')).toHaveLength(2);
    r.router.breathChanged({ value: 30 }); // refilled at a pocket
    r.router.breathChanged({ value: 3.5 });
    expect(r.played.filter((k) => k === 'sfx.dive.breath-warn')).toHaveLength(3);
    r.router.breathChanged({ value: NaN });
    r.router.breathChanged({ value: -1 });
    expect(r.played.filter((k) => k === 'sfx.dive.breath-warn')).toHaveLength(3);
  });

  it('a refill that stays at or under the threshold counts again', () => {
    const r = rig();
    r.router.breathChanged({ value: 2.5 });
    r.router.breathChanged({ value: 4.8 });
    r.router.breathChanged({ value: 4.5 });
    expect(r.played).toHaveLength(2);
  });
});

describe('Act3SfxRouter wading', () => {
  const walk = (r: Rig, speed: number, seconds: number, wading = true) => {
    for (let t = 0; t < seconds * 60; t++) r.router.wadeStep(1 / 60, speed, wading);
  };
  const sloshes = (r: Rig) => r.played.filter((k) => k === 'sfx.water.wade').length;

  it('sloshes once per step length, so a faster walk sloshes faster', () => {
    const slow = rig();
    const fast = rig();
    walk(slow, 1.5, 10); // 15 m
    walk(fast, 3, 10); // 30 m
    expect(sloshes(slow)).toBeGreaterThanOrEqual(Math.floor(15 / WADE_STEP_METRES) - 1);
    expect(sloshes(slow)).toBeLessThanOrEqual(Math.ceil(15 / WADE_STEP_METRES) + 1);
    expect(sloshes(fast)).toBeGreaterThan(sloshes(slow) * 1.7);
  });

  it('stops out of water, when standing and on a teleport-sized jump', () => {
    const r = rig();
    walk(r, 3, 5, false);
    walk(r, 0, 5);
    walk(r, 0.2, 5);
    walk(r, 200, 1);
    r.router.wadeStep(0, 3, true);
    r.router.wadeStep(NaN, 3, true);
    r.router.wadeStep(1 / 60, NaN, true);
    expect(sloshes(r)).toBe(0);
  });

  it('starts again when the water is entered again', () => {
    const r = rig();
    walk(r, 3, 2);
    const first = sloshes(r);
    expect(first).toBeGreaterThan(0);
    walk(r, 3, 2, false);
    expect(sloshes(r)).toBe(first);
    walk(r, 3, 2);
    expect(sloshes(r)).toBeGreaterThan(first);
  });
});

describe('Act3SfxRouter loops', () => {
  it('the glide wind attaches once to the player and detaches on landing or any other end', () => {
    const player = {};
    const r = rig({ player });
    r.router.glideStarted();
    r.router.glideStarted();
    expect(r.attached).toEqual([{ id: 1, key: 'sfx.glide.wind', object: player }]);
    r.router.glideLanded();
    r.router.glideEnded();
    expect(r.detached).toEqual([1]);
    r.router.glideEnded();
    expect(r.detached).toEqual([1]);
    r.router.glideStarted();
    expect(r.attached).toHaveLength(2);
  });

  it('save.loaded mid-glide detaches the wind', () => {
    const r = rig();
    r.router.glideStarted();
    r.router.saveLoaded();
    expect(r.detached).toEqual([1]);
    expect(r.router.activeLoops).toEqual([]);
    r.router.glideEnded();
    expect(r.detached).toEqual([1]);
  });

  it('the ferry plays the board cue and the pole loop, then detaches with the bell', () => {
    const r = rig();
    r.router.ferryBoarded();
    r.router.ferryBoarded();
    expect(r.played).toEqual(['sfx.ferry.board', 'sfx.ferry.board']);
    expect(r.attached.map((a) => a.key)).toEqual(['sfx.ferry.pole']);
    r.router.ferryArrived();
    expect(r.detached).toEqual([1]);
    expect(r.played.at(-1)).toBe('sfx.ferry.bell');
  });

  it('save.loaded mid-ferry detaches the pole, with no bell', () => {
    const r = rig();
    r.router.ferryBoarded();
    r.router.saveLoaded();
    expect(r.detached).toEqual([1]);
    expect(r.played).toEqual(['sfx.ferry.board']);
  });

  it('an arrival with no ride in progress still rings the bell and detaches nothing', () => {
    const r = rig();
    r.router.ferryArrived();
    expect(r.played).toEqual(['sfx.ferry.bell']);
    expect(r.detached).toEqual([]);
  });

  it('dragon flight loops follow the actor, one per actor, and stop with their own off', () => {
    const a = {};
    const b = {};
    const r = rig({ objects: { 'a#1': a, 'b#2': b } });
    r.router.dragonFlight({ actorId: 'a#1', on: true });
    r.router.dragonFlight({ actorId: 'b#2', on: true });
    expect(r.attached.map((x) => [x.key, x.object])).toEqual([
      ['sfx.dragon.wingbeat', a],
      ['sfx.dragon.wingbeat', b],
    ]);
    r.router.dragonFlight({ actorId: 'a#1', on: false });
    r.router.dragonFlight({ actorId: 'a#1', on: false });
    expect(r.detached).toEqual([1]);
    r.router.saveLoaded();
    expect(r.detached).toEqual([1, 2]);
  });

  it('a name-only actorId with no object plays one flat beat and never throws or loops', () => {
    const r = rig();
    expect(() => {
      r.router.dragonFlight({ actorId: 'ysmeryth', on: true });
      r.router.dragonFlight({ actorId: 'ysmeryth', on: false });
    }).not.toThrow();
    expect(r.attached).toEqual([]);
    expect(r.played).toEqual(['sfx.dragon.wingbeat']);
    expect(r.detached).toEqual([]);
  });

  it('every loop detaches on every end path, leaving none behind', () => {
    const r = rig({ objects: { 'a#1': {} } });
    r.router.glideStarted();
    r.router.ferryBoarded();
    r.router.dragonFlight({ actorId: 'a#1', on: true });
    expect(r.router.activeLoops).toHaveLength(3);
    r.router.stopAll();
    expect(r.router.activeLoops).toEqual([]);
    expect([...r.detached].sort()).toEqual([1, 2, 3]);
  });
});

describe('loops that end without their end event', () => {
  it('a ferry ride cut short (movement.mode leaves ferry) detaches the pole, and glide likewise', () => {
    const r = rig();
    r.router.ferryBoarded();
    r.router.glideStarted();
    expect(r.attached.map((a) => a.key)).toEqual([LOOP_SFX_ACT3.ferry, LOOP_SFX_ACT3.glide]);
    r.router.movementMode({ mode: 'walk', previous: 'ferry' });
    expect(r.detached).toEqual([1]);
    r.router.movementMode({ mode: 'walk', previous: 'glide' });
    expect(r.detached).toEqual([1, 2]);
    r.router.movementMode({ mode: 'ferry', previous: 'walk' }); // entering does nothing
    expect(r.detached).toEqual([1, 2]);
  });

  it('a wing-beat loop the audio manager auto-detached is re-attached on the next flight start', () => {
    const obj = {};
    const r = rig({ objects: { ysmeryth: obj } });
    r.router.dragonFlight({ actorId: 'ysmeryth', on: true });
    r.router.dragonFlight({ actorId: 'ysmeryth', on: true }); // stale record: detach then attach
    expect(r.attached).toHaveLength(2);
    expect(r.detached).toEqual([1]);
    r.router.dragonFlight({ actorId: 'ysmeryth', on: false });
    expect(r.detached).toEqual([1, 2]);
  });
});
