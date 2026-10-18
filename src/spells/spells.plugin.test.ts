import { describe, expect, it, vi } from 'vitest';
import { BURN } from '../vfx/tuning';
import plugin from './spells.plugin';
import { makeCtx } from './testHost';

describe('spells plugin', () => {
  it('declares id and dependencies', () => {
    expect(plugin.id).toBe('spells');
    expect(plugin.dependsOn).toEqual(['core']);
  });

  it('provides the service, systems and persistables, and removes them on dispose', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    expect(s).toBeDefined();
    expect(s.ember).toBe(100);
    expect(s.maxEmber).toBe(100);
    expect(s.def('heartshard-surge')?.id).toBe('heartshard-surge');
    expect(f.systems.map((x) => `${x.id}:${x.fixedPhase}:${x.order}`).sort()).toEqual(['spells-input:intent:100', 'spells-update:afterCombat:100']);
    expect([...f.persisted.keys()].sort()).toEqual(['burn', 'ember']);
    plugin.dispose!();
    expect(f.services.spells).toBeUndefined();
    expect(f.systems).toHaveLength(0);
    expect(f.persisted.size).toBe(0);
    expect(f.world.events.count()).toBe(0);
  });

  it('rest clears burn and emits burn.changed', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.services.spells!.addBurn(30, 't');
    f.world.events.emit('rest', { waystoneId: 'w' });
    expect(f.services.spells!.burn).toBe(0);
    expect(f.world.events.log.filter((l) => l.type === 'burn.changed').map((l) => l.payload)).toEqual([
      { value: 30, previous: 0 },
      { value: 0, previous: 30 },
    ]);
    plugin.dispose!();
  });

  it('rekindle adds burn only for cause player', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.world.events.emit('waystone.rekindled', { waystoneId: 'w', cause: 'load' });
    expect(f.services.spells!.burn).toBe(0);
    f.world.events.emit('waystone.rekindled', { waystoneId: 'w' });
    expect(f.services.spells!.burn).toBe(0);
    f.world.events.emit('waystone.rekindled', { waystoneId: 'w', cause: 'player' });
    expect(f.services.spells!.burn).toBe(BURN.rekindleGain);
    plugin.dispose!();
  });

  it('decays out of combat, stops during the combat window, and not while the sim is not ticking', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    s.addBurn(50, 't');
    f.tick(60 * 5);
    expect(s.burn).toBeCloseTo(49, 1);
    // combat: damage involving the player
    f.world.events.emit('damage.dealt', { attackerId: 'player', targetId: 'x' } as never);
    const before = s.burn;
    f.tick(60 * 5);
    expect(s.burn).toBe(before);
    f.tick(60 * 2); // past the 6 s hysteresis
    expect(s.burn).toBeLessThan(before);
    // aggro keeps combat alive until calm
    f.world.events.emit('ai.aggro', { actorId: 'orc', targetId: 'player' });
    const b2 = s.burn;
    f.tick(60 * 20);
    expect(s.burn).toBe(b2);
    f.world.events.emit('ai.calm', { actorId: 'orc' });
    f.tick(60 * 7);
    expect(s.burn).toBeLessThan(b2);
    // paused: no fixed updates, nothing moves, even with wall time passing
    const b3 = s.burn;
    f.world.clock.seconds += 1000;
    expect(s.burn).toBe(b3);
    plugin.dispose!();
  });

  it('damage not involving the player does not count as combat', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.services.spells!.addBurn(50, 't');
    f.world.events.emit('damage.dealt', { attackerId: 'a', targetId: 'b' } as never);
    f.tick(60);
    expect(f.services.spells!.burn).toBeLessThan(50);
    plugin.dispose!();
  });

  it('input casts the Surge via the intent system and Ember regenerates', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.pressed.add('surge');
    f.tick(1);
    f.pressed.clear();
    expect(f.services.spells!.ember).toBe(60);
    f.tick(60 * 3);
    expect(f.world.player.modifiers.size).toBe(0);
    expect(f.services.spells!.burn).toBeCloseTo(25, 0);
    expect(f.services.spells!.cooldown('heartshard-surge')).toBeGreaterThan(0);
    expect(f.services.spells!.cast('heartshard-surge')).toEqual({ ok: false, reason: 'cooldown' });
    f.tick(60 * 10);
    expect(f.services.spells!.ember).toBeGreaterThan(60);
    plugin.dispose!();
  });

  it('a stale rest does not cancel the next cast, a rest during a cast does', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.world.events.emit('rest', { waystoneId: 'w' });
    expect(f.services.spells!.cast('heartshard-surge').ok).toBe(true);
    f.tick(5);
    expect(f.world.player.modifiers.size).toBe(1);
    f.world.events.emit('rest', { waystoneId: 'w' });
    f.tick(1);
    expect(f.world.player.modifiers.size).toBe(0);
    expect(f.services.spells!.ember).toBe(100);
    plugin.dispose!();
  });

  it('dialogue blocks casting', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.world.events.emit('dialogue.started', { dialogueId: 'd', npcId: 'n' });
    expect(f.services.spells!.cast('heartshard-surge')).toEqual({ ok: false, reason: 'blocked' });
    f.world.events.emit('dialogue.ended', { dialogueId: 'd', npcId: 'n' });
    expect(f.services.spells!.cast('heartshard-surge').ok).toBe(true);
    plugin.dispose!();
  });

  it('persists and loads burn and ember', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.services.spells!.addBurn(42, 't');
    f.services.spells!.spendEmber(30);
    const saved = [f.persisted.get('burn')!.serialize(), f.persisted.get('ember')!.serialize()];
    f.services.spells!.clearBurn('x');
    f.persisted.get('burn')!.load(saved[0], 1);
    f.persisted.get('ember')!.load(saved[1], 1);
    expect(f.services.spells!.burn).toBe(42);
    expect(f.services.spells!.ember).toBe(70);
    plugin.dispose!();
  });

  it('registers the max-health modifier and binds progression/abilities that appear later', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const remove = vi.fn();
    const addMaxHealthModifier = vi.fn((_id: string, _fn: (b: number) => number) => remove);
    const registerHandler = vi.fn(() => () => undefined);
    f.services.progression = { addMaxHealthModifier, learned: () => false };
    f.services.abilities = { registerHandler, reportTrigger: vi.fn() };
    f.tick(30);
    expect(addMaxHealthModifier).not.toHaveBeenCalled();
    f.tick(40);
    expect(addMaxHealthModifier).toHaveBeenCalledTimes(1);
    expect(registerHandler).toHaveBeenCalledTimes(1);
    f.tick(200);
    expect(addMaxHealthModifier).toHaveBeenCalledTimes(1);
    f.services.spells!.addBurn(90, 't');
    expect(addMaxHealthModifier.mock.calls[0][1](100)).toBe(100); // penalty deferred
    plugin.dispose!();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('registers the modifier immediately when progression exists at setup', () => {
    const addMaxHealthModifier = vi.fn(() => () => undefined);
    const f = makeCtx({ progression: { addMaxHealthModifier, learned: () => false } });
    plugin.setup(f.ctx);
    expect(addMaxHealthModifier).toHaveBeenCalledWith('burn', expect.any(Function));
    plugin.dispose!();
  });

  it('dispose mid-cast removes the movement modifier', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.services.spells!.cast('heartshard-surge');
    expect(f.world.player.modifiers.size).toBe(1);
    plugin.dispose!();
    expect(f.world.player.modifiers.size).toBe(0);
  });
});
