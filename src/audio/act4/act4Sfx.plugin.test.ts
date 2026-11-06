import { afterEach, describe, expect, it } from 'vitest';
import { ACT4_SFX_KEYS } from './act4Sfx';
import plugin, { skinOf } from './act4Sfx.plugin';
import { ensureAct4Sfx } from './act4SfxEnsure';

type Handler = (payload: never) => void;

function fakeCtx(opts: { audio?: boolean; weather?: 'clear' | 'warning' | 'storm' | 'throws' } = { audio: true }) {
  const handlers = new Map<string, Handler[]>();
  const registered: Array<{ key: string; loop?: boolean }> = [];
  const played: string[] = [];
  const playedAt: string[] = [];
  const attached: string[] = [];
  const systems: Array<{ id: string; fixedUpdate?: (dt: number) => void }> = [];
  const audio = {
    register: (key: string, def: { loop?: boolean }) => void registered.push({ key, loop: def.loop }),
    play: (key: string) => (played.push(key), 1),
    playAt: (key: string) => (playedAt.push(key), 1),
    attach: (key: string) => (attached.push(key), attached.length),
    detach: () => undefined,
  };
  const actor = (id: string, kind: string, skin?: string) => ({ id, kind, skin, root: {}, worldPosition: (v: { set: (x: number, y: number, z: number) => void }) => (v.set(1, 2, 3), v) });
  const actors = new Map([
    ['husk#1', actor('husk#1', 'ash-wraith', 'wraith-husk')],
    ['strider#1', actor('strider#1', 'waste-strider')],
  ]);
  const ctx = {
    services: {
      get: (name: string) =>
        name === 'audio' && opts.audio
          ? audio
          : name === 'weather' && opts.weather
            ? {
                state: () => {
                  if (opts.weather === 'throws') throw new Error('no clock');
                  return { kind: opts.weather };
                },
              }
            : undefined,
    },
    actors: { get: (id: string) => actors.get(id) },
    player: { actor: { root: { name: 'player' } } },
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
  return { ctx, emit, registered, played, playedAt, attached, systems, actors, handlers };
}

afterEach(() => plugin.dispose?.());

describe('act4-sfx plugin', () => {
  it('forwards spawns, telegraphs and deaths: a husk rises, rasps and crumbles; a strider clicks while alive', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    f.emit('actor.spawned', { actor: f.actors.get('husk#1') });
    f.emit('actor.spawned', { actor: f.actors.get('strider#1') });
    f.emit('telegraph', { actorId: 'husk#1', moveId: 'wraith.slash' });
    f.emit('actor.died', { actorId: 'husk#1', killerId: null, kind: 'ash-wraith' });
    expect(f.playedAt).toEqual(['sfx.husk.rise', 'sfx.husk.rasp', 'sfx.husk.collapse']);
    expect(f.attached).toEqual(['sfx.strider.click']);
    // Played keys were rendered and registered first (the lazy path).
    for (const k of ['sfx.husk.rise', 'sfx.strider.click']) expect(f.registered.map((r) => r.key)).toContain(k);
    expect(f.registered.find((r) => r.key === 'sfx.strider.click')?.loop).toBe(true);
  });

  it('adds one late system and removes every handler on dispose', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    expect(f.systems.map((s) => s.id)).toEqual(['act4-sfx']);
    plugin.dispose?.();
    expect(f.systems).toEqual([]);
    for (const list of f.handlers.values()) expect(list).toEqual([]);
  });

  it('ensureAct4Sfx registers a key others play by name, ignores unknown keys, and is a no-op after dispose', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    ensureAct4Sfx('sfx.glass.pillar.4');
    ensureAct4Sfx('sfx.not-a-key');
    expect(f.registered.map((r) => r.key)).toEqual(['sfx.glass.pillar.4']);
    plugin.dispose?.();
    expect(() => ensureAct4Sfx('sfx.gong.last')).not.toThrow();
    expect(f.registered).toHaveLength(1);
  });

  it('without an audio service it registers and plays nothing', () => {
    const f = fakeCtx({ audio: false });
    plugin.setup(f.ctx as never);
    f.emit('actor.spawned', { actor: f.actors.get('husk#1') });
    ensureAct4Sfx('sfx.gong.last');
    expect(f.registered).toEqual([]);
    expect(f.playedAt).toEqual([]);
  });

  it('forwards the weather: onset and wind on a storm, the muffled wind in a shelter, nothing after clear', () => {
    const f = fakeCtx({ audio: true });
    plugin.setup(f.ctx as never);
    f.emit('weather.changed', { kind: 'storm', from: 'warning' });
    f.emit('shelter.entered', { id: 'waste.shelter.1' });
    f.emit('weather.changed', { kind: 'clear', from: 'storm' });
    expect(f.played).toEqual(['sfx.storm.onset', 'sfx.shelter.flap']);
    expect(f.attached).toEqual(['sfx.storm.loop', 'sfx.storm.muffled']);
  });

  it('a running storm is picked up at setup and after a load from the weather service, without an onset', () => {
    const f = fakeCtx({ audio: true, weather: 'storm' });
    plugin.setup(f.ctx as never);
    expect(f.attached).toEqual(['sfx.storm.loop']);
    f.emit('save.loaded', {});
    expect(f.attached).toEqual(['sfx.storm.loop']);
    expect(f.played).toEqual([]);
  });

  it('a throwing weather service reads as clear', () => {
    const f = fakeCtx({ audio: true, weather: 'throws' });
    expect(() => plugin.setup(f.ctx as never)).not.toThrow();
    expect(f.attached).toEqual([]);
  });

  it('skinOf reads a string skin and nothing else', () => {
    expect(skinOf({ skin: 'wraith-husk' })).toBe('wraith-husk');
    expect(skinOf({ skin: 3 })).toBeNull();
    expect(skinOf({})).toBeNull();
  });

  it('registers every key exactly once', () => {
    const f = fakeCtx();
    plugin.setup(f.ctx as never);
    for (const k of ACT4_SFX_KEYS) ensureAct4Sfx(k);
    for (const k of ACT4_SFX_KEYS) ensureAct4Sfx(k);
    expect(f.registered.map((r) => r.key).sort()).toEqual([...ACT4_SFX_KEYS].sort());
  }, 60000);
});
