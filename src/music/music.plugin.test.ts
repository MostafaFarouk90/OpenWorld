import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import type { GameContext } from '../core/Game';
import { Services } from '../core/Services';
import plugin, { setupMusic } from './music.plugin';
import { BARLEY_AND_BRAZIER as TRACK, loopSamples } from './tracks';

const SR = 8000;
const L = loopSamples(TRACK, SR);

vi.mock('../audio/proceduralSounds', () => ({
  PLACEHOLDER_SAMPLE_RATE: 44100,
  samplesToWavUrl: () => 'blob:fake',
}));

function fakeBuffer(len: number) {
  return { length: len, numberOfChannels: 1, sampleRate: SR, getChannelData: () => new Float32Array(len), copyToChannel: vi.fn() };
}

function makeEnv(opts: { withAudio?: boolean; unlocked?: boolean; stemFailsFor?: string } = {}) {
  const events = new EventBus<GameEventMap>();
  const services = new Services();
  const unlockCbs: Array<() => void> = [];
  const music = {
    isPlaying: false,
    startedAt: null as number | null,
    add: vi.fn(async (id: string) => {
      if (id === opts.stemFailsFor) throw new Error('add failed');
    }),
    start: vi.fn(function (this: typeof music) {
      music.isPlaying = true;
      music.startedAt = 0.05;
    }),
    stop: vi.fn(() => {
      music.isPlaying = false;
    }),
    setMix: vi.fn(),
  };
  const audio = {
    isUnlocked: opts.unlocked ?? false,
    context: { currentTime: 0, sampleRate: SR, createBuffer: () => fakeBuffer(L), decodeAudioData: vi.fn(async () => fakeBuffer(L)) },
    music,
    register: vi.fn(),
    playAt: vi.fn((_key: string, _pos: { x: number; y: number; z: number }): number | null => 1),
    onUnlock: vi.fn((cb: () => void) => {
      if (audio.isUnlocked) cb();
      else unlockCbs.push(cb);
    }),
  };
  if (opts.withAudio !== false) services.provide('audio', audio as never);

  const actors = new Map<string, { id: string; team: string; data: Record<string, unknown>; root: object | null; worldPosition(o: THREE.Vector3): THREE.Vector3 }>();
  const addActor = (id: string, team: string, pos: [number, number, number], data: Record<string, unknown> = {}) =>
    actors.set(id, { id, team, data, root: {}, worldPosition: (o) => o.set(...pos) });
  addActor('player', 'player', [0, 0, 0]);
  addActor('w1', 'hostile', [5, 0, 0], { audio: { material: 'ash' } });
  addActor('dummy', 'neutral', [3, 0, 0], { audio: { material: 'wood' } });

  const systems: Array<{ id: string; fixedPhase?: string; order?: number; fixedUpdate?: (dt: number, c: GameContext) => void }> = [];
  const ctx = {
    events,
    services,
    actors: { player: actors.get('player'), get: (id: string) => actors.get(id) },
    player: { feet: new THREE.Vector3() },
    systems: { add: (s: (typeof systems)[number]) => (systems.push(s), () => {}) },
  } as unknown as GameContext;
  const unlock = (): void => {
    audio.isUnlocked = true;
    unlockCbs.splice(0).forEach((cb) => cb());
  };
  return { ctx, events, services, audio, music, systems, unlock, addActor, actors };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('music plugin', () => {
  it('is a plugin with id music depending on core', () => {
    expect(plugin.id).toBe('music');
    expect(plugin.dependsOn).toEqual(['core']);
  });

  it('is a no-op without an audio service: no music service, no system', () => {
    const e = makeEnv({ withAudio: false });
    const down = setupMusic(e.ctx);
    expect(e.services.has('music')).toBe(false);
    expect(e.systems).toHaveLength(0);
    expect(() => down()).not.toThrow();
  });

  it('provides the music service and a rules-phase system at order 200, synchronously', () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    expect(e.services.has('music')).toBe(true);
    expect(e.systems[0]).toMatchObject({ id: 'music', fixedPhase: 'rules', order: 200 });
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('does not start the mixer before unlock, then starts it with the explore mix', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await flush();
    expect(e.music.add).toHaveBeenCalledTimes(TRACK.stems.length);
    expect(e.music.start).not.toHaveBeenCalled();
    e.unlock();
    expect(e.music.start).toHaveBeenCalledWith(TRACK.mixes.explore);
  });

  it('driving events before unlock records state without touching the mixer', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.events.emit('dialogue.started', { dialogueId: 'd', npcId: 'n' });
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.music.setMix).not.toHaveBeenCalled();
    await flush();
    e.unlock();
    expect(e.music.start).toHaveBeenCalledWith(TRACK.mixes.talk);
  });

  it('a stem that fails to add is skipped and the rest still start', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv({ stemFailsFor: 'melody' });
    setupMusic(e.ctx);
    await flush();
    e.unlock();
    expect(e.music.start).toHaveBeenCalled();
  });

  it('stem loading failure leaves the world running with no music', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const e = makeEnv();
    e.audio.context.createBuffer = () => {
      throw new Error('no memory');
    };
    e.audio.context.decodeAudioData = vi.fn(async () => {
      throw new Error('bad');
    });
    setupMusic(e.ctx);
    await flush();
    e.unlock();
    expect(e.music.start).not.toHaveBeenCalled();
    expect(() => e.systems[0].fixedUpdate!(1 / 60, e.ctx)).not.toThrow();
  });

  it('a stem load finishing after teardown is discarded', async () => {
    const e = makeEnv();
    const down = setupMusic(e.ctx);
    down();
    await flush();
    e.unlock();
    expect(e.music.add).not.toHaveBeenCalled();
    expect(e.music.start).not.toHaveBeenCalled();
  });

  it('teardown stops a playing mixer and is idempotent', async () => {
    const e = makeEnv({ unlocked: true });
    const down = setupMusic(e.ctx);
    await flush();
    expect(e.music.isPlaying).toBe(true);
    down();
    down();
    expect(e.music.stop).toHaveBeenCalledTimes(1);
  });

  it('events drive the director end to end: aggro, near, combat mix, calm, hysteresis, explore', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.audio.context.currentTime = 1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('combat');
    expect(e.music.setMix).toHaveBeenLastCalledWith(TRACK.mixes.combat, 0.4);
    e.events.emit('ai.calm', { actorId: 'w1' });
    e.audio.context.currentTime = 8;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('aggro on someone other than the player is ignored', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'villager' });
    e.audio.context.currentTime = 1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('mercy of the last hostile plays the ending, and dialogue and cutscene ducks use namespaced reasons', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.audio.context.currentTime = 1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    e.events.emit('mercy', { verb: 'calm', tier: 'normal', track: null, creature: 'wraith', actorId: 'w1' } as never);
    e.audio.context.currentTime = 1.1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('ending');
    e.events.emit('dialogue.started', { dialogueId: 'a', npcId: 'n' });
    e.events.emit('cutscene.started', { cutsceneId: 'a' });
    e.events.emit('dialogue.ended', { dialogueId: 'a', npcId: 'n' });
    e.audio.context.currentTime = 1.2;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.music.setMix).toHaveBeenLastCalledWith(TRACK.mixes.talk, 0.4); // cutscene:a still holds
    e.events.emit('cutscene.ended', { cutsceneId: 'a' });
    e.audio.context.currentTime = 1.3;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.music.setMix).toHaveBeenLastCalledWith(TRACK.mixes.ending, 0.4);
  });

  it('save.loaded and player respawn reset the director', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.audio.context.currentTime = 1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('combat');
    e.events.emit('actor.revived', { actorId: 'w1', reason: 'respawn', health: 1 }); // not the player: ignored
    e.audio.context.currentTime = 1.1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('combat');
    e.events.emit('actor.revived', { actorId: 'player', reason: 'respawn', health: 50 });
    e.audio.context.currentTime = 1.2;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('explore');
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.audio.context.currentTime = 1.3;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    e.events.emit('save.loaded', { slot: 's' });
    e.audio.context.currentTime = 1.4;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('setBoss and setRegionTrack on the service; an unknown track warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    const svc = e.services.get('music')!;
    svc.setBoss(true);
    e.audio.context.currentTime = 1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(svc.state).toBe('boss');
    svc.setRegionTrack('harrowmark');
    expect(warn).toHaveBeenCalled();
  });
});

describe('music plugin SFX and combat hits', () => {
  const hit = (over: Record<string, unknown>) =>
    ({ attackerId: 'player', targetId: 'w1', amount: 10, poise: 10, kind: 'melee', outcome: 'hit', dealt: 10, poiseDealt: 10, healthAfter: 50, killed: false, saved: false, staggered: false, ...over }) as never;

  it('a melee hit on an ash wraith plays the ash impact at the hit point', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.audio.playAt.mockClear();
    e.events.emit('damage.dealt', hit({ point: new THREE.Vector3(1, 2, 3) }));
    expect(e.audio.playAt).toHaveBeenCalledTimes(1);
    expect(e.audio.playAt.mock.calls[0][0]).toMatch(/^sfx\.impact\.ash#/);
    expect(e.audio.playAt.mock.calls[0][1]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('falls back to the target position when the hit has no point; heavy adds the thump', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.audio.playAt.mockClear();
    e.events.emit('damage.dealt', hit({ killed: true }));
    const keys = e.audio.playAt.mock.calls.map((c) => c[0] as string);
    expect(keys.some((k) => k.startsWith('sfx.thump'))).toBe(true);
    expect(e.audio.playAt.mock.calls[0][1]).toMatchObject({ x: 5, y: 0, z: 0 });
  });

  it('unknown material warns once and plays flesh; unknown target plays nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv({ unlocked: true });
    e.addActor('odd', 'hostile', [1, 0, 0], { audio: { material: 'glass' } });
    setupMusic(e.ctx);
    await flush();
    e.audio.playAt.mockClear();
    e.events.emit('damage.dealt', hit({ targetId: 'odd' }));
    e.events.emit('damage.dealt', hit({ targetId: 'odd' }));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('glass'))).toHaveLength(1);
    expect(String(e.audio.playAt.mock.calls[0][0])).toMatch(/^sfx\.impact\.flesh#/);
    e.audio.playAt.mockClear();
    e.events.emit('damage.dealt', hit({ targetId: 'ghost' }));
    expect(e.audio.playAt).not.toHaveBeenCalled();
  });

  it('blocked, parried and immune outcomes', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    for (const [outcome, prefix] of [['blocked', 'sfx.block'], ['parried', 'sfx.parry']] as const) {
      e.audio.playAt.mockClear();
      e.events.emit('damage.dealt', hit({ outcome, attackerId: 'w1', targetId: 'player' }));
      expect(String(e.audio.playAt.mock.calls[0][0])).toMatch(new RegExp(`^${prefix.replace('.', '\\.')}#`));
    }
    e.audio.playAt.mockClear();
    e.events.emit('damage.dealt', hit({ outcome: 'immune', attackerId: 'w1', targetId: 'player' }));
    expect(e.audio.playAt).not.toHaveBeenCalled();
  });

  it('player attacks on a dummy or a fall do not start combat music; a hostile hit on the player does', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.audio.context.currentTime = 1;
    e.events.emit('damage.dealt', hit({ targetId: 'dummy' }));
    e.events.emit('damage.dealt', hit({ attackerId: null, targetId: 'player', kind: 'fall' }));
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('explore');
    e.events.emit('damage.dealt', hit({ attackerId: 'w1', targetId: 'player' }));
    e.audio.context.currentTime = 1.1;
    e.systems[0].fixedUpdate!(1 / 60, e.ctx);
    expect(e.services.get('music')!.state).toBe('combat');
  });

  it('attack.window open plays a swing for the player and an enemy; close and missing actors do not', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.audio.playAt.mockClear();
    e.events.emit('attack.window', { actorId: 'player', attackId: '1H_Melee_Attack_Slice_Horizontal', swingId: 1, phase: 'open' });
    e.events.emit('attack.window', { actorId: 'w1', attackId: '1H_Melee_Attack_Chop', swingId: 1, phase: 'open' });
    e.events.emit('attack.window', { actorId: 'w1', attackId: 'x', swingId: 1, phase: 'close' });
    e.events.emit('attack.window', { actorId: 'ghost', attackId: 'x', swingId: 1, phase: 'open' });
    const keys = e.audio.playAt.mock.calls.map((c) => c[0] as string);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^sfx\.swing\.light#/);
    expect(keys[1]).toMatch(/^sfx\.swing\.heavy#/);
  });

  it('SFX while audio is locked play nothing', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await flush();
    e.events.emit('damage.dealt', hit({}));
    expect(e.audio.playAt).not.toHaveBeenCalled();
  });
});
