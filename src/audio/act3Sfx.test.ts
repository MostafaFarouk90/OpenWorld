import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Brain, type BrainHooks, type Senses } from '../enemies/ai/Brain';
import { FEN_LEECH } from '../enemies/fen/leech/def';
import type { AiState, EnemyDef, MoveDef } from '../enemies/types';
import { YSMERYTH_TRIAL_ID } from '../music/act3Tracks';
import { ACT3_LOOP_KEYS, ACT3_SFX_KEYS, ACT3_SFX_VOLUME, act3SfxSamples, type Act3SfxKey } from './act3Sfx';
import plugin, { TRIAL_RELEASE_MS } from './act3Sfx.plugin';
import { ensureAct3Sfx } from './act3SfxEnsure';
import { SR } from './sfxKit';

type Handler = (payload: never) => void;

/** A fake plugin context: an event bus, a recording audio service, and the lookups the plugin reads. */
function fakeCtx(opts: { audio?: boolean; music?: boolean } = { audio: true, music: true }) {
  const handlers = new Map<string, Handler[]>();
  const registered: Array<{ key: string; def: { volume?: number; loop?: boolean } }> = [];
  const played: string[] = [];
  const playedAt: Array<{ key: string; at: { x: number; y: number; z: number } }> = [];
  const attached: Array<{ id: number; key: string; object: unknown }> = [];
  const detached: number[] = [];
  const boss: Array<[boolean, string | undefined]> = [];
  const playerRoot = { name: 'player-root' };
  const scene = { getObjectByName: (n: string) => (n === 'ysmeryth' ? null : n === 'hathren-mesh' ? { name: n } : undefined) };
  let nextId = 1;
  const audio = {
    register: (key: string, def: { volume?: number; loop?: boolean }) => void registered.push({ key, def }),
    play: (key: string) => (played.push(key), 1),
    playAt: (key: string, at: { x: number; y: number; z: number }) => (playedAt.push({ key, at: { x: at.x, y: at.y, z: at.z } }), 1),
    attach: (key: string, object: unknown) => (attached.push({ id: nextId, key, object }), nextId++),
    detach: (id: number) => void detached.push(id),
  };
  const water = { state: 'dry' as 'dry' | 'wading' | 'diving' };
  const music = { setBoss: (on: boolean, id?: string) => void boss.push([on, id]) };
  const systems: Array<{ id: string; fixedUpdate?: (dt: number) => void }> = [];
  const feet = { x: 0, y: 0, z: 0 };
  const trials = { running: null as string | null, state: () => (trials.running ? { id: trials.running } : null) };
  const ctx = {
    services: {
      get: (name: string) => (name === 'audio' ? (opts.audio ? audio : undefined) : name === 'water' ? water : name === 'music' ? (opts.music ? music : undefined) : name === 'trials' ? trials : undefined),
    },
    actors: {
      player: { id: 'player' },
      get: (id: string) =>
        id === 'ogre#1'
          ? { kind: 'crag-ogre', root: {}, worldPosition: (v: { set: (x: number, y: number, z: number) => void }) => (v.set(1, 2, 3), v) }
          : id === 'hawk#1'
            ? { kind: 'rime-hawk', root: null, worldPosition: (v: unknown) => v }
            : id === 'skarl-drake'
              ? { kind: 'ember-wyrm', root: { name: 'drake-root' }, worldPosition: (v: unknown) => v }
              : undefined,
    },
    scene,
    player: { actor: { root: playerRoot }, feet },
    systems: { add: (s: { id: string; fixedUpdate?: (dt: number) => void }) => (systems.push(s), () => void systems.splice(systems.indexOf(s), 1)) },
    events: {
      on: (type: string, h: Handler) => {
        handlers.set(type, [...(handlers.get(type) ?? []), h]);
        return () => handlers.set(type, (handlers.get(type) ?? []).filter((x) => x !== h));
      },
    },
  };
  const emit = (type: string, payload: object) => (handlers.get(type) ?? []).forEach((h) => h(payload as never));
  const tick = (dt: number) => systems.forEach((s) => s.fixedUpdate?.(dt));
  return { ctx, audio, trials, emit, tick, registered, played, playedAt, attached, detached, boss, water, feet, playerRoot, systems };
}

const setup = (c: ReturnType<typeof fakeCtx>) => (plugin.setup as (ctx: unknown) => void)(c.ctx);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
});
afterEach(() => {
  plugin.dispose?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const T = 30_000;

describe('act3 sfx samples', () => {
  it('has the planned keys, none twice, with the Hathren spelling and every loop among them', () => {
    expect(ACT3_SFX_KEYS).toHaveLength(37);
    expect(new Set(ACT3_SFX_KEYS).size).toBe(ACT3_SFX_KEYS.length);
    for (const k of ['sfx.wyrm.hathren.splash', 'sfx.wyrm.hathren.song', 'sfx.drake.chain', 'sfx.drake.freed', 'sfx.ysmeryth.call']) expect(ACT3_SFX_KEYS).toContain(k);
    for (const k of ACT3_LOOP_KEYS) expect(ACT3_SFX_KEYS).toContain(k);
    expect([...ACT3_LOOP_KEYS].sort()).toEqual(['sfx.dragon.wingbeat', 'sfx.ferry.pole', 'sfx.glide.wind']);
  });

  it.each(ACT3_SFX_KEYS)('%s is a finite, audible, deterministic, mono render within the peak', (key) => {
    expect(ACT3_SFX_VOLUME[key]).toBeGreaterThan(0);
    expect(ACT3_SFX_VOLUME[key]).toBeLessThanOrEqual(1);
    const a = act3SfxSamples(key);
    expect(a.length).toBeGreaterThan(0.2 * SR);
    let peak = 0;
    let sq = 0;
    let finite = true;
    for (const v of a) {
      if (!Number.isFinite(v)) finite = false;
      peak = Math.max(peak, Math.abs(v));
      sq += v * v;
    }
    expect(finite).toBe(true);
    expect(peak, 'audible').toBeGreaterThan(0.1);
    expect(peak, 'peak').toBeLessThanOrEqual(1);
    expect(Math.sqrt(sq / a.length), 'rms').toBeGreaterThan(0.005);
    const b = act3SfxSamples(key);
    expect(a.every((v, i) => v === b[i])).toBe(true);
  });

  it('the loops repeat without a seam: the wrap step is within the loop\'s own 99.9th percentile step, and RMS either side agrees within 3 dB', () => {
    for (const key of ACT3_LOOP_KEYS) {
      const a = act3SfxSamples(key);
      const steps: number[] = [];
      for (let i = 1; i < a.length; i++) steps.push(Math.abs(a[i] - a[i - 1]));
      steps.sort((x, y) => x - y);
      const p999 = steps[Math.floor(steps.length * 0.999)];
      expect(Math.abs(a[0] - a[a.length - 1]), key).toBeLessThanOrEqual(p999);
      const win = Math.round(2 * SR); // a whole pole-stroke period (the slowest pulse), so a phase difference is not read as a level jump
      const rms = (from: number) => {
        let sq = 0;
        for (let i = from; i < from + win; i++) sq += a[i] * a[i];
        return Math.sqrt(sq / win);
      };
      const db = 20 * Math.log10(rms(a.length - win) / rms(0));
      expect(Math.abs(db), `${key} rms either side of the join`).toBeLessThanOrEqual(3);
      // and it is a real loop length, not a one-shot
      expect(a.length / SR, key).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the sounds distinct and shapes them for the job', () => {
    const len = (k: Act3SfxKey) => act3SfxSamples(k).length;
    expect(len('sfx.shambler.collapse')).toBeGreaterThan(len('sfx.shambler.smash'));
    expect(len('sfx.wyrm.hathren.song')).toBeGreaterThan(len('sfx.wyrm.hathren.splash'));
    expect(len('sfx.water.wade')).toBeLessThan(len('sfx.water.enter'));
    const heads = ACT3_SFX_KEYS.map((k) => Array.from(act3SfxSamples(k).slice(1000, 1200)).join(','));
    expect(new Set(heads).size).toBe(ACT3_SFX_KEYS.length);
  });
});

describe('act3 sfx plugin: rendering', () => {
  it('renders lazily and registers every key once with its volume, loops with loop: true', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    expect(c.registered).toEqual([]);
    vi.advanceTimersToNextTimer();
    expect(c.registered).toHaveLength(1);
    vi.runAllTimers();
    expect(c.registered.map((r) => r.key).sort()).toEqual([...ACT3_SFX_KEYS].sort());
    for (const r of c.registered) {
      expect(r.def.volume).toBe(ACT3_SFX_VOLUME[r.key as Act3SfxKey]);
      expect(r.def.loop, r.key).toBe((ACT3_LOOP_KEYS as readonly string[]).includes(r.key));
    }
  });

  it('renders a key at once when it is about to be played, and ensureAct3Sfx does the same for direct callers', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.emit('telegraph', { actorId: 'ogre#1', moveId: 'ogre.slam' });
    expect(c.registered.map((r) => r.key)).toEqual(['sfx.ogre.slam']);
    ensureAct3Sfx('sfx.ysmeryth.roar');
    ensureAct3Sfx('sfx.ysmeryth.roar');
    ensureAct3Sfx('not.a.key');
    expect(c.registered.map((r) => r.key)).toEqual(['sfx.ogre.slam', 'sfx.ysmeryth.roar']);
    plugin.dispose?.();
    ensureAct3Sfx('sfx.drake.chain');
    expect(c.registered).toHaveLength(2);
  });

  it('stops rendering on dispose, and registers nothing without an audio service', { timeout: T }, () => {
    const a = fakeCtx();
    setup(a);
    plugin.dispose?.();
    vi.runAllTimers();
    expect(a.registered).toEqual([]);
    const b = fakeCtx({ audio: false, music: true });
    expect(() => setup(b)).not.toThrow();
    vi.runAllTimers();
    expect(b.registered).toEqual([]);
  });
});

describe('act3 sfx plugin: events', () => {
  it('plays enemy telegraphs and deaths at the actor', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.emit('telegraph', { actorId: 'ogre#1', moveId: 'ogre.throw' });
    c.emit('telegraph', { actorId: 'hawk#1', moveId: 'hawk.stoop' });
    c.emit('actor.died', { actorId: 'ogre#1', kind: 'crag-ogre' });
    c.emit('actor.died', { actorId: 'x', kind: 'wraith' });
    c.emit('telegraph', { actorId: 'ogre#1', moveId: 'wraith.claw' });
    expect(c.playedAt.map((p) => p.key)).toEqual(['sfx.ogre.throw', 'sfx.ogre.roar']);
    expect(c.played).toEqual(['sfx.hawk.shriek']);
  });

  it('routes water, dive, breath, glide, ferry, Hathren, flight and drake events', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.emit('water.entered', { kind: 'wade', volumeId: 'v' });
    c.emit('water.left', { kind: 'wade', volumeId: 'v' });
    c.emit('dive.started', { volumeId: 'v' });
    c.emit('breath.changed', { value: 4.5 });
    c.emit('breath.changed', { value: 4.2 });
    c.emit('dive.surfaced', { volumeId: 'v', pocketId: null });
    c.emit('glide.started', { ledgeId: 'l' });
    c.emit('glide.landed', { at: { x: 0, y: 0, z: 0 } });
    c.emit('glide.ended', { reason: 'landed' });
    c.emit('ferry.boarded', { routeId: 'r', from: 'a', to: 'b' });
    c.emit('ferry.arrived', { routeId: 'r', stop: 'b', skipped: false });
    c.emit('wyrm.hathren', { beat: 'quiet' });
    c.emit('wyrm.drake.chainStruck', { actorId: 'skarl-drake', by: null });
    c.emit('wyrm.drake.freed', { actorId: 'skarl-drake' });
    expect(c.played).toEqual([
      'sfx.water.enter',
      'sfx.water.leave',
      'sfx.dive.in',
      'sfx.dive.breath-warn',
      'sfx.dive.out',
      'sfx.glide.land',
      'sfx.ferry.board',
      'sfx.ferry.bell',
      'sfx.wyrm.hathren.song',
      'sfx.drake.chain',
      'sfx.drake.freed',
    ]);
    expect(c.attached.map((a) => a.key)).toEqual(['sfx.glide.wind', 'sfx.ferry.pole']);
    expect(c.attached.every((a) => a.object === c.playerRoot)).toBe(true);
    expect(c.detached).toEqual([1, 2]);
  });

  it('glide loop: attached once, detached on a save load mid-glide, and on dispose', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.emit('glide.started', { ledgeId: 'l' });
    c.emit('glide.started', { ledgeId: 'l' });
    expect(c.attached).toHaveLength(1);
    c.emit('save.loaded', { slot: 's' });
    expect(c.detached).toEqual([1]);
    c.emit('glide.started', { ledgeId: 'l' });
    plugin.dispose?.();
    expect(c.detached).toEqual([1, 2]);
  });

  it('dragon flight follows the actor, falls back to a scene object, then to one flat beat for a bare name', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.emit('dragon.flight', { actorId: 'skarl-drake', on: true });
    c.emit('dragon.flight', { actorId: 'hathren-mesh', on: true });
    expect(c.attached.map((a) => a.key)).toEqual(['sfx.dragon.wingbeat', 'sfx.dragon.wingbeat']);
    expect(() => {
      c.emit('dragon.flight', { actorId: 'ysmeryth', on: true });
      c.emit('dragon.flight', { actorId: 'ysmeryth', on: false });
    }).not.toThrow();
    expect(c.attached).toHaveLength(2);
    expect(c.played).toEqual(['sfx.dragon.wingbeat']);
    c.emit('dragon.flight', { actorId: 'skarl-drake', on: false });
    expect(c.detached).toEqual([1]);
    c.emit('save.loaded', { slot: 's' });
    expect(c.detached).toEqual([1, 2]);
  });

  it('polls wading from the water service and the feet: a slosh per step, none out of water or standing still', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    const walk = (speed: number, seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) {
        c.feet.x += speed / 60;
        c.tick(1 / 60);
      }
    };
    const sloshes = () => c.played.filter((k) => k === 'sfx.water.wade').length;
    walk(3, 3);
    expect(sloshes()).toBe(0);
    c.water.state = 'wading';
    walk(0, 3);
    expect(sloshes()).toBe(0);
    walk(3, 3);
    const slow = sloshes();
    expect(slow).toBeGreaterThanOrEqual(4);
    walk(6, 3);
    expect(sloshes() - slow).toBeGreaterThan(slow * 1.7);
    c.water.state = 'dry';
    const n = sloshes();
    walk(3, 3);
    expect(sloshes()).toBe(n);
    c.water.state = 'diving';
    walk(3, 3);
    expect(sloshes()).toBe(n);
    plugin.dispose?.();
    expect(c.systems).toEqual([]);
  });

  it('a teleport (one huge step) is not a walk', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.water.state = 'wading';
    c.tick(1 / 60);
    c.feet.x = 5000;
    c.tick(1 / 60);
    expect(c.played).toEqual([]);
  });

  it('is a silent no-op without an audio service', { timeout: T }, () => {
    const c = fakeCtx({ audio: false, music: false });
    setup(c);
    c.water.state = 'wading';
    expect(() => {
      c.emit('telegraph', { actorId: 'ogre#1', moveId: 'ogre.slam' });
      c.emit('glide.started', { ledgeId: 'l' });
      c.emit('ferry.boarded', { routeId: 'r', from: 'a', to: 'b' });
      c.emit('dragon.flight', { actorId: 'ysmeryth', on: true });
      c.emit('breath.changed', { value: 2 });
      c.feet.x += 1;
      c.tick(1 / 60);
      c.feet.x += 1;
      c.tick(1 / 60);
      c.emit('trial.started', { trialId: YSMERYTH_TRIAL_ID, opponentId: 'o', breaksToWin: 3 });
      c.emit('trial.ended', { trialId: YSMERYTH_TRIAL_ID, reason: 'won' });
      vi.advanceTimersByTime(TRIAL_RELEASE_MS + 1);
    }).not.toThrow();
    expect(c.played).toEqual([]);
    expect(c.attached).toEqual([]);
  });

  it('swallows an audio service that throws', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    const boom = () => {
      throw new Error('no such sound');
    };
    const a = c.audio as { play: unknown; playAt: unknown; attach: unknown };
    a.play = boom;
    a.playAt = boom;
    a.attach = boom;
    expect(() => {
      c.emit('telegraph', { actorId: 'ogre#1', moveId: 'ogre.slam' });
      c.emit('water.entered', { kind: 'wade', volumeId: 'v' });
      c.emit('glide.started', { ledgeId: 'l' });
      c.emit('ferry.boarded', { routeId: 'r', from: 'a', to: 'b' });
    }).not.toThrow();
  });

  it('only ever plays registered keys', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    c.emit('telegraph', { actorId: 'ogre#1', moveId: 'ysmeryth.breath' });
    c.emit('wyrm.hathren', { beat: 'spray' });
    c.emit('ferry.boarded', { routeId: 'r', from: 'a', to: 'b' });
    const registered = new Set(c.registered.map((r) => r.key));
    for (const k of [...c.played, ...c.playedAt.map((p) => p.key), ...c.attached.map((a) => a.key)]) expect(registered.has(k)).toBe(true);
  });
});

describe('Ysmeryth trial music', () => {
  const start = (c: ReturnType<typeof fakeCtx>, trialId = YSMERYTH_TRIAL_ID) => c.emit('trial.started', { trialId, opponentId: 'o', breaksToWin: 3 });
  const end = (c: ReturnType<typeof fakeCtx>, trialId = YSMERYTH_TRIAL_ID, reason = 'won') => c.emit('trial.ended', { trialId, reason });

  it('uses the shipped trial id', () => expect(YSMERYTH_TRIAL_ID).toBe('ysmeryth-trial'));

  it('turns the trial mix on at the start and off a second after the end', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    start(c);
    expect(c.boss).toEqual([[true, YSMERYTH_TRIAL_ID]]);
    end(c);
    vi.advanceTimersByTime(TRIAL_RELEASE_MS - 1);
    expect(c.boss).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(c.boss).toEqual([
      [true, YSMERYTH_TRIAL_ID],
      [false, YSMERYTH_TRIAL_ID],
    ]);
  });

  it('an end followed by a start within a second (a restart) keeps the mix and never drops it', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    start(c);
    end(c, YSMERYTH_TRIAL_ID, 'lost');
    vi.advanceTimersByTime(400);
    start(c);
    vi.advanceTimersByTime(5000);
    expect(c.boss).toEqual([[true, YSMERYTH_TRIAL_ID]]);
    // a later real end still releases
    end(c);
    vi.advanceTimersByTime(TRIAL_RELEASE_MS + 1);
    expect(c.boss.at(-1)).toEqual([false, YSMERYTH_TRIAL_ID]);
  });

  it('a load that restarts the trial re-asserts the mix one tick after the director reset', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    start(c);
    c.trials.running = YSMERYTH_TRIAL_ID;
    end(c, YSMERYTH_TRIAL_ID, 'loaded');
    start(c); // the quest gate restarts it; bossOn is still true so no setBoss here
    c.emit('save.loaded', {});
    expect(c.boss).toEqual([[true, YSMERYTH_TRIAL_ID]]);
    c.tick(1 / 60); // after the music plugin's reset
    expect(c.boss).toEqual([
      [true, YSMERYTH_TRIAL_ID],
      [true, YSMERYTH_TRIAL_ID],
    ]);
    vi.advanceTimersByTime(5000);
    expect(c.boss.some((b) => !b[0])).toBe(false);
  });

  it('a respawn re-asserts a running trial, and a load with no trial running drops the memory without setBoss(false)', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    start(c);
    c.trials.running = YSMERYTH_TRIAL_ID;
    c.emit('actor.revived', { actorId: 'player', reason: 'respawn' });
    c.tick(1 / 60);
    expect(c.boss).toHaveLength(2);
    c.trials.running = null;
    end(c, YSMERYTH_TRIAL_ID, 'loaded');
    c.emit('save.loaded', {});
    c.tick(1 / 60);
    vi.advanceTimersByTime(5000);
    expect(c.boss).toHaveLength(2); // no false call: the director was reset already
    start(c); // bossOn was cleared, so a fresh start turns it on again
    expect(c.boss).toHaveLength(3);
  });

  it('a start after the mix was dropped turns it on again', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    start(c);
    end(c);
    vi.advanceTimersByTime(TRIAL_RELEASE_MS + 1);
    start(c);
    expect(c.boss.map((b) => b[0])).toEqual([true, false, true]);
  });

  it('ignores other trial ids, and an end that never had a start', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    start(c, 'tobb-trial');
    end(c, 'tobb-trial');
    end(c);
    vi.advanceTimersByTime(5000);
    expect(c.boss).toEqual([]);
    start(c);
    end(c, 'tobb-trial');
    vi.advanceTimersByTime(5000);
    expect(c.boss).toEqual([[true, YSMERYTH_TRIAL_ID]]);
  });

  it('does nothing without a music service, and a pending release is cancelled on dispose', { timeout: T }, () => {
    const a = fakeCtx({ audio: true, music: false });
    setup(a);
    expect(() => {
      start(a);
      end(a);
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
    plugin.dispose?.();
    const c = fakeCtx();
    setup(c);
    start(c);
    end(c);
    plugin.dispose?.();
    vi.advanceTimersByTime(5000);
    expect(c.boss).toEqual([[true, YSMERYTH_TRIAL_ID]]);
  });
});

// --- the hawk shriek against the real Brain -----------------------------------------------------

describe('the hawk shriek fires before the stoop damage window', () => {
  // The test opens the damage window itself (`brain.windowOpened`); in the game the animator opens it from the clip.
  const DT = 1 / 60;
  /** A stand-in `hawk.stoop` (K6b PR 2 has no numbers yet): a red dive with a leech.lunge-like clip window and a longer wind-up. */
  const STOOP: MoveDef = {
    ...FEN_LEECH.moves[0],
    id: 'hawk.stoop',
    windup: 0.7,
    activeStart: 0.35,
    activeEnd: 0.6,
    range: [3, 14],
    leap: undefined,
  };
  const HAWK_DEF: EnemyDef = { ...FEN_LEECH, moves: [STOOP] };

  const senses = (over: Partial<Senses> = {}): Senses => ({
    self: { x: 0, z: 0 },
    targetId: 'player',
    targetAlive: true,
    targetPos: { x: 0, z: -8 },
    notices: false,
    sees: true,
    distance: 8,
    facingErrorDeg: 0,
    healthFraction: 1,
    stuckGiveUp: false,
    yieldAllowed: false,
    ...over,
  });

  it('the telegraph (and with it the shriek) lands at windup start, at least activeStart seconds before the window that deals damage', { timeout: T }, () => {
    const c = fakeCtx();
    setup(c);
    let clock = 0;
    const shriekAt: number[] = [];
    const damageFrameAt: number[] = [];
    const states: AiState[] = [];
    // The enemy glue's telegraph hook raises the `telegraph` event exactly as the real glue does; the router hears it.
    const hooks: BrainHooks = {
      stateChanged: (_f, to) => void states.push(to),
      aggro: () => {},
      calm: () => {},
      startAttack: () => 1,
      cancelAttack: () => {},
      telegraph: (move, swingId, lead) => {
        const before = c.played.length;
        c.emit('telegraph', { actorId: 'hawk#1', kind: move.telegraph, attackId: move.clip, moveId: move.id, swingId, leadSeconds: lead });
        if (c.played.length > before) shriekAt.push(clock);
      },
      telegraphCancelled: () => {},
      pickMove: (d) => (d <= STOOP.range[1] ? STOOP : null),
      markMoveUsed: () => {},
      acquireToken: () => true,
      releaseToken: () => {},
      flinch: () => {},
      knockback: () => {},
      yieldStarted: () => {},
      refill: () => {},
      alertPack: () => {},
    };
    const brain = new Brain(HAWK_DEF, hooks, { home: { x: 0, z: 0 }, rise: false });
    const step = (s: Senses) => {
      clock += DT;
      brain.step(DT, s);
    };
    step(senses({ notices: true }));
    while (brain.state !== 'chase' && clock < 5) step(senses());
    expect(brain.state).toBe('chase');
    expect(shriekAt).toEqual([]);

    while (brain.state !== 'telegraph' && clock < 10) step(senses());
    expect(brain.state).toBe('telegraph');
    // The shriek played on the very tick the brain entered the telegraph, before any damage could be dealt.
    expect(c.played).toEqual(['sfx.hawk.shriek']);
    expect(shriekAt).toHaveLength(1);
    const telegraphAt = shriekAt[0];
    expect(telegraphAt).toBeCloseTo(clock, 6);

    // The window (the first damage frame) opens only when the animator says so, `windup` seconds after the telegraph.
    while (clock - telegraphAt < STOOP.windup - DT / 2) {
      step(senses({ distance: 8 }));
      expect(brain.state, 'no damage state before the window opens').toBe('telegraph');
    }
    brain.windowOpened(1);
    damageFrameAt.push(clock);
    expect(brain.state).toBe('attack');
    expect(damageFrameAt[0] - shriekAt[0]).toBeGreaterThanOrEqual(STOOP.activeStart);
    expect(damageFrameAt[0] - shriekAt[0]).toBeGreaterThanOrEqual(STOOP.windup - DT);
    expect(c.played).toEqual(['sfx.hawk.shriek']); // and it did not play a second time
  });
});
