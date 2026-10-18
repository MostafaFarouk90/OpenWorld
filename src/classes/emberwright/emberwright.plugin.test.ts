import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetClassSkills, SKILLS } from '../../progression/skills';
import { makeCtx, type FakeCtx } from '../../spells/testHost';
import plugin from './emberwright.plugin';
import { EMBERWRIGHT_ATTACK_SET } from './tuning';
import { SKILL } from './skills';
import type { PluginContext } from '../../vfx/ports';

let f: FakeCtx | null = null;
afterEach(() => {
  plugin.dispose?.();
  resetClassSkills();
  f = null;
});

function boot(services: Record<string, unknown> = {}) {
  f = makeCtx(services);
  const strings: Record<string, string> = {};
  const mods: Array<() => void> = [];
  Object.assign(f.ctx as object, {
    strings: { register: (_l: string, t: Record<string, string>) => Object.assign(strings, t), has: (k: string) => k in strings },
    damage: Object.assign(f.world.damage, { addModifier: vi.fn(() => () => mods.push(() => undefined)) }),
    physics: { raycast: () => null },
    world: { player: { controller: { collider: {} } } },
  });
  void plugin.setup(f.ctx as PluginContext);
  return { f, strings, mods };
}

const fullServices = () => {
  const calls: string[] = [];
  const handlers = new Map<string, () => unknown>();
  return {
    calls, handlers,
    services: {
      combatVerbs: { registerAttackSet: (id: string) => (calls.push(`attack:${id}`), { ok: true, dispose: () => calls.push('attack-off') }) },
      spells: {
        ember: 100, maxEmber: 100, spendEmber: () => true, restoreEmber: () => 0,
        registerSurgeForm: (id: string, zone: string) => (calls.push(`surge:${id}:${zone}`), { ok: true, dispose: () => calls.push(`surge-off:${zone}`) }),
      },
      classes: { registerKit: (k: { classId: string }) => (calls.push(`kit:${k.classId}`), { ok: true, dispose: () => calls.push('kit-off') }) },
      abilities: { registerHandler: (id: string, h: () => unknown) => (handlers.set(id, h), { ok: true, dispose: () => handlers.delete(id) }) },
      progression: { classId: 'emberwright', learned: () => false },
    },
  };
};

describe('emberwright plugin', () => {
  it('registers the skills, attack set, three Surge forms, kit and three ability handlers, and disposes them all', () => {
    const s = fullServices();
    boot(s.services);
    expect(s.calls).toEqual(['attack:emberwright', 'surge:emberwright:warm', 'surge:emberwright:blaze', 'surge:emberwright:cinder', 'kit:emberwright']);
    expect([...s.handlers.keys()].sort()).toEqual([SKILL.anvilDrop, SKILL.flameLash, SKILL.warmBreath].sort());
    expect(SKILLS.filter((x) => x.classId === 'emberwright')).toHaveLength(15);
    plugin.dispose?.();
    expect(s.calls).toEqual(expect.arrayContaining(['attack-off', 'kit-off', 'surge-off:warm', 'surge-off:blaze', 'surge-off:cinder']));
    expect(s.handlers.size).toBe(0);
  });

  it('services that arrive late are bound within a second, once', () => {
    const s = fullServices();
    const { f: ctx } = boot({});
    expect(s.calls).toEqual([]);
    Object.assign(ctx.services, s.services);
    ctx.tick(61);
    ctx.tick(61);
    expect(s.calls.filter((c) => c.startsWith('attack:'))).toHaveLength(1);
    expect(s.calls.filter((c) => c.startsWith('kit:'))).toHaveLength(1);
    expect(s.handlers.size).toBe(3);
  });

  it('a refused attack set is not fatal: the class keeps the Knight set and the rest still registers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = fullServices();
    s.services.combatVerbs = { registerAttackSet: () => ({ ok: false, reason: 'duplicate' }) } as never;
    boot(s.services);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('attack set refused'));
    expect(s.calls).toContain('kit:emberwright');
    warn.mockRestore();
  });

  it('the ability handler casts only for the Emberwright', () => {
    const s = fullServices();
    boot(s.services);
    const handler = s.handlers.get(SKILL.warmBreath)!;
    (s.services.progression as { classId: string }).classId = 'knight';
    expect(handler()).toEqual({ ok: false, reason: 'class' });
  });

  it('the attack set the plugin registers is the playable one', () => {
    let seen: unknown;
    const s = fullServices();
    s.services.combatVerbs = { registerAttackSet: (_id: string, set: unknown) => ((seen = set), { ok: true }) } as never;
    boot(s.services);
    expect(seen).toBe(EMBERWRIGHT_ATTACK_SET);
  });
});
