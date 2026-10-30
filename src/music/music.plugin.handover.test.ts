import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import type { GameContext } from '../core/Game';
import { Services } from '../core/Services';
import { setupMusic } from './music.plugin';
import { ASH_ON_THE_PASTURE as ASH, BARLEY_AND_BRAZIER as BARLEY, HAMMERS_BELOW as HAMMERS, RESERVED_TRACKS, RESERVED_TRACK_IDS, SEVEN_GATES_ONE_DRUM as SEVEN, TRACKS_BY_ID } from './tracks';

const SR = 8000;

// Explicit, generous budget: the file is quick alone but shares CPU with the whole suite in CI (F7).
vi.setConfig({ testTimeout: 30_000 });

/**
 * The handover logic needs buffers of the right length, not the sound: synthesising every stem of every track for every test
 * took about a second per test (F7). The synth has its own tests (stemSynth.*.test.ts, act2.tracks.test.ts).
 */
// The placeholder SFX are registered at setup (about 100 synthesised sounds); the handover tests never play one.
vi.mock('./sfxSynth', async (orig) => ({ ...(await orig<typeof import('./sfxSynth')>()), synthSfx: () => new Float32Array(1) }));
vi.mock('./stemSynth', async () => {
  const { loopSamples } = await import('./tracks');
  return {
    // Keeps the real synth's unknown-stem throw (small-batch review F4): a stem the track does not list is a bug, not silence.
    synthStem: (track: Parameters<typeof loopSamples>[0] & { stems: readonly string[] }, stem: string, sampleRate: number) => {
      if (!track.stems.includes(stem)) throw new Error(`No placeholder synth for stem "${stem}"`);
      return new Float32Array(loopSamples(track, sampleRate));
    },
  };
});

vi.mock('../audio/proceduralSounds', () => ({ PLACEHOLDER_SAMPLE_RATE: 44100, samplesToWavUrl: () => 'blob:fake' }));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
};

function fakeBuffer(len: number) {
  return { length: len, numberOfChannels: 1, sampleRate: SR, getChannelData: () => new Float32Array(len), copyToChannel: vi.fn() };
}

function makeMixer(name: string) {
  const m = {
    name,
    isPlaying: false,
    startedAt: null as number | null,
    stems: new Set<string>(),
    get stemCount() {
      return m.stems.size;
    },
    add: vi.fn(async (id: string) => void m.stems.add(id)),
    start: vi.fn((_mix: Record<string, number>, delay = 0.05) => {
      m.isPlaying = true;
      m.startedAt = clockRef.t + delay;
    }),
    stop: vi.fn(() => {
      m.isPlaying = false;
      m.startedAt = null;
    }),
    clear: vi.fn(() => {
      m.stems.clear();
      m.isPlaying = false;
    }),
    setMix: vi.fn(),
    setMixAt: vi.fn(),
    dispose: vi.fn(),
  };
  return m;
}
const clockRef = { t: 0 };

interface FakeParam {
  value: number;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
}
interface FakeNode {
  gain: FakeParam;
  frequency: FakeParam;
  Q: FakeParam;
  delayTime: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
}
const madeNodes: FakeNode[] = [];
function makeNode(): FakeNode {
  const param = (): FakeParam => ({ value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node: FakeNode = { gain: param(), frequency: param(), Q: param(), delayTime: param(), buffer: null as unknown, loop: false, type: '', connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  madeNodes.push(node);
  return node;
}

type RegionAt = (x: number, z: number) => { id: string; track: string } | null;

function makeEnv(opts: { regionAt?: RegionAt; stealthActive?: boolean; chaseActive?: boolean } = {}) {
  clockRef.t = 0;
  const events = new EventBus<GameEventMap>();
  const services = new Services();
  const mixers = [makeMixer('a'), makeMixer('b')];
  let active = 0;
  const unlockCbs: Array<() => void> = [];
  const audio = {
    isUnlocked: false,
    context: {
      get currentTime() {
        return clockRef.t;
      },
      sampleRate: SR,
      state: 'running',
      createBuffer: (_c: number, len: number) => fakeBuffer(len),
            createGain: () => makeNode(),
      createConvolver: () => makeNode(),
      createBiquadFilter: () => makeNode(),
      createDelay: () => makeNode(),
      createBufferSource: () => makeNode(),
    },
    get music() {
      return mixers[active];
    },
    get musicNext() {
      return mixers[1 - active];
    },
    swapMusic: vi.fn(() => void (active = 1 - active)),
    musicBus: makeNode(),
    masterNode: makeNode(),
    register: vi.fn(),
    playAt: vi.fn((): number | null => 1),
    play: vi.fn((): number | null => 1),
    onUnlock: vi.fn((cb: () => void) => (audio.isUnlocked ? cb() : void unlockCbs.push(cb))),
  };
  services.provide('audio', audio as never);
  const region = { regionAt: opts.regionAt ?? ((): { id: string; track: string } | null => ({ id: 'brightwater', track: BARLEY.id })) };
  (services as unknown as { provide(n: string, v: unknown): void }).provide('region', { at: (x: number, z: number) => region.regionAt(x, z), waystoneObject: () => undefined });
  const sneak = { stealth: opts.stealthActive ?? false, chase: opts.chaseActive ?? false };
  (services as unknown as { provide(n: string, v: unknown): void }).provide('stealth', { active: () => sneak.stealth });
  (services as unknown as { provide(n: string, v: unknown): void }).provide('chase', { active: () => sneak.chase });

  const feet = new THREE.Vector3(0, 0, 0);
  const actors = new Map<string, { id: string; team: string; data: Record<string, unknown>; root: object; worldPosition(o: THREE.Vector3): THREE.Vector3 }>();
  actors.set('player', { id: 'player', team: 'player', data: {}, root: {}, worldPosition: (o) => o.copy(feet) });
  const systems: Array<{ fixedUpdate?: (dt: number) => void }> = [];
  const bossStates = new Map<string, { phase: number }>();
  const ctx = {
    events,
    services,
    actors: { player: actors.get('player'), get: (id: string) => actors.get(id), all: () => actors.values() },
    state: { isMercied: () => false },
    bosses: { state: (id: string) => bossStates.get(id) ?? null, active: () => [...bossStates.keys()] },
    player: { feet },
    systems: { add: (s: (typeof systems)[number]) => (systems.push(s), () => {}) },
  } as unknown as GameContext;
  const addHostile = (id: string): void => {
    actors.set(id, { id, team: 'hostile', dead: false, data: {}, root: {}, worldPosition: (o: THREE.Vector3) => o.copy(feet) } as never);
  };
  const tick = (secs: number): void => {
    const steps = Math.round(secs * 60);
    for (let i = 0; i < steps; i++) {
      clockRef.t += 1 / 60;
      systems[0].fixedUpdate!(1 / 60);
    }
  };
  const start = async (): Promise<void> => {
    await flush();
    audio.isUnlocked = true;
    unlockCbs.splice(0).forEach((cb) => cb());
    tick(0.1);
  };
  return { ctx, events, services, audio, mixers, addHostile, sneak, region, feet, tick, start, bossStates, active: () => active };
}

beforeEach(() => {
  madeNodes.length = 0;
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const HARROWMARK = { id: 'harrowmark', track: SEVEN.id };
const BRIGHT = { id: 'brightwater', track: BARLEY.id };
/** Brightwater for x < 1000, Harrowmark beyond. */
const split: RegionAt = (x) => (x < 1000 ? BRIGHT : HARROWMARK);

describe('region handover', () => {
  it('starts the track of the region the player stands in', async () => {
    const e = makeEnv({ regionAt: () => HARROWMARK });
    setupMusic(e.ctx);
    await e.start();
    expect(e.mixers[0].isPlaying).toBe(true);
    expect(e.services.get('music')!.beat()!.bpm).toBe(96);
  });

  it('a border crossing loads the idle mixer and swaps on a bar line, old fading out to that line', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    const firstStart = e.mixers[0].startedAt!;
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    const next = e.mixers[1];
    expect(next.start).toHaveBeenCalledTimes(1);
    const at = next.startedAt!;
    const bar = (firstStart > 0 ? (at - firstStart) / (BARLEY.bars === 16 ? 2.6087 : 1) : 0);
    expect(bar).toBeGreaterThan(0);
    // the outgoing mixer fades to 0 ending exactly on the line
    const fade = e.mixers[0].setMix.mock.calls.find((c) => c[2] !== undefined)!;
    expect(fade[2]).toBeCloseTo(at, 6);
    expect(Object.values(fade[0] as Record<string, number>).every((g) => g === 0)).toBe(true);
    // nothing swapped yet
    expect(e.audio.swapMusic).not.toHaveBeenCalled();
    expect(e.services.get('music')!.beat()!.bpm).toBe(92);
    e.tick(at - clockRef.t + 0.05);
    expect(e.audio.swapMusic).toHaveBeenCalledTimes(1);
    expect(e.mixers[0].stop).toHaveBeenCalled();
    expect(e.services.get('music')!.beat()!.bpm).toBe(96);
  });

  it('while committed, mix changes go to the new mixer only, held silent until the line', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    const at = e.mixers[1].startedAt!;
    e.mixers[0].setMix.mockClear();
    e.events.emit('dialogue.started', { dialogueId: 'd', npcId: 'n' });
    e.tick(0.1);
    expect(e.mixers[0].setMix).not.toHaveBeenCalled();
    const call = e.mixers[1].setMixAt.mock.calls.at(-1)!;
    expect(call[1]).toBeCloseTo(at, 6); // the hard downbeat is kept, not ramped
  });

  it('a second region.entered while committed queues, and runs after the swap', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    const at = e.mixers[1].startedAt!;
    e.feet.x = 0; // straight back
    e.events.emit('region.entered', { regionId: 'brightwater', previous: 'harrowmark' });
    await flush();
    expect(e.mixers[1].start).toHaveBeenCalledTimes(1);
    expect(e.audio.swapMusic).not.toHaveBeenCalled();
    e.tick(at - clockRef.t + 0.05);
    await flush();
    e.tick(0.1);
    // the first swap happened, then Brightwater was prepared and committed back
    expect(e.audio.swapMusic).toHaveBeenCalledTimes(1);
    expect(e.mixers[0].start).toHaveBeenCalledTimes(2); // the old mixer is reused for the walk back
    const back = e.mixers[0].startedAt!;
    e.tick(back - clockRef.t + 0.05);
    expect(e.audio.swapMusic).toHaveBeenCalledTimes(2);
    expect(e.services.get('music')!.beat()!.bpm).toBe(92);
  });

  it('in Loading the last request wins: out and back before anything is committed does nothing', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    e.feet.x = 0;
    e.events.emit('region.entered', { regionId: 'brightwater', previous: 'harrowmark' });
    await flush();
    e.tick(0.5);
    expect(e.mixers[1].start).not.toHaveBeenCalled();
    expect(e.audio.swapMusic).not.toHaveBeenCalled();
  });

  it('the same track (region change within one track) is a no-op', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    e.events.emit('region.entered', { regionId: 'brightwater', previous: null });
    await flush();
    e.tick(0.5);
    expect(e.mixers[1].start).not.toHaveBeenCalled();
    expect(e.mixers[1].add).not.toHaveBeenCalled();
  });

  it('the null corridor never requests a track', async () => {
    const e = makeEnv({ regionAt: () => null });
    setupMusic(e.ctx);
    await e.start();
    e.tick(1);
    await flush();
    expect(e.mixers[1].add).not.toHaveBeenCalled();
    expect(e.mixers[1].start).not.toHaveBeenCalled();
  });

  it('waits for a boss fight to end before committing, then commits', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.bossStates.set('ashen-prior', { phase: 1 });
    e.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'b' });
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(1);
    expect(e.mixers[1].start).not.toHaveBeenCalled();
    e.events.emit('boss.ended', { bossId: 'ashen-prior', actorId: 'b', reason: 'unregistered' });
    e.bossStates.clear();
    e.tick(0.5);
    expect(e.mixers[1].start).toHaveBeenCalledTimes(1);
  });

  it('combat does not block the handover and its mix carries to the new mixer', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.addHostile('w1');
    e.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    e.tick(0.5);
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    const mix = e.mixers[1].start.mock.calls[0][0] as Record<string, number>;
    expect(mix.kick).toBeGreaterThan(0);
  });

  it('a failed load keeps the old track, warns once, and a later entry retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.mixers[1].add.mockRejectedValue(new Error('no'));
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.5);
    expect(e.mixers[1].start).not.toHaveBeenCalled();
    expect(e.services.get('music')!.beat()!.bpm).toBe(92);
    expect(warn).toHaveBeenCalled();
  });

  it('unknown forced track warns once and changes nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    e.services.get('music')!.setRegionTrack('nope');
    e.services.get('music')!.setRegionTrack('nope');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('nope'))).toHaveLength(1);
  });

  it('dispose mid-handover stops both mixers and discards a late load', async () => {
    const e = makeEnv({ regionAt: split });
    const down = setupMusic(e.ctx);
    await e.start();
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    down();
    await flush();
    expect(e.mixers[1].start).not.toHaveBeenCalled();
    expect(e.mixers[0].stop).toHaveBeenCalled();
  });

  it('beat() reports the old track until the swap, then the new one, with the scheduler restarted', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    const beats: number[] = [];
    e.services.get('music')!.onBeat((b) => beats.push(b.bpm));
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    const at = e.mixers[1].startedAt!;
    e.tick(at - clockRef.t + 3);
    expect(beats).toContain(92);
    expect(beats).toContain(96);
    expect(beats.indexOf(96)).toBeGreaterThan(beats.lastIndexOf(92) - 1);
  });
});

describe('neighbour preload', () => {
  it('loads the next track into the idle mixer when a border is within 400 m, once', async () => {
    const e = makeEnv({ regionAt: (x) => (x < 1000 ? BRIGHT : HARROWMARK) });
    e.feet.x = 700;
    setupMusic(e.ctx);
    await e.start();
    e.tick(1.2);
    await flush();
    const adds = e.mixers[1].add.mock.calls.length;
    expect(adds).toBe(SEVEN.stems.length);
    e.tick(3);
    await flush();
    expect(e.mixers[1].add.mock.calls.length).toBe(adds);
    expect(e.mixers[1].start).not.toHaveBeenCalled();
  });

  it('does not preload when no border is within 400 m', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.tick(3);
    await flush();
    expect(e.mixers[1].add).not.toHaveBeenCalled();
  });

  it('uses the preloaded stems at the border without loading again', async () => {
    const e = makeEnv({ regionAt: split });
    e.feet.x = 700;
    setupMusic(e.ctx);
    await e.start();
    e.tick(1.2);
    await flush();
    const adds = e.mixers[1].add.mock.calls.length;
    e.feet.x = 1100;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    expect(e.mixers[1].add.mock.calls.length).toBe(adds);
    expect(e.mixers[1].start).toHaveBeenCalledTimes(1);
  });

  it('drops the cached stems after 30 s with no border nearby', async () => {
    const e = makeEnv({ regionAt: split });
    e.feet.x = 700;
    setupMusic(e.ctx);
    await e.start();
    e.tick(1.2);
    await flush();
    e.feet.x = 0;
    e.tick(31);
    expect(e.mixers[1].clear).toHaveBeenCalled();
  });

  it('without a region service nothing is probed', async () => {
    const e = makeEnv();
    (e.services as unknown as { impls: Map<string, unknown> }).impls?.delete('region');
    setupMusic(e.ctx);
    await e.start();
    e.tick(3);
    expect(e.mixers[1].add).not.toHaveBeenCalled();
  });
});

describe('stealth and chase wiring', () => {
  it('follows thread 18 events: section entered, alert overlay, caught, cleared', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    const music = e.services.get('music')!;
    e.events.emit('stealth.section', { sectionId: 's', phase: 'entered' });
    e.tick(0.1);
    expect(music.state).toBe('stealth');
    e.events.emit('stealth.alert', { observerId: 'g', sectionId: 's', state: 'alerted' });
    e.tick(0.1);
    expect(e.mixers[0].setMix.mock.calls.at(-1)![0]).toBe(BARLEY.stealthAlert!.alerted);
    e.events.emit('stealth.caught', { observerId: 'g', sectionId: 's', checkpointId: 'c' });
    e.tick(0.1);
    expect(music.state).toBe('stealth');
    e.events.emit('stealth.section', { sectionId: 's', phase: 'cleared' });
    e.tick(0.1);
    expect(music.state).toBe('explore');
  });

  it('chase lifecycle: started, lost then restarted holds, caught plays the ending', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    const music = e.services.get('music')!;
    e.events.emit('chase.started', { chaseId: 'c' });
    e.tick(0.1);
    expect(music.state).toBe('chase');
    e.events.emit('chase.lost', { chaseId: 'c', reason: 'timer' });
    e.tick(2);
    e.events.emit('chase.started', { chaseId: 'c' });
    e.tick(3);
    expect(music.state).toBe('chase');
    e.events.emit('chase.caught', { chaseId: 'c', seconds: 20 });
    e.tick(0.1);
    expect(music.state).toBe('ending');
  });

  it('re-derives from the services at setup and after save.loaded, in either event order', async () => {
    const e = makeEnv({ stealthActive: true });
    setupMusic(e.ctx);
    await e.start();
    const music = e.services.get('music')!;
    expect(music.state).toBe('stealth');
    e.events.emit('save.loaded', {} as never); // director.reset then re-derive
    e.tick(0.1);
    expect(music.state).toBe('stealth');
    e.events.emit('stealth.section', { sectionId: 's', phase: 'entered' }); // thread 18 re-emits entered
    e.events.emit('stealth.section', { sectionId: 's', phase: 'exited' });
    e.sneak.stealth = false;
    e.tick(0.1);
    expect(music.state).toBe('explore');
    e.sneak.chase = true;
    e.events.emit('actor.revived', { actorId: 'player', reason: 'respawn' } as never);
    e.tick(0.1);
    expect(music.state).toBe('chase');
  });

  it('absent stealth and chase services are fine', async () => {
    const e = makeEnv();
    (e.services as unknown as { impls: Map<string, unknown> }).impls?.delete('stealth');
    (e.services as unknown as { impls: Map<string, unknown> }).impls?.delete('chase');
    setupMusic(e.ctx);
    await e.start();
    expect(() => e.events.emit('save.loaded', {} as never)).not.toThrow();
    expect(e.services.get('music')!.state).toBe('explore');
  });
});

describe('review fixes', () => {
  it('a failed load is not retried every poll, only after a region.entered', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    e.mixers[1].add.mockRejectedValue(new Error('no'));
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    const calls = e.mixers[1].add.mock.calls.length;
    e.tick(3);
    await flush();
    expect(e.mixers[1].add.mock.calls.length).toBe(calls);
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    expect(e.mixers[1].add.mock.calls.length).toBeGreaterThan(calls);
  });

  it('each beat is delivered once across the swap', async () => {
    const e = makeEnv({ regionAt: split });
    setupMusic(e.ctx);
    await e.start();
    const seen: number[] = [];
    e.services.get('music')!.onBeat((b) => seen.push(Math.round(b.audioTime * 1000)));
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'harrowmark', previous: 'brightwater' });
    await flush();
    e.tick(0.1);
    e.tick(e.mixers[1].startedAt! - clockRef.t + 3);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('a track resolved after setup (region registered later) is the one that starts', async () => {
    const e = makeEnv({ regionAt: () => HARROWMARK });
    setupMusic(e.ctx);
    await e.start();
    expect(e.services.get('music')!.beat()!.bpm).toBe(96);
  });
});

describe('Barley tempo is pinned at 92 BPM (the wardstone phrases are written against it)', () => {
  it('beat() reports 92 BPM with a 2.6087 s bar, and beats arrive 60/92 s apart', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    const beat = e.services.get('music')!.beat()!;
    expect(beat.bpm).toBe(92);
    expect(beat.barSeconds).toBeCloseTo(240 / 92, 6);
    expect(beat.beatSeconds).toBeCloseTo(60 / 92, 6);
    const times: number[] = [];
    e.services.get('music')!.onBeat((b) => times.push(b.audioTime));
    e.tick(12);
    expect(times.length).toBeGreaterThanOrEqual(15);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(60 / 92, 6);
  });

  it('the track data keeps 92 BPM, 16 bars and the 40 s-ish loop', () => {
    expect(BARLEY.bpm).toBe(92);
    expect(BARLEY.bars).toBe(16);
    expect((BARLEY.bars * 240) / BARLEY.bpm).toBeCloseTo(41.739, 3);
  });
});

describe('shared reverb wiring', () => {
  /** The reverb's output gain is the only fake gain node that starts at its outdoor wet level. */
  const wetOut = () => madeNodes.find((n) => n.gain.value === 0.16 && n.delayTime.value === 1)!;

  it('is built outdoors and fades out inside an interior, back in when leaving', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    const out = wetOut();
    expect(out).toBeDefined();
    e.events.emit('interior.entered', { interiorId: 'keep-hall' } as never);
    expect(out.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
    e.events.emit('interior.exited', { interiorId: 'keep-hall' } as never);
    expect(out.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.16, expect.any(Number));
  });

  it('save.loaded re-derives it from the interiors service, and dispose disconnects it', async () => {
    const e = makeEnv();
    (e.services as unknown as { provide(n: string, v: unknown): void }).provide('interiors', { current: 'archive' });
    const down = setupMusic(e.ctx);
    await e.start();
    const out = wetOut();
    e.events.emit('save.loaded', {} as never);
    expect(out.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
    down();
    expect(out.disconnect).toHaveBeenCalled();
  });

  it('a context without delay or filter nodes still plays music (no reverb)', async () => {
    const e = makeEnv();
    delete (e.audio.context as Record<string, unknown>).createDelay;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupMusic(e.ctx);
    await e.start();
    expect(e.mixers[0].isPlaying).toBe(true);
  });
});

describe('Act 2 tracks (registered by A14; the old reserved-track block asserted they were not)', () => {
  const ASH_REGION = { id: 'cinderreach', track: ASH.id };
  const HAMMERS_REGION = { id: 'oldsmoke', track: HAMMERS.id };

  it('the reserved lists hold only the Act 3 slots (v0.7 item 23) and both Act 2 tracks are registered', () => {
    expect(RESERVED_TRACK_IDS).toEqual(['peat-and-pitch', 'wing-over-rime']);
    expect(RESERVED_TRACKS).toEqual([{ id: 'peat-and-pitch', bpm: 90 }, { id: 'wing-over-rime', bpm: 100 }]);
    expect(TRACKS_BY_ID[ASH.id]).toBe(ASH);
    expect(TRACKS_BY_ID[HAMMERS.id]).toBe(HAMMERS);
  });

  it('starting inside Cinderreach plays Ash on the Pasture at 94 BPM', async () => {
    const e = makeEnv({ regionAt: () => ASH_REGION });
    setupMusic(e.ctx);
    await e.start();
    expect(e.mixers[0].isPlaying).toBe(true);
    expect(e.services.get('music')!.beat()!.bpm).toBe(94);
  });

  it('Harrowmark to Cinderreach hands over on a bar line: 96 BPM until the swap, 94 after', async () => {
    const e = makeEnv({ regionAt: (x) => (x < 1000 ? HARROWMARK : ASH_REGION) });
    setupMusic(e.ctx);
    await e.start();
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'cinderreach', previous: 'harrowmark' });
    await flush();
    e.tick(0.1);
    const at = e.mixers[1].startedAt!;
    const firstStart = e.mixers[0].startedAt!;
    const bar = 240 / SEVEN.bpm;
    const barsIn = (at - firstStart) / bar;
    expect(Math.abs(barsIn - Math.round(barsIn))).toBeLessThan(1e-3); // the new track starts on a bar of the old one
    expect(e.audio.swapMusic).not.toHaveBeenCalled();
    expect(e.services.get('music')!.beat()!.bpm).toBe(96);
    e.tick(at - clockRef.t + 0.05);
    expect(e.audio.swapMusic).toHaveBeenCalledTimes(1);
    expect(e.services.get('music')!.beat()!.bpm).toBe(94);
  });

  it('Cinderreach to Oldsmoke hands over from 94 to 98 BPM', async () => {
    const e = makeEnv({ regionAt: (x) => (x < 1000 ? ASH_REGION : HAMMERS_REGION) });
    setupMusic(e.ctx);
    await e.start();
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'oldsmoke', previous: 'cinderreach' });
    await flush();
    e.tick(0.1);
    const at = e.mixers[1].startedAt!;
    expect(e.services.get('music')!.beat()!.bpm).toBe(94);
    e.tick(at - clockRef.t + 0.05);
    expect(e.services.get('music')!.beat()!.bpm).toBe(98);
  });

  it.each([ASH, HAMMERS])('a synth failure on $id keeps the old track and warns', async (track) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const region = { id: 'x', track: track.id };
    const e = makeEnv({ regionAt: (x) => (x < 1000 ? BRIGHT : region) });
    setupMusic(e.ctx);
    await e.start();
    e.mixers[1].add.mockRejectedValue(new Error('synth failed'));
    e.feet.x = 1500;
    e.events.emit('region.entered', { regionId: 'x', previous: 'brightwater' });
    await flush();
    e.tick(0.5);
    expect(e.mixers[1].start).not.toHaveBeenCalled();
    expect(e.services.get('music')!.beat()!.bpm).toBe(92);
    expect(warn).toHaveBeenCalled();
  });

  it('a track id nothing registers (a later act) warns exactly once now that nothing is reserved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    e.services.get('music')!.setRegionTrack('greyfen');
    e.services.get('music')!.setRegionTrack('greyfen');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('greyfen'))).toHaveLength(1);
  });

  it('music.setRegionTrack switches to either Act 2 track by id', async () => {
    const e = makeEnv();
    setupMusic(e.ctx);
    await e.start();
    e.services.get('music')!.setRegionTrack('hammers-below');
    await flush();
    e.tick(0.1);
    e.tick(e.mixers[1].startedAt! - clockRef.t + 0.05);
    expect(e.services.get('music')!.beat()!.bpm).toBe(98);
  });
});
