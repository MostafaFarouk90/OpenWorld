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
    f.world.events.emit('damage.dealt', { attackerId: 'x', targetId: 'player' } as never);
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
    f.services.abilities = { registerHandler } as never;
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

  const modalOpen = (f: ReturnType<typeof makeCtx>, open: boolean) =>
    (f.world.events as unknown as { emit(t: string, p: unknown): void }).emit('ui.modal', { id: 'inventory', open });
  const emitLoose = (f: ReturnType<typeof makeCtx>, t: string, p: unknown) =>
    (f.world.events as unknown as { emit(t: string, p: unknown): void }).emit(t, p);

  it('ui.modal open mid-cast cancels and releases the modifier; close does not', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.services.spells!.cast('heartshard-surge');
    f.tick(2);
    modalOpen(f, false);
    f.tick(1);
    expect(f.world.player.modifiers.size).toBe(1);
    modalOpen(f, true);
    f.tick(1);
    expect(f.world.player.modifiers.size).toBe(0);
    expect(f.services.spells!.ember).toBe(100);
    expect(f.world.events.log.at(-1)?.payload).toMatchObject({ reason: 'modal' });
    plugin.dispose!();
  });

  it('a modal opened while idle is a stale cancel and does not kill the next cast', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    modalOpen(f, true);
    f.tick(2);
    expect(f.services.spells!.cast('heartshard-surge').ok).toBe(true);
    f.tick(5);
    expect(f.world.player.modifiers.size).toBe(1);
    plugin.dispose!();
  });

  it('save.loaded mid-cast cancels', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.services.spells!.cast('heartshard-surge');
    f.tick(2);
    f.world.events.emit('save.loaded', { slot: 'a' });
    f.tick(1);
    expect(f.world.player.modifiers.size).toBe(0);
    expect(f.world.events.log.at(-1)?.payload).toMatchObject({ reason: 'load' });
    plugin.dispose!();
  });

  it('dialogue.started and cutscene.started cancel a running cast', () => {
    for (const [type, payload] of [['dialogue.started', { dialogueId: 'd', npcId: 'n' }], ['cutscene.started', { cutsceneId: 'c' }]] as const) {
      const f = makeCtx();
      plugin.setup(f.ctx);
      f.services.spells!.cast('heartshard-surge');
      f.tick(2);
      emitLoose(f, type, payload);
      f.tick(1);
      expect(f.world.player.modifiers.size, type).toBe(0);
      expect(f.services.spells!.ember).toBe(100);
      plugin.dispose!();
    }
  });

  it('G and Q on the same tick: the second is busy', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    expect(f.services.spells!.cast('heartshard-surge').ok).toBe(true);
    expect(f.services.spells!.cast('rally-cry')).toEqual({ ok: false, reason: 'busy' });
    plugin.dispose!();
  });

  it('casting while the player is attacking is refused', () => {
    const f = makeCtx();
    (f.world.player as unknown as { avatar: unknown }).avatar = {
      controller: { activeAttack: () => ({ clip: 'x', active: true }), busy: false },
    };
    plugin.setup(f.ctx);
    expect(f.services.spells!.cast('heartshard-surge')).toEqual({ ok: false, reason: 'busy' });
    expect(f.services.spells!.ember).toBe(100);
    plugin.dispose!();
  });

  it('Rally through the abilities handler is free; direct cast stays free; no reportTrigger', () => {
    let handler: ((a: unknown) => unknown) | undefined;
    const off = vi.fn();
    const f = makeCtx({ abilities: { registerHandler: (_id: string, h: never) => { handler = h; return off; } } as never });
    plugin.setup(f.ctx);
    expect(handler!({ skillId: 'knight.rallyCry', slot: 0, caster: f.world.actors.player, ctx: f.ctx })).toEqual({ ok: true });
    expect(f.services.spells!.ember).toBe(100);
    f.tick(60 * 3);
    expect(f.services.spells!.cooldown('rally-cry')).toBe(0);
    expect(f.services.spells!.cast('rally-cry').ok).toBe(true);
    plugin.dispose!();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('a throwing registerHandler is logged once across retries', () => {
    const registerHandler = vi.fn(() => { throw new Error('already registered'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = makeCtx({ abilities: { registerHandler } as never });
    plugin.setup(f.ctx);
    f.tick(60 * 5);
    expect(registerHandler).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    plugin.dispose!();
    warn.mockRestore();
  });

  it('a failing setup leaves no listeners, systems, services or persistables', () => {
    const f = makeCtx();
    let n = 0;
    const real = f.ctx.persist.register;
    (f.ctx.persist as { register: unknown }).register = (p: never) => { if (++n === 2) throw new Error('persist'); return real(p); };
    expect(() => plugin.setup(f.ctx)).toThrow('persist');
    expect(f.world.events.count()).toBe(0);
    expect(f.systems).toHaveLength(0);
    expect(f.services.spells).toBeUndefined();
    expect(f.persisted.size).toBe(0);
    // a later good setup still works
    (f.ctx.persist as { register: unknown }).register = real;
    plugin.setup(f.ctx);
    expect(f.services.spells).toBeDefined();
    plugin.dispose!();
  });

  describe('burn combat definition', () => {
    const ticks = (f: ReturnType<typeof makeCtx>, sec: number) => f.tick(Math.round(sec * 60));
    it('aggro then calm blocks decay for 6 s, then decays', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      const s = f.services.spells!;
      s.addBurn(50, 't');
      f.world.events.emit('ai.aggro', { actorId: 'orc', targetId: 'player' });
      ticks(f, 10);
      expect(s.burn).toBe(50);
      f.world.events.emit('ai.calm', { actorId: 'orc' });
      ticks(f, 5.8);
      expect(s.burn).toBe(50);
      ticks(f, 1);
      expect(s.burn).toBeLessThan(50);
      plugin.dispose!();
    });
    it('aggro on someone else is ignored; died, despawned and mercy clear the set', () => {
      const clears: Array<[string, unknown]> = [
        ['actor.died', { actorId: 'orc', killerId: null }],
        ['actor.despawned', { actorId: 'orc' }],
        ['mercy', { actorId: 'orc' }],
      ];
      for (const [t, p] of clears) {
        const f = makeCtx();
        plugin.setup(f.ctx);
        const s = f.services.spells!;
        s.addBurn(50, 't');
        f.world.events.emit('ai.aggro', { actorId: 'other', targetId: 'ally1' });
        ticks(f, 1);
        expect(s.burn).toBeLessThan(50);
        s.addBurn(50, 't');
        f.world.events.emit('ai.aggro', { actorId: 'orc', targetId: 'player' });
        ticks(f, 20);
        const b = s.burn;
        emitLoose(f, t, p);
        ticks(f, 5.8);
        expect(s.burn, t).toBe(b);
        ticks(f, 1);
        expect(s.burn, t).toBeLessThan(b);
        plugin.dispose!();
      }
    });
    it('damage to the player refreshes the window; no events decays', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      const s = f.services.spells!;
      s.addBurn(50, 't');
      ticks(f, 1);
      expect(s.burn).toBeLessThan(50);
      const b = s.burn;
      f.world.events.emit('damage.dealt', { attackerId: 'orc', targetId: 'player' } as never);
      ticks(f, 4);
      f.world.events.emit('damage.dealt', { attackerId: 'orc', targetId: 'player' } as never);
      ticks(f, 5.8);
      expect(s.burn).toBe(b);
      ticks(f, 1);
      expect(s.burn).toBeLessThan(b);
      plugin.dispose!();
    });
    it('burn.changed fires at most once per displayed point while decaying', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      f.services.spells!.addBurn(50, 't');
      f.world.events.log.length = 0;
      ticks(f, 60);
      const n = f.world.events.log.filter((l) => l.type === 'burn.changed').length;
      expect(n).toBeLessThanOrEqual(Math.ceil(50 - f.services.spells!.burn) + 1);
      plugin.dispose!();
    });
  });
});
