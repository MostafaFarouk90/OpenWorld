import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetClassSkills } from '../../progression/skills';
import { FakeActor, makeCtx } from '../../spells/testHost';
import type { PluginContext } from '../../vfx/ports';
import plugin from './emberwright.plugin';
import { SKILL } from './skills';

afterEach(() => {
  plugin.dispose?.();
  resetClassSkills();
});

function boot() {
  const handlers = new Map<string, () => { ok: boolean; reason?: string }>();
  const blockers: Array<{ released: boolean }> = [];
  const providers = new Set<unknown>();
  const learned = new Set<string>([SKILL.fireWall, SKILL.ironFamiliar, SKILL.smokeScreen]);
  const f = makeCtx({
    abilities: { registerHandler: (id: string, h: () => never) => (handlers.set(id, h), { ok: true, dispose: () => handlers.delete(id) }) },
    progression: { classId: 'emberwright', learned: (id: string) => learned.has(id) },
    stealth: { addSightBlocker: () => { const e = { released: false }; blockers.push(e); return () => void (e.released = true); } },
    enemies: { perception: { register: (p: unknown) => (providers.add(p), () => void providers.delete(p)) } },
    allyEngagement: { mayEngage: () => true },
  });
  const spawned: string[] = [];
  const despawned: string[] = [];
  const modIds = new Set<string>();
  Object.assign(f.ctx as object, {
    strings: { register: () => undefined },
    damage: Object.assign(f.world.damage, {
      addModifier: (id: string) => {
        if (modIds.has(id)) throw new Error(`duplicate ${id}`);
        modIds.add(id);
        return () => void modIds.delete(id);
      },
    }),
    physics: { raycast: () => null },
    world: { player: { controller: { collider: {} } } },
  });
  Object.assign(f.world.actors, {
    spawn: (init: { id: string; team: 'ally' }) => { spawned.push(init.id); return f.world.actors.add(new FakeActor(init.id, init.team)); },
    despawn: (id: string) => { despawned.push(id); f.world.actors.map.delete(id); },
  });
  (f.ctx as unknown as { player: { avatar: unknown } }).player.avatar = { classId: 'emberwright', controller: { events: { subscribe: () => () => undefined } } };
  return { f, handlers, blockers, providers, spawned, despawned, modIds, learned };
}

describe('emberwright tier 3 plugin', () => {
  it('registers the three handlers; casts them; resets everything on save.loaded, the player\'s death and class change', () => {
    for (const how of ['save.loaded', 'death', 'class.changed'] as const) {
      const t = boot();
      void plugin.setup(t.f.ctx as PluginContext);
      expect(t.handlers.has(SKILL.fireWall) && t.handlers.has(SKILL.ironFamiliar) && t.handlers.has(SKILL.smokeScreen)).toBe(true);
      for (const id of [SKILL.fireWall, SKILL.ironFamiliar, SKILL.smokeScreen]) expect(t.handlers.get(id)!()).toEqual({ ok: true });
      expect(t.spawned).toEqual(['familiar:1']);
      expect(t.blockers).toHaveLength(1);
      expect(t.providers.size).toBe(1);
      if (how === 'death') t.f.world.events.emit('actor.died', { actorId: 'player' } as never);
      else t.f.world.events.emit(how as never, {} as never);
      expect(t.despawned).toEqual(['familiar:1']);
      expect(t.blockers[0].released).toBe(true);
      expect(t.providers.size).toBe(0);
      plugin.dispose?.();
    }
  });

  it('a death elsewhere changes nothing; a respec (skill no longer learned) ends the familiar on the next tick', () => {
    const t = boot();
    void plugin.setup(t.f.ctx as PluginContext);
    t.handlers.get(SKILL.ironFamiliar)!();
    t.f.world.events.emit('actor.died', { actorId: 'somebody' } as never);
    expect(t.despawned).toEqual([]);
    t.learned.delete(SKILL.ironFamiliar);
    t.f.tick(1);
    expect(t.despawned).toEqual(['familiar:1']);
  });

  it('refuses in another class and when not learned', () => {
    const t = boot();
    void plugin.setup(t.f.ctx as PluginContext);
    t.learned.delete(SKILL.fireWall);
    expect(t.handlers.get(SKILL.fireWall)!()).toEqual({ ok: false, reason: 'not-learned' });
    (t.f.services.progression as { classId: string }).classId = 'knight';
    expect(t.handlers.get(SKILL.smokeScreen)!()).toEqual({ ok: false, reason: 'class' });
  });

  it('set up twice on one context does not throw, leaves one of everything, and dispose releases it all', () => {
    const t = boot();
    void plugin.setup(t.f.ctx as PluginContext);
    t.handlers.get(SKILL.smokeScreen)!();
    expect(() => void plugin.setup(t.f.ctx as PluginContext)).not.toThrow();
    expect(t.blockers[0].released).toBe(true);
    expect(t.providers.size).toBe(0);
    expect(t.modIds.size).toBe(1);
    expect(t.handlers.size).toBe(6);
    t.handlers.get(SKILL.ironFamiliar)!();
    t.handlers.get(SKILL.smokeScreen)!();
    expect(t.providers.size).toBe(1);
    plugin.dispose?.();
    expect(t.modIds.size).toBe(0);
    expect(t.handlers.size).toBe(0);
    expect(t.providers.size).toBe(0);
    expect(t.despawned).toContain('familiar:1');
    expect(t.blockers.every((b) => b.released)).toBe(true);
    expect(() => void plugin.setup(t.f.ctx as PluginContext)).not.toThrow();
    vi.restoreAllMocks();
  });
});
