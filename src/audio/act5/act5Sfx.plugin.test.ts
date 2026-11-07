import { afterEach, describe, expect, it } from 'vitest';
import { ACT5_SFX_KEYS } from './act5Sfx';
import plugin from './act5Sfx.plugin';
import { ensureAct5Sfx } from './act5SfxEnsure';

type Handler = (payload: never) => void;

function fakeCtx(opts: { audio?: boolean; music?: boolean; lava?: boolean } = { audio: true, music: true }) {
  const handlers = new Map<string, Handler[]>();
  const registered: Array<{ key: string; loop?: boolean }> = [];
  const played: string[] = [];
  const attached: string[] = [];
  const boss: string[] = [];
  const systems: Array<{ id: string; fixedUpdate?: (dt: number) => void }> = [];
  const audio = {
    register: (key: string, def: { loop?: boolean }) => void registered.push({ key, loop: def.loop }),
    play: (key: string) => (played.push(key), 1),
    playAt: (key: string) => (played.push(key), 1),
    attach: (key: string) => (attached.push(key), attached.length),
    detach: () => undefined,
  };
  const music = { setBoss: (on: boolean, id?: string) => void boss.push(`${on ? '+' : '-'}${id}`), onBeat: () => () => {} };
  const lava = { nearest: () => ({ distance: 3 }), vents: () => [{ at: { x: 0, z: 2 }, state: 'open' }] };
  const ctx = {
    services: { get: (name: string) => (name === 'audio' && opts.audio ? audio : name === 'music' && opts.music ? music : name === 'lava' && opts.lava ? lava : undefined) },
    actors: { get: () => undefined },
    player: { actor: { root: { name: 'player' } }, feet: { x: 0, z: 0 } },
    systems: { add: (s: { id: string; fixedUpdate?: (dt: number) => void }) => (systems.push(s), () => void systems.splice(systems.indexOf(s), 1)) },
    events: {
      on: (type: string, h: Handler) => {
        const list = handlers.get(type) ?? [];
        list.push(h);
        handlers.set(type, list);
        return () => void list.splice(list.indexOf(h), 1);
      },
    },
  };
  const emit = (type: string, payload: unknown) => {
    for (const h of [...(handlers.get(type) ?? [])]) h(payload as never);
  };
  return { ctx, emit, registered, played, attached, boss, systems, handlers };
}

afterEach(() => plugin.dispose?.());

describe('act5-sfx plugin', () => {
  it('forwards the siege events to the sounds and the siege music (the wave stings and the lull key on the events, not the mode)', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    f.emit('siege.wave.started', { siegeId: 'r27', n: 1 });
    f.emit('siege.gate.damaged', { siegeId: 'r27', pct: 60 });
    f.emit('siege.gate.damaged', { siegeId: 'r27', pct: 45 });
    f.emit('siege.wave.cleared', { siegeId: 'r27', n: 1 });
    expect(f.played).toEqual(['sfx.siege.horn', 'sfx.gate.hit', 'sfx.gate.crack', 'sfx.siege.clear']);
    expect(f.boss).toEqual(['+siege', '+siege.lull', '-siege']);
    for (const k of ['sfx.siege.horn', 'sfx.gate.crack']) expect(f.registered.map((r) => r.key)).toContain(k);
  });

  it('listens by name for events that do not exist yet (N3 vent.closing, N4 ram, N5 shield line) and plays them', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    f.emit('vent.closing', { ventId: 'v1', inS: 1.5 });
    f.emit('siege.ram.hit', { siegeId: 'm52' });
    f.emit('enemies.shieldLine.broken', { lineId: 'l1', members: [] });
    f.emit('siege.dragon.breath', { siegeId: 'm52', dragonId: 'd1', at: { x: 0, y: 0, z: 0 } });
    f.emit('siege.gong', { siegeId: 'm52', by: 'cael' });
    expect(f.played).toEqual(['sfx.vent.crack', 'sfx.ram.hit', 'sfx.siege.lineBreak', 'sfx.dragon.breath', 'sfx.gong.rim']);
  });

  it('listens for the beat on Ulthred\'s phase 3 and for no other boss, and re-derives the siege mix after a load', () => {
    const f = fakeCtx();
    let beatListeners = 0;
    const svc = f.ctx.services.get;
    f.ctx.services.get = ((n: string) => {
      const s = svc(n) as { onBeat?: () => () => void } | undefined;
      if (n === 'music' && s) return { ...s, onBeat: () => (beatListeners++, () => {}) };
      if (n === 'movementMode') return { current: 'siege' };
      return s;
    }) as never;
    plugin.setup(f.ctx as never);
    f.emit('boss.phase', { bossId: 'vey', phase: 3, previous: 2 });
    expect(beatListeners).toBe(0);
    f.emit('boss.phase', { bossId: 'ulthred', phase: 3, previous: 2 });
    expect(beatListeners).toBe(1);
    f.emit('save.loaded', {});
    expect(f.boss).toEqual([]); // not synchronously: the music plugin resets its director after this handler
    f.systems[0].fixedUpdate?.(1 / 60);
    expect(f.boss).toEqual(['+siege']);
  });

  it('the lava and vent loops follow N3\'s service when it exists, and a load stops them', () => {
    const f = fakeCtx({ audio: true, music: true, lava: true });
    plugin.setup(f.ctx as never);
    f.systems[0].fixedUpdate?.(0.3);
    expect(f.attached).toEqual(['sfx.lava.loop', 'sfx.vent.idle']);
    f.emit('save.loaded', {});
    f.systems[0].fixedUpdate?.(0.3);
    expect(f.attached).toHaveLength(4);
  });

  it('adds one late system and removes every handler on dispose', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    expect(f.systems.map((s) => s.id)).toEqual(['act5-sfx']);
    plugin.dispose?.();
    expect(f.systems).toEqual([]);
    for (const list of f.handlers.values()) expect(list).toEqual([]);
  });

  it('ensureAct5Sfx registers a key others play by name, ignores unknown keys, and is a no-op after dispose', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    ensureAct5Sfx('sfx.anvil.strike');
    ensureAct5Sfx('sfx.not-a-key');
    expect(f.registered.map((r) => r.key)).toEqual(['sfx.anvil.strike']);
    plugin.dispose?.();
    expect(() => ensureAct5Sfx('sfx.gong.rim')).not.toThrow();
    expect(f.registered).toHaveLength(1);
  });

  it('without an audio or music service it registers and plays nothing and throws nothing', () => {
    const f = fakeCtx({ audio: false, music: false });
    plugin.setup(f.ctx as never);
    expect(() => {
      f.emit('siege.wave.started', { siegeId: 'x', n: 1 });
      f.emit('boss.phase', { bossId: 'ulthred', phase: 3, previous: 2 });
      f.systems[0].fixedUpdate?.(1);
    }).not.toThrow();
    ensureAct5Sfx('sfx.gong.rim');
    expect(f.registered).toEqual([]);
    expect(f.played).toEqual([]);
  });

  it('registers every key exactly once, loops flagged', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    for (const k of ACT5_SFX_KEYS) ensureAct5Sfx(k);
    for (const k of ACT5_SFX_KEYS) ensureAct5Sfx(k);
    expect(f.registered.map((r) => r.key).sort()).toEqual([...ACT5_SFX_KEYS].sort());
    expect(f.registered.find((r) => r.key === 'sfx.lava.loop')?.loop).toBe(true);
  }, 60000);
});
