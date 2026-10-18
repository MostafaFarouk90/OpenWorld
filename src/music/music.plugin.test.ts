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

function makeNode() {
  const param = () => ({ value: 1, ramps: [] as number[], cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(function (this: { value: number; ramps: number[] }, to: number) { this.value = to; this.ramps.push(to); }) });
  return { gain: param(), buffer: null as unknown, connect: vi.fn(), disconnect: vi.fn() };
}
const busNode = makeNode();

function makeEnv(opts: { withAudio?: boolean; unlocked?: boolean; stemFailsFor?: string; withBus?: boolean } = {}) {
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
    context: {
      currentTime: 0,
      sampleRate: SR,
      state: 'running',
      createBuffer: () => fakeBuffer(L),
      decodeAudioData: vi.fn(async () => fakeBuffer(L)),
      createGain: () => makeNode(),
      createConvolver: () => makeNode(),
    } as Record<string, unknown> & { currentTime: number; state: string },
    musicBus: (opts.withBus ? busNode : undefined) as ReturnType<typeof makeNode> | undefined,
    masterNode: (opts.withBus ? makeNode() : undefined) as ReturnType<typeof makeNode> | undefined,
    play: vi.fn((_key: string): number | null => 1),
    music,
    register: vi.fn(),
    playAt: vi.fn((_key: string, _pos: { x: number; y: number; z: number }): number | null => 1),
    onUnlock: vi.fn((cb: () => void) => {
      if (audio.isUnlocked) cb();
      else unlockCbs.push(cb);
    }),
  };
  if (opts.withAudio !== false) services.provide('audio', audio as never);

  const actors = new Map<string, { id: string; team: string; dead?: boolean; data: Record<string, unknown>; root: object | null; worldPosition(o: THREE.Vector3): THREE.Vector3 }>();
  const addActor = (id: string, team: string, pos: [number, number, number], data: Record<string, unknown> = {}) =>
    actors.set(id, { id, team, data, root: {}, worldPosition: (o) => o.set(...pos) });
  addActor('player', 'player', [0, 0, 0]);
  addActor('w1', 'hostile', [5, 0, 0], { audio: { material: 'ash' } });
  addActor('dummy', 'neutral', [3, 0, 0], { audio: { material: 'wood' } });

  const bossStates = new Map<string, { phase: number; outcome?: string | null; releaseOpen?: boolean }>();
  const systems: Array<{ id: string; fixedPhase?: string; order?: number; fixedUpdate?: (dt: number, c: GameContext) => void }> = [];
  const ctx = {
    events,
    services,
    actors: { player: actors.get('player'), get: (id: string) => actors.get(id), all: () => actors.values() },
    state: { isMercied: () => false },
    bosses: { state: (id: string) => bossStates.get(id) ?? null, active: () => [...bossStates.keys()] },
    player: { feet: new THREE.Vector3() },
    systems: { add: (s: (typeof systems)[number]) => (systems.push(s), () => {}) },
  } as unknown as GameContext;
  const unlock = (): void => {
    audio.isUnlocked = true;
    unlockCbs.splice(0).forEach((cb) => cb());
  };
  const tickTo = (t: number): void => {
    const dt = Math.max(1 / 60, t - audio.context.currentTime);
    audio.context.currentTime += dt;
    systems[0].fixedUpdate!(dt, ctx);
  };
  return { ctx, events, services, audio, music, systems, unlock, addActor, actors, tickTo, bossStates };
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
    expect(e.music.add).toHaveBeenCalledTimes(TRACK.stems.length); // all seven, including the boss stem
    expect(e.music.start).not.toHaveBeenCalled();
    e.unlock();
    expect(e.music.start).toHaveBeenCalledWith(TRACK.mixes.explore);
  });

  it('driving events before unlock records state without touching the mixer', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.events.emit('dialogue.started', { dialogueId: 'd', npcId: 'n' });
    e.tickTo(e.audio.context.currentTime + 1 / 60);
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
    expect(() => e.tickTo(e.audio.context.currentTime + 1 / 60)).not.toThrow();
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
    e.tickTo(1);
    expect(e.services.get('music')!.state).toBe('combat');
    expect(e.music.setMix).toHaveBeenLastCalledWith(TRACK.mixes.combat, 0.4);
    e.events.emit('ai.calm', { actorId: 'w1' });
    e.tickTo(8);
    expect(e.services.get('music')!.state).toBe('combat'); // calmed but still 5 m away: holds
    e.actors.get('w1')!.worldPosition = (o) => o.set(50, 0, 0);
    e.tickTo(15);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('aggro on someone other than the player is ignored', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'villager' });
    e.tickTo(1);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('mercy of the last hostile plays the ending, and dialogue and cutscene ducks use namespaced reasons', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.tickTo(1);
    e.events.emit('mercy', { verb: 'calm', tier: 'normal', track: null, creature: 'wraith', actorId: 'w1' } as never);
    e.tickTo(1.1);
    expect(e.services.get('music')!.state).toBe('ending');
    e.events.emit('dialogue.started', { dialogueId: 'a', npcId: 'n' });
    e.events.emit('cutscene.started', { cutsceneId: 'a' });
    e.events.emit('dialogue.ended', { dialogueId: 'a', npcId: 'n' });
    e.tickTo(1.2);
    expect(e.music.setMix).toHaveBeenLastCalledWith(TRACK.mixes.talk, 0.4); // cutscene:a still holds
    e.events.emit('cutscene.ended', { cutsceneId: 'a' });
    e.tickTo(1.3);
    expect(e.music.setMix).toHaveBeenLastCalledWith(TRACK.mixes.ending, 0.4);
  });

  it('save.loaded and player respawn reset the director', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.tickTo(1);
    expect(e.services.get('music')!.state).toBe('combat');
    e.events.emit('actor.revived', { actorId: 'w1', reason: 'respawn', health: 1 }); // not the player: ignored
    e.tickTo(1.1);
    expect(e.services.get('music')!.state).toBe('combat');
    e.events.emit('actor.revived', { actorId: 'player', reason: 'respawn', health: 50 });
    e.tickTo(1.2);
    expect(e.services.get('music')!.state).toBe('explore');
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.tickTo(1.3);
    e.events.emit('save.loaded', { slot: 's' });
    e.tickTo(1.4);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('setBoss and setRegionTrack on the service; an unknown track warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    const svc = e.services.get('music')!;
    svc.setBoss(true);
    e.tickTo(1);
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
    e.tickTo(e.audio.context.currentTime + 1 / 60);
    expect(e.services.get('music')!.state).toBe('explore');
    e.events.emit('damage.dealt', hit({ attackerId: 'w1', targetId: 'player' }));
    e.tickTo(1.1);
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

describe('music plugin spell sounds', () => {
  it('registers the three spell sounds with the audio manager under their exact keys', () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    const keys = e.audio.register.mock.calls.map((c) => c[0] as string);
    for (const id of ['sfx.surge.charge', 'sfx.surge.release', 'sfx.rally']) expect(keys).toContain(id);
  });

  it('without an audio service nothing is registered, so a spell plugin must tolerate missing audio', () => {
    const e = makeEnv({ withAudio: false });
    setupMusic(e.ctx);
    expect(e.audio.register).not.toHaveBeenCalled();
  });
});

describe('music plugin review fixes', () => {
  const hit = (over: Record<string, unknown>) =>
    ({ attackerId: 'player', targetId: 'w1', amount: 10, poise: 10, kind: 'melee', outcome: 'hit', dealt: 10, poiseDealt: 10, healthAfter: 50, killed: false, saved: false, staggered: false, ...over }) as never;
  const far = (e: ReturnType<typeof makeEnv>, id: string): void => {
    e.actors.get(id)!.worldPosition = (o) => o.set(50, 0, 0);
  };

  it('a hostile that hits the player joins the fight, so sparing it plays the ending', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    far(e, 'w1');
    e.events.emit('damage.dealt', hit({ attackerId: 'w1', targetId: 'player' }));
    e.tickTo(1);
    expect(e.services.get('music')!.state).toBe('combat');
    e.events.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'x', actorId: 'w1' } as never);
    e.tickTo(1.1);
    expect(e.services.get('music')!.state).toBe('ending');
  });

  it('a hostile standing within 12 m with no aggro event keeps combat open; a mercied one does not', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('damage.dealt', hit({ attackerId: 'w1', targetId: 'player' }));
    e.events.emit('ai.calm', { actorId: 'w1' });
    e.tickTo(0.5);
    e.tickTo(20);
    expect(e.services.get('music')!.state).toBe('combat');
    (e.ctx.state as { isMercied: (id: string) => boolean }).isMercied = () => true;
    e.tickTo(30);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('falls, script damage and spell hits play no impact sound', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.audio.playAt.mockClear();
    for (const kind of ['fall', 'script', 'spell']) e.events.emit('damage.dealt', hit({ kind }));
    expect(e.audio.playAt).not.toHaveBeenCalled();
  });

  it('discover and waystone.rekindled schedule a phrase; actor.died and despawn drop hostiles', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('discover', { placeId: 'brightwater', kind: 'region' });
    for (let t = 1; t <= 60; t++) e.tickTo(t);
    expect(e.music.setMix).toHaveBeenCalledWith(TRACK.mixes.discover, 0.4);
    e.music.setMix.mockClear();
    e.events.emit('waystone.rekindled', { waystoneId: 'w', cause: 'player' });
    for (let t = 61; t <= 120; t++) e.tickTo(t);
    expect(e.music.setMix).toHaveBeenCalledWith(TRACK.mixes.discover, 0.4);

    far(e, 'w1');
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.events.emit('actor.died', { actorId: 'w1', killerId: 'player', kind: 'x', team: 'hostile', level: 1, spawnTag: undefined });
    e.tickTo(130);
    expect(e.services.get('music')!.state).toBe('explore');
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.events.emit('actor.despawned', { actorId: 'w1' });
    e.tickTo(140);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('an aggro retargeted to someone else removes the actor from the fight', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'villager' });
    far(e, 'w1');
    e.tickTo(1);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('a mercy with no actorId and a .ended for an unknown duck are harmless', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.events.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'x' } as never);
    e.events.emit('dialogue.ended', { dialogueId: 'never', npcId: 'n' });
    e.events.emit('cutscene.ended', { cutsceneId: 'never' });
    e.tickTo(1);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('the opening discover (before the first gesture) plays after unlock', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    e.events.emit('discover', { placeId: 'brightwater', kind: 'region' });
    await flush();
    e.unlock();
    for (let t = 1; t <= 40; t++) e.tickTo(t);
    expect(e.music.setMix).toHaveBeenCalledWith(TRACK.mixes.discover, 0.4);
  });

  it('teardown between the stem load and the unlock keeps the mixer from starting', async () => {
    const e = makeEnv();
    const down = setupMusic(e.ctx);
    await flush();
    down();
    e.unlock();
    expect(e.music.start).not.toHaveBeenCalled();
  });

  it('a throwing mixer start is contained inside the unlock callback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv();
    e.music.start.mockImplementation(() => {
      throw new Error('context closed');
    });
    setupMusic(e.ctx);
    await flush();
    expect(() => e.unlock()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('a second setup on the same audio does not throw (duplicate stems are skipped)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv();
    e.music.add.mockRejectedValue(new Error('Stem is already added'));
    setupMusic(e.ctx);
    await flush();
    expect(() => e.unlock()).not.toThrow();
  });

  it('the default export tears down every setup on dispose', () => {
    const e = makeEnv();
    plugin.setup(e.ctx);
    plugin.dispose!();
    plugin.dispose!();
    expect(e.services.has('music')).toBe(true); // unprovide is the loader's scoped job
  });

  it('pausing the game (no fixed ticks) while the audio clock runs does not start silence or end a phrase', async () => {
    const e = makeEnv({ unlocked: true });
    setupMusic(e.ctx);
    await flush();
    e.audio.context.currentTime += 200; // audio clock runs on; no simulated ticks
    e.tickTo(e.audio.context.currentTime + 1 / 60);
    expect(e.music.setMix).not.toHaveBeenCalled();
  });
});


describe('slice 2 music behaviour', () => {
  const start = async (opts: Parameters<typeof makeEnv>[0] = {}) => {
    const e = makeEnv({ unlocked: true, ...opts });
    setupMusic(e.ctx);
    await flush();
    e.audio.context.currentTime = 1;
    e.tickTo(1 + 1 / 60);
    return e;
  };
  const lastMix = (e: Awaited<ReturnType<typeof start>>) => e.music.setMix.mock.calls.at(-1)?.[0];

  it('follows the core boss events: started, phase, release window hush, defeated then ending', async () => {
    const e = await start();
    e.bossStates.set('ashen-prior', { phase: 1 });
    e.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'b' });
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(e.services.get('music')!.state).toBe('boss');
    expect(lastMix(e)).toBe(TRACK.bossMixes!['ashen-prior'].phases[0]);
    e.events.emit('boss.phase', { bossId: 'ashen-prior', phase: 2, previous: 1 });
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(lastMix(e)).toBe(TRACK.bossMixes!['ashen-prior'].phases[1]);
    e.events.emit('boss.releaseWindow', { bossId: 'ashen-prior', open: true });
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(lastMix(e)).toBe(TRACK.bossMixes!['ashen-prior'].hush);
    e.events.emit('boss.released', { bossId: 'ashen-prior', actorId: 'b' });
    e.events.emit('boss.releaseWindow', { bossId: 'ashen-prior', open: false });
    e.events.emit('boss.ended', { bossId: 'ashen-prior', actorId: 'b', reason: 'unregistered' });
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(e.services.get('music')!.state).toBe('ending');
  });

  it('reads the boss phase from the registry on boss.started (a boss registered mid-fight)', async () => {
    const e = await start();
    e.bossStates.set('ashen-prior', { phase: 3 });
    e.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'b' });
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(lastMix(e)).toBe(TRACK.bossMixes!['ashen-prior'].phases[2]);
  });

  it('a stray music.setBoss(false) from another thread does not end a registry boss', async () => {
    const e = await start();
    e.bossStates.set('ashen-prior', { phase: 1 });
    e.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'b' });
    e.services.get('music')!.setBoss(false);
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(e.services.get('music')!.state).toBe('boss');
  });

  it('save.loaded re-derives bosses the registry still holds', async () => {
    const e = await start();
    e.bossStates.set('ashen-prior', { phase: 2 });
    e.events.emit('save.loaded', {} as never);
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(e.services.get('music')!.state).toBe('boss');
  });

  it('save.loaded and respawn do not bring back a boss that already has an outcome', async () => {
    const e = await start();
    e.bossStates.set('ashen-prior', { phase: 2, outcome: 'released' });
    e.events.emit('save.loaded', {} as never);
    e.events.emit('actor.revived', { actorId: 'player', reason: 'respawn' } as never);
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(e.services.get('music')!.state).toBe('explore');
  });

  it('an open Release window survives a reload as the hush mix', async () => {
    const e = await start();
    e.bossStates.set('ashen-prior', { phase: 1, releaseOpen: true });
    e.events.emit('save.loaded', {} as never);
    e.tickTo(e.audio.context.currentTime + 0.1);
    expect(lastMix(e)).toBe(TRACK.bossMixes!['ashen-prior'].hush);
  });

  it('a boss registered before setup is picked up', async () => {
    const e = makeEnv({ unlocked: true });
    e.bossStates.set('ashen-prior', { phase: 1 });
    setupMusic(e.ctx);
    await flush();
    e.audio.context.currentTime = 1;
    e.tickTo(1 + 1 / 60);
    expect(e.services.get('music')!.state).toBe('boss');
  });

  it('beat() is null after teardown and beats stop while the context is suspended', async () => {
    const e = makeEnv({ unlocked: true });
    const down = setupMusic(e.ctx);
    await flush();
    e.audio.context.currentTime = 1;
    e.tickTo(1 + 1 / 60);
    const cb = vi.fn();
    e.services.get('music')!.onBeat(cb);
    e.audio.context.state = 'suspended';
    for (let i = 0; i < 90; i++) e.tickTo(e.audio.context.currentTime + 1 / 60);
    expect(cb).not.toHaveBeenCalled();
    e.audio.context.state = 'running';
    expect(e.services.get('music')!.beat()).not.toBeNull();
    down();
    expect(e.services.get('music')!.beat()).toBeNull();
  });

  it('load inside the vault with audio locked keeps the interior', async () => {
    const e = makeEnv({ withBus: true });
    setupMusic(e.ctx);
    (e.services as unknown as { provide(n: string, v: unknown): void }).provide('interiors', { current: 'chapel-vault' });
    busNode.gain.ramps.length = 0;
    e.events.emit('save.loaded', {} as never);
    expect(busNode.gain.ramps.at(-1)).toBe(0.75);
  });

  it('beat() is null before the mixer plays and while the context is not running, else a BeatInfo', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    expect(e.services.get('music')!.beat()).toBeNull();
    await flush();
    e.unlock();
    e.audio.context.currentTime = 0.05 + 0.652 * 1.5;
    const b = e.services.get('music')!.beat()!;
    expect(b).toMatchObject({ bar: 0, beat: 1 });
    expect(b.nextBeatTime).toBeGreaterThan(e.audio.context.currentTime);
    e.audio.context.state = 'suspended';
    expect(e.services.get('music')!.beat()).toBeNull();
  });

  it('onBeat fires from the fixed tick and unsubscribes; toAudioTime maps a performance time', async () => {
    const e = await start();
    const cb = vi.fn();
    const off = e.services.get('music')!.onBeat(cb);
    for (let i = 0; i < 120; i++) e.tickTo(e.audio.context.currentTime + 1 / 60);
    expect(cb.mock.calls.length).toBeGreaterThan(1);
    off();
    const n = cb.mock.calls.length;
    for (let i = 0; i < 120; i++) e.tickTo(e.audio.context.currentTime + 1 / 60);
    expect(cb.mock.calls.length).toBe(n);
    const t = e.services.get('music')!.toAudioTime(performance.now());
    expect(t).toBeCloseTo(e.audio.context.currentTime, 1);
  });

  it('plays the shrine sting once and a discover phrase, deduped with the waystone event', async () => {
    const e = await start();
    e.events.emit('shrine.rekindled', { shrineId: 'quenchstone' });
    e.events.emit('waystone.rekindled', { waystoneId: 'quenchstone', cause: 'player' });
    const keys = e.audio.play.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(['sfx.shrine.rekindle']);
  });

  it('skips the shrine sting during combat but still queues nothing', async () => {
    const e = await start();
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.tickTo(e.audio.context.currentTime + 0.1);
    e.events.emit('shrine.rekindled', { shrineId: 'q' });
    expect(e.audio.play).not.toHaveBeenCalled();
  });

  it('plays the whistle when the Lucky Whistle is granted, and not for other loot', async () => {
    const e = await start();
    e.events.emit('loot.granted', { sourceId: 'm05', items: [{ itemId: 'barley-cake', count: 5 }] });
    expect(e.audio.play).not.toHaveBeenCalled();
    e.events.emit('loot.granted', { sourceId: 'm05', items: [{ itemId: 'tobbs-lucky-whistle', count: 1 }] });
    expect(e.audio.play).toHaveBeenCalledWith('sfx.whistle');
  });

  it('plays the wardstones.complete chord but leaves strike and miss sounds to thread 7', async () => {
    const e = await start();
    e.events.emit('wardstone.struck', { index: 3, errorMs: 10 });
    e.events.emit('wardstone.missed', { index: 3, reason: 'late' });
    expect(e.audio.play).not.toHaveBeenCalled();
    expect(e.audio.playAt).not.toHaveBeenCalled();
    e.events.emit('wardstones.complete', {});
    expect(e.audio.play).toHaveBeenCalledWith('sfx.wardstones.complete');
  });

  it('plays leap at start and a thump on landing; cancel is silent', async () => {
    const e = await start();
    e.events.emit('player.leap', { phase: 'start', from: { x: 0, y: 0, z: 0 }, to: { x: 5, y: 0, z: 0 } });
    expect(e.audio.playAt.mock.calls.at(-1)![0]).toMatch(/^sfx\.leap#/);
    e.audio.context.currentTime += 0.5;
    e.events.emit('player.leap', { phase: 'land', from: { x: 0, y: 0, z: 0 }, to: { x: 5, y: 0, z: 0 } });
    expect(e.audio.playAt.mock.calls.at(-1)![0]).toMatch(/^sfx\.thump#/);
    const n = e.audio.playAt.mock.calls.length;
    e.events.emit('player.leap', { phase: 'cancel', from: { x: 0, y: 0, z: 0 } });
    e.events.emit('player.leap', { phase: 'land', from: { x: 0, y: 0, z: 0 } }); // no landing point
    expect(e.audio.playAt.mock.calls.length).toBe(n);
  });

  it('one Release pulse sound per pulseId, however many wraiths it frees; spare is silent here', async () => {
    const e = await start();
    const base = { verb: 'release', tier: 'creature', track: 'ashwalkers', creature: 'ash-wraith' } as const;
    e.events.emit('mercy', { ...base, actorId: 'a', pulseId: 'p1' } as never);
    e.audio.context.currentTime += 1;
    e.events.emit('mercy', { ...base, actorId: 'b', pulseId: 'p1' } as never);
    e.audio.context.currentTime += 1;
    e.events.emit('mercy', { ...base, actorId: 'c', pulseId: 'p2' } as never);
    e.events.emit('mercy', { verb: 'spare', tier: 'creature', track: 'halvard', creature: 'footman', actorId: 'd' } as never);
    const keys = e.audio.playAt.mock.calls.map((c) => c[0]);
    expect(keys.filter((k) => k.startsWith('sfx.release.pulse'))).toHaveLength(2);
  });

  it('plays the kneel at the yielding creature; a missing actor is ignored', async () => {
    const e = await start();
    e.events.emit('enemies.yield', { actorId: 'w1', seconds: 6 });
    expect(e.audio.playAt.mock.calls.at(-1)![0]).toMatch(/^sfx\.yield\.kneel#/);
    const n = e.audio.playAt.mock.calls.length;
    e.events.emit('enemies.yield', { actorId: 'ghost', seconds: 6 });
    expect(e.audio.playAt.mock.calls.length).toBe(n);
  });

  it('companion barks: the same line always sounds the same, and bursts are rate limited', async () => {
    const e = await start();
    e.events.emit('companion.banter', { companionId: 'tobb', lineKey: 'a', trigger: 'area' });
    const first = e.audio.playAt.mock.calls.at(-1)![0];
    e.events.emit('companion.banter', { companionId: 'tobb', lineKey: 'b', trigger: 'area' });
    expect(e.audio.playAt.mock.calls.filter((c) => c[0].startsWith('sfx.companion.bark'))).toHaveLength(1);
    e.audio.context.currentTime += 1;
    e.events.emit('companion.banter', { companionId: 'tobb', lineKey: 'a', trigger: 'area' });
    expect(e.audio.playAt.mock.calls.at(-1)![0]).toBe(first);
  });

  it('maps the plant material to its impact sound', async () => {
    const e = await start();
    e.addActor('bloom', 'hostile', [2, 0, 0], { audio: { material: 'plant' } });
    e.events.emit('damage.dealt', { targetId: 'bloom', attackerId: 'player', kind: 'melee', outcome: 'hit', poiseDealt: 5, killed: false, point: { x: 2, y: 0, z: 0 } } as never);
    expect(e.audio.playAt.mock.calls.map((c) => c[0])).toContain('sfx.impact.plant#0');
  });

  it('registers the wardstone, boss and whistle sounds under their bare keys', async () => {
    const e = await start();
    const keys = e.audio.register.mock.calls.map((c) => c[0]);
    for (const k of ['sfx.wardstone.1', 'sfx.wardstone.5', 'sfx.wardstone.miss', 'sfx.prior.gong', 'sfx.prior.teleport', 'sfx.whistle', 'sfx.leap', 'sfx.shrine.rekindle']) {
      expect(keys).toContain(k);
    }
  });

  it('locked audio plays none of the new sounds', async () => {
    const e = makeEnv({ unlocked: false });
    setupMusic(e.ctx);
    e.events.emit('shrine.rekindled', { shrineId: 'q' });
    e.events.emit('wardstones.complete', {});
    e.events.emit('loot.granted', { sourceId: 'm05', items: [{ itemId: 'tobbs-lucky-whistle', count: 1 }] });
    expect(e.audio.play).not.toHaveBeenCalled();
  });

  describe('interiors', () => {
    const busRamps = () => busNode.gain.ramps;
    beforeEach(() => {
      busNode.gain.ramps.length = 0;
      busNode.gain.value = 1;
    });

    it('enter ducks the music bus, exit restores it; enter, enter, exit gives dry', async () => {
      await start({ withBus: true }).then((e) => {
        e.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'd' });
        e.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'd' });
        expect(busRamps()).toEqual([0.75]);
        e.events.emit('interior.exited', { interiorId: 'chapel-vault', doorId: 'd' });
        expect(busRamps()).toEqual([0.75, 1]);
      });
    });

    it('exit while outdoors does nothing', async () => {
      const e = await start({ withBus: true });
      e.events.emit('interior.exited', { interiorId: 'chapel-vault', doorId: 'd' });
      expect(busRamps()).toEqual([]);
    });

    it('save.loaded inside the vault keeps the reverb, whichever order the interiors handler runs in', async () => {
      const e = await start({ withBus: true });
      (e.services as unknown as { provide(n: string, v: unknown): void }).provide('interiors', { current: 'chapel-vault' });
      // our handler first, then 3a re-sends entered
      e.events.emit('save.loaded', {} as never);
      e.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'd' });
      expect(busRamps()).toEqual([0.75]);
    });

    it('save.loaded outdoors (service says null) ends a stale interior; no service means dry', async () => {
      const e = await start({ withBus: true });
      e.events.emit('interior.entered', { interiorId: 'underways', doorId: 'd' });
      e.events.emit('save.loaded', {} as never);
      expect(busRamps().at(-1)).toBe(1);
    });

    it('without Web Audio nodes the interior events are harmless', async () => {
      const e = await start();
      expect(() => {
        e.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'd' });
        e.events.emit('interior.exited', { interiorId: 'chapel-vault', doorId: 'd' });
      }).not.toThrow();
    });

    it('region.entered does not change the interior', async () => {
      const e = await start({ withBus: true });
      e.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'd' });
      e.events.emit('region.entered', { regionId: 'brightwater', previous: null });
      expect(busRamps()).toEqual([0.75]);
    });
  });
});
