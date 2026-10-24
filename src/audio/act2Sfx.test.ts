import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WYRM_SOUND_KEYS } from '../enemies/wyrm/sounds';
import { ACT2_SFX_KEYS, ACT2_SFX_VOLUME, SLAGMAW_SFX_KEYS, act2SfxSamples } from './act2Sfx';
import plugin from './act2Sfx.plugin';
import { ensureAct2Sfx } from './act2SfxEnsure';
import { MOVE_SFX } from './act2SfxRouter';

type Handler = (payload: never) => void;

/** A fake plugin context: a tiny event bus, a recording audio service, and actor and structure lookups. */
function fakeCtx(opts: { audio?: boolean } = { audio: true }) {
  const handlers = new Map<string, Handler[]>();
  const registered: Array<{ key: string; def: { volume?: number } }> = [];
  const played: string[] = [];
  const playedAt: Array<{ key: string; at: { x: number; y: number; z: number } }> = [];
  const audio = {
    register: (key: string, def: { volume?: number }) => void registered.push({ key, def }),
    play: (key: string) => void played.push(key),
    playAt: (key: string, at: { x: number; y: number; z: number }) => void playedAt.push({ key, at: { x: at.x, y: at.y, z: at.z } }),
  };
  const structures: Record<string, { kind: 'cart' | 'barricade'; maxHealth: number }> = {
    barricade: { kind: 'barricade', maxHealth: 300 },
    'cart-1': { kind: 'cart', maxHealth: 100 },
  };
  const ctx = {
    services: {
      get: (name: string) => (name === 'audio' ? (opts.audio ? audio : undefined) : name === 'waves' ? { structure: (id: string) => structures[id] } : undefined),
    },
    actors: {
      get: (id: string) =>
        id === 'golem#1'
          ? { kind: 'cinder-golem', root: {}, worldPosition: (v: { set: (x: number, y: number, z: number) => void }) => (v.set(1, 2, 3), v) }
          : id === 'slagmaw#1'
            ? { kind: 'the-slagmaw', root: null, worldPosition: (v: unknown) => v }
            : id === 'crawler#1'
            ? { kind: 'slag-crawler', root: null, worldPosition: (v: unknown) => v }
            : undefined,
    },
    events: {
      on: (type: string, h: Handler) => {
        handlers.set(type, [...(handlers.get(type) ?? []), h]);
        return () => handlers.set(type, (handlers.get(type) ?? []).filter((x) => x !== h));
      },
    },
  };
  const emit = (type: string, payload: object) => (handlers.get(type) ?? []).forEach((h) => h(payload as never));
  return { ctx, emit, registered, played, playedAt };
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

describe('act2 sfx keys', () => {
  it('has no duplicate keys, and none that collide with the wyrm keys', () => {
    expect(new Set(ACT2_SFX_KEYS).size).toBe(ACT2_SFX_KEYS.length);
    const all = [...ACT2_SFX_KEYS, ...WYRM_SOUND_KEYS.map((k) => `sfx.wyrm.${k}`)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every key a volume and a non-empty, finite, audible, deterministic render', () => {
    for (const key of ACT2_SFX_KEYS) {
      expect(ACT2_SFX_VOLUME[key], key).toBeGreaterThan(0);
      const a = act2SfxSamples(key);
      expect(a.length, key).toBeGreaterThan(1000);
      expect(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1), key).toBe(true);
      expect(Math.max(...a.map(Math.abs)), key).toBeGreaterThan(0.05);
      const b = act2SfxSamples(key);
      expect(a.every((v, i) => v === b[i]), key).toBe(true);
    }
  });

  it('renders lazily: nothing is rendered or registered during setup, the idle slices then register every key', () => {
    const c = fakeCtx();
    setup(c);
    expect(c.registered).toEqual([]);
    vi.advanceTimersToNextTimer();
    expect(c.registered).toHaveLength(1);
    vi.runAllTimers();
    expect(c.registered).toHaveLength(ACT2_SFX_KEYS.length);
  });

  it('renders a key at once when it is about to be played before its slice', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('puzzle.solved', { id: 'weeping-bellows' });
    expect(c.registered.map((r) => r.key)).toEqual(['sfx.bellows.solved']);
    expect(c.played).toEqual(['sfx.bellows.solved']);
    vi.runAllTimers();
    expect(c.registered.filter((r) => r.key === 'sfx.bellows.solved')).toHaveLength(1);
  });

  it('ensureAct2Sfx (the Slagmaw\'s direct plays) renders a key before its slice, and is a no-op once the plugin is gone', () => {
    const c = fakeCtx();
    setup(c);
    ensureAct2Sfx('sfx.slagmaw.erupt');
    expect(c.registered.map((r) => r.key)).toEqual(['sfx.slagmaw.erupt']);
    ensureAct2Sfx('sfx.slagmaw.erupt');
    ensureAct2Sfx('not.a.key');
    expect(c.registered).toHaveLength(1);
    plugin.dispose?.();
    ensureAct2Sfx('sfx.slagmaw.valve');
    expect(c.registered).toHaveLength(1);
  });

  it('uses requestIdleCallback for its slices where the browser has it', () => {
    const queue: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => queue.push(cb));
    vi.stubGlobal('cancelIdleCallback', () => {});
    const c = fakeCtx();
    setup(c);
    expect(queue).toHaveLength(1);
    vi.runAllTimers();
    expect(c.registered).toEqual([]);
    queue.shift()!();
    expect(c.registered).toHaveLength(1);
    expect(queue).toHaveLength(1);
  });

  it('stops rendering on dispose', () => {
    const c = fakeCtx();
    setup(c);
    plugin.dispose?.();
    vi.runAllTimers();
    expect(c.registered).toEqual([]);
  });

  it('registers every key once, with its volume', () => {
    const c = fakeCtx();
    setup(c);
    vi.runAllTimers();
    expect(c.registered.map((r) => r.key).sort()).toEqual([...ACT2_SFX_KEYS].sort());
    for (const r of c.registered) expect(r.def.volume).toBe(ACT2_SFX_VOLUME[r.key as (typeof ACT2_SFX_KEYS)[number]]);
  });

  it('maps every ground-enemy move to a registered key', () => {
    for (const key of Object.values(MOVE_SFX)) expect(ACT2_SFX_KEYS).toContain(key);
  });
});

describe('slagmaw sounds', () => {
  const SIX = ['rumble', 'tremor', 'tremor.chain', 'erupt', 'spit', 'valve'].map((k) => `sfx.slagmaw.${k}`);

  it('keeps the six keys the Slagmaw fight plays', () => {
    expect([...SLAGMAW_SFX_KEYS].sort()).toEqual([...SIX].sort());
  });

  it('registers all six with a volume, and each renders a real, finite, deterministic sound of its own', () => {
    const c = fakeCtx();
    setup(c);
    vi.runAllTimers();
    const reg = new Map(c.registered.map((r) => [r.key, r.def.volume]));
    const renders = SIX.map((key) => {
      expect(reg.get(key), key).toBe(ACT2_SFX_VOLUME[key as keyof typeof ACT2_SFX_VOLUME]);
      const a = act2SfxSamples(key as never);
      expect(a.length, key).toBeGreaterThan(8000);
      expect(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1), key).toBe(true);
      expect(a.reduce((m, v) => Math.max(m, Math.abs(v)), 0), key).toBeGreaterThan(0.1);
      // Not a click or a flat tone: energy is spread over the sound's length.
      const rms = (from: number, to: number) => Math.sqrt(a.slice(Math.floor(a.length * from), Math.floor(a.length * to)).reduce((s, v) => s + v * v, 0) / (a.length * (to - from)));
      expect(rms(0, 0.5), key).toBeGreaterThan(0.01);
      const again = act2SfxSamples(key as never);
      expect(a.every((v, i) => v === again[i]), key).toBe(true);
      return a;
    });
    // Six distinct designs, not copies of one another (nor of the placeholder's clone).
    for (let i = 0; i < renders.length; i++)
      for (let j = i + 1; j < renders.length; j++) {
        const n = Math.min(renders[i]!.length, renders[j]!.length);
        let same = 0;
        for (let k = 0; k < n; k++) if (renders[i]![k] === renders[j]![k]) same++;
        expect(same / n, `${SIX[i]} vs ${SIX[j]}`).toBeLessThan(0.5);
      }
  });

  it('shapes them for the job: the chained tremor is longer than the tremor, the erupt is the loudest, the rumble the longest', () => {
    const len = (k: string) => act2SfxSamples(k as never).length;
    expect(len('sfx.slagmaw.tremor.chain')).toBeGreaterThan(len('sfx.slagmaw.tremor'));
    expect(len('sfx.slagmaw.rumble')).toBeGreaterThan(Math.max(...SIX.filter((k) => k !== 'sfx.slagmaw.rumble').map(len)));
    expect(ACT2_SFX_VOLUME['sfx.slagmaw.erupt']).toBe(Math.max(...SIX.map((k) => ACT2_SFX_VOLUME[k as keyof typeof ACT2_SFX_VOLUME])));
  });
});

describe('act2 sfx hooks', () => {
  it('plays each ground-enemy move at the actor, or flat when the actor is unplaced', () => {
    const c = fakeCtx();
    setup(c);
    for (const [moveId, key] of Object.entries(MOVE_SFX)) {
      c.playedAt.length = 0;
      c.emit('telegraph', { actorId: 'golem#1', moveId });
      expect(c.playedAt, moveId).toEqual([{ key, at: { x: 1, y: 2, z: 3 } }]);
    }
    c.emit('telegraph', { actorId: 'crawler#1', moveId: 'crawler.bite' });
    expect(c.played).toEqual(['sfx.crawler.bite']);
    c.emit('telegraph', { actorId: 'golem#1', moveId: 'wraith.claw' });
    expect(c.played).toHaveLength(1);
  });

  it('plays the golem crumble on death and the core break on stagger, but not for other kinds', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('actor.died', { actorId: 'golem#1', kind: 'cinder-golem' });
    c.emit('actor.staggered', { actorId: 'golem#1', byId: null });
    expect(c.playedAt.map((p) => p.key)).toEqual(['sfx.golem.crumble', 'sfx.golem.corebreak']);
    c.emit('actor.died', { actorId: 'x', kind: 'wraith' });
    c.emit('actor.staggered', { actorId: 'crawler#1', byId: null });
    expect(c.playedAt).toHaveLength(2);
    expect(c.played).toEqual([]);
  });

  it('plays the quench hiss on a cooling hit', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('cooling.hit', { actorId: 'crawler#1', kind: 'draught' });
    expect(c.played).toEqual(['sfx.crawler.hiss']);
    // The Slagmaw's own cooling hit (and any other non-crawler) is silent here.
    c.emit('cooling.hit', { actorId: 'slagmaw#1', kind: 'valve' });
    c.emit('cooling.hit', { actorId: 'unknown', kind: 'valve' });
    expect(c.played).toEqual(['sfx.crawler.hiss']);
    expect(c.playedAt).toEqual([]);
  });

  it('plays the barricade ram, cart hit (not its spawn event), cart break and barricade fall', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('structure.damaged', { id: 'barricade', health: 250 });
    c.emit('structure.damaged', { id: 'cart-1', health: 100 });
    c.emit('structure.damaged', { id: 'cart-1', health: 60 });
    c.emit('structure.damaged', { id: 'unknown', health: 1 });
    c.emit('structure.destroyed', { id: 'cart-1' });
    c.emit('structure.destroyed', { id: 'barricade' });
    c.emit('structure.destroyed', { id: 'unknown' });
    expect(c.played).toEqual(['sfx.barricade.ram', 'sfx.cart.hit', 'sfx.cart.break', 'sfx.barricade.fall']);
  });

  it('does not ram on a barricade announce or restore at full health, only on a drop', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('structure.damaged', { id: 'barricade', health: 300 });
    c.emit('structure.damaged', { id: 'barricade', health: 300 });
    expect(c.played).toEqual([]);
    c.emit('structure.damaged', { id: 'barricade', health: 250 });
    c.emit('structure.damaged', { id: 'barricade', health: 300 }); // restore
    c.emit('structure.damaged', { id: 'barricade', health: 300 }); // next wave announce
    c.emit('structure.damaged', { id: 'barricade', health: 290 });
    expect(c.played).toEqual(['sfx.barricade.ram', 'sfx.barricade.ram']);
  });

  it('plays the Bellows valve, pressure hiss, solved chime and failed vent, only for its puzzle', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('interact', { interactableId: 'valve:bellows-1', kind: 'valve', actorId: 'player', action: 'interact' });
    c.emit('interact', { interactableId: 'valve:bellows-1', kind: 'valve', actorId: 'player', action: 'mercy' });
    // Other wheels (the Slagmaw's, the mine pools') have their own sounds.
    c.emit('interact', { interactableId: 'deepdelve.slagmaw.valve.1', kind: 'valve', actorId: 'player', action: 'interact' });
    c.emit('interact', { interactableId: 'chest:1', kind: 'chest', actorId: 'player', action: 'interact' });
    c.emit('puzzle.state', { id: 'weeping-bellows', phase: 'pressure' });
    c.emit('puzzle.state', { id: 'weeping-bellows', phase: 'lighting' });
    c.emit('puzzle.state', { id: 'other', phase: 'pressure' });
    c.emit('puzzle.solved', { id: 'other' });
    c.emit('puzzle.solved', { id: 'weeping-bellows' });
    c.emit('puzzle.failed', { id: 'weeping-bellows' });
    expect(c.played).toEqual(['sfx.bellows.valve', 'sfx.bellows.hiss', 'sfx.bellows.solved', 'sfx.bellows.vent']);
  });

  it('only ever plays registered keys', () => {
    const c = fakeCtx();
    setup(c);
    c.emit('telegraph', { actorId: 'golem#1', moveId: 'golem.slam' });
    c.emit('structure.destroyed', { id: 'cart-1' });
    c.emit('puzzle.solved', { id: 'weeping-bellows' });
    const registered = new Set(c.registered.map((r) => r.key));
    for (const k of [...c.played, ...c.playedAt.map((p) => p.key)]) expect(registered.has(k)).toBe(true);
  });

  it('is a silent no-op without an audio service', () => {
    const c = fakeCtx({ audio: false });
    expect(() => setup(c)).not.toThrow();
    expect(c.registered).toEqual([]);
    expect(() => {
      c.emit('telegraph', { actorId: 'golem#1', moveId: 'golem.stomp' });
      c.emit('actor.died', { actorId: 'golem#1', kind: 'cinder-golem' });
      c.emit('structure.damaged', { id: 'barricade', health: 1 });
      c.emit('structure.destroyed', { id: 'cart-1' });
      c.emit('interact', { interactableId: 'v', kind: 'valve', actorId: 'p', action: 'interact' });
      c.emit('puzzle.solved', { id: 'weeping-bellows' });
    }).not.toThrow();
    expect(c.played).toEqual([]);
    expect(c.playedAt).toEqual([]);
  });

  it('swallows an unregistered key', () => {
    const c = fakeCtx();
    setup(c);
    c.ctx.services.get = ((name: string) =>
      name === 'audio'
        ? {
            register: () => {},
            play: () => {
              throw new Error('no such sound');
            },
            playAt: () => {
              throw new Error('no such sound');
            },
          }
        : undefined) as never;
    expect(() => {
      c.emit('telegraph', { actorId: 'golem#1', moveId: 'golem.stomp' });
      c.emit('puzzle.solved', { id: 'weeping-bellows' });
    }).not.toThrow();
  });
});

describe('boss and D04 pool cues', () => {
  const NEW = ['sfx.d04pool.valve', 'sfx.grimtooth.growl', 'sfx.grimtooth.pounce', 'sfx.grimtooth.howl', 'sfx.redmane.horn', 'sfx.redmane.net'] as const;
  const interactValve = (c: ReturnType<typeof fakeCtx>, interactableId: string | undefined, action = 'interact', kind = 'valve') =>
    c.emit('interact', { kind, action, interactableId, actorId: 'player' });

  it('registers the five boss cues and the pool valve, each with samples', () => {
    for (const key of NEW) {
      expect(ACT2_SFX_KEYS).toContain(key);
      const s = act2SfxSamples(key);
      expect(s.length).toBeGreaterThan(1000);
      expect(s.every(Number.isFinite)).toBe(true);
      expect(s.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeGreaterThan(0.05);
      expect(ACT2_SFX_VOLUME[key]).toBeGreaterThan(0);
    }
    const c = fakeCtx();
    setup(c);
    vi.runAllTimers();
    for (const key of NEW) expect(c.registered.filter((r) => r.key === key)).toHaveLength(1);
  });

  it('plays the pool cue (not the Bellows clank) for a d04pool valve, once per turn', () => {
    const c = fakeCtx();
    setup(c);
    interactValve(c, 'valve:d04pool1-2');
    interactValve(c, 'valve:d04pool2-1');
    expect(c.played).toEqual(['sfx.d04pool.valve', 'sfx.d04pool.valve']);
  });

  it('keeps the Bellows valve on its own cue and other valves silent', () => {
    const c = fakeCtx();
    setup(c);
    interactValve(c, 'valve:bellows-1');
    expect(c.played).toEqual(['sfx.bellows.valve']);
    interactValve(c, 'valve:slagmaw-1');
    interactValve(c, 'valve:d04-1');
    interactValve(c, 'valve:mine-3');
    interactValve(c, undefined);
    interactValve(c, 'valve:d04pool1-1', 'mercy');
    interactValve(c, 'valve:d04pool1-1', 'interact', 'use');
    expect(c.played).toEqual(['sfx.bellows.valve']);
  });

  it('is silent without an audio service', () => {
    const c = fakeCtx({ audio: false });
    setup(c);
    expect(() => interactValve(c, 'valve:d04pool1-1')).not.toThrow();
    expect(c.played).toEqual([]);
  });
});
