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
    f.world.events.emit('waystone.rekindled', { waystoneId: 'w', cause: 'script' });
    expect(f.services.spells!.burn).toBe(0);
    f.world.events.emit('waystone.rekindled', { waystoneId: 'w' } as never);
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
    const registerHandler = vi.fn(() => ({ ok: true as const, dispose: () => undefined }));
    f.services.progression = { addMaxHealthModifier, learned: () => false };
    f.services.abilities = { registerHandler } as never;
    f.tick(30);
    expect(addMaxHealthModifier).not.toHaveBeenCalled();
    f.tick(40);
    expect(addMaxHealthModifier).toHaveBeenCalledTimes(1);
    expect(registerHandler).toHaveBeenCalledTimes(2); // Rally Cry and Banner Plant
    f.tick(200);
    expect(addMaxHealthModifier).toHaveBeenCalledTimes(1);
    f.services.spells!.addBurn(90, 't');
    expect((addMaxHealthModifier.mock.calls[0] as unknown as [string, () => number])[1]()).toBeCloseTo(0.636, 3); // Burn 90: cinder zone, 36.4% lost
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
    const f = makeCtx({ abilities: { registerHandler: (id: string, h: never) => { if (id === 'knight.rallyCry') handler = h; return { ok: true, dispose: off }; } } as never });
    plugin.setup(f.ctx);
    expect(handler!({ skillId: 'knight.rallyCry', slot: 0, caster: f.world.actors.player, ctx: f.ctx })).toEqual({ ok: true });
    expect(f.services.spells!.ember).toBe(100);
    f.tick(60 * 3);
    expect(f.services.spells!.cooldown('rally-cry')).toBe(0);
    expect(f.services.spells!.cast('rally-cry').ok).toBe(true);
    plugin.dispose!();
    expect(off).toHaveBeenCalledTimes(2); // Rally Cry and Banner Plant
  });

  it('a throwing registerHandler is logged once across retries', () => {
    const registerHandler = vi.fn(() => { throw new Error('already registered'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = makeCtx({ abilities: { registerHandler } as never });
    plugin.setup(f.ctx);
    f.tick(60 * 5);
    expect(registerHandler).toHaveBeenCalledTimes(2); // Rally Cry and Banner Plant, once each
    expect(warn).toHaveBeenCalledTimes(2);
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

describe('shard use, Scars and the Leap (slice 2)', () => {
  const scarEvents = (f: ReturnType<typeof makeCtx>) => f.world.events.log.filter((l) => l.type === 'scar.added').map((l) => l.payload);
  const progression = () => {
    const refresh = vi.fn();
    return { refresh, svc: { addMaxHealthModifier: () => () => undefined, learned: () => false, refreshMaxHealth: refresh, classId: null as string | null } };
  };

  it('useShard adds the gain and scars only from Burn 75: event, flag, max-health refresh', () => {
    const p = progression();
    const f = makeCtx({ progression: p.svc });
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    s.addBurn(74, 't');
    expect(s.useShard(8, 'test')).toEqual({ gained: 8, scarred: false });
    expect(scarEvents(f)).toEqual([]);
    expect(f.state.flags.has('story.f10.scars')).toBe(false);
    expect(s.useShard(8, 'test')).toMatchObject({ scarred: true });
    expect(s.scars).toBe(1);
    expect(scarEvents(f)).toEqual([{ total: 1, source: 'test' }]);
    expect(f.state.flags.get('story.f10.scars')).toBe(1);
    expect(p.refresh).toHaveBeenCalled();
    plugin.dispose!();
  });

  it('a Scar at Burn 100 (no burn.changed) still refreshes max health', () => {
    const p = progression();
    const f = makeCtx({ progression: p.svc });
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    s.addBurn(100, 't');
    p.refresh.mockClear();
    f.world.events.log.length = 0;
    s.useShard(25, 'surge');
    expect(f.world.events.types()).not.toContain('burn.changed');
    expect(p.refresh).toHaveBeenCalledTimes(1);
    expect(s.scars).toBe(1);
    plugin.dispose!();
  });

  it('addBurn never scars', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    s.addBurn(90, 'boss');
    s.addBurn(20, 'boss');
    expect(s.scars).toBe(0);
    plugin.dispose!();
  });

  it('a Surge cast at Burn 75 or more scars once; below it does not', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    s.addBurn(74, 't');
    s.cast('heartshard-surge');
    f.tick(60 * 3);
    expect(s.scars).toBe(0);
    expect(s.burn).toBeGreaterThan(95);
    f.tick(60 * 7); // out of the cooldown
    s.cast('heartshard-surge');
    f.tick(60 * 3);
    expect(s.scars).toBe(1);
    plugin.dispose!();
  });

  it('a player rekindle gives exactly +10 Burn; a script rekindle gives 0; at 75 or more it scars', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    f.world.events.emit('waystone.rekindled', { waystoneId: 'quenchstone', cause: 'player' });
    expect(s.burn).toBe(10);
    f.world.events.emit('waystone.rekindled', { waystoneId: 'quenchstone', cause: 'script' });
    expect(s.burn).toBe(10);
    expect(s.scars).toBe(0);
    s.addBurn(70, 't');
    f.world.events.emit('waystone.rekindled', { waystoneId: 'quenchstone', cause: 'player' });
    expect(s.scars).toBe(1);
    plugin.dispose!();
  });

  it('save.loaded re-writes the Scar flag from the loaded count', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    f.persisted.get('burn')!.load({ burn: 10, scars: 4 }, 1);
    f.world.events.emit('save.loaded', {} as never);
    expect(f.state.flags.get('story.f10.scars')).toBe(4);
    plugin.dispose!();
  });

  it('a registered class Surge form is used for that class and the Knight form otherwise', () => {
    const p = progression();
    const f = makeCtx({ progression: p.svc });
    plugin.setup(f.ctx);
    const s = f.services.spells!;
    const impl = vi.fn();
    expect(s.registerSurgeForm('warden', 'warm', impl).ok).toBe(true);
    expect(s.registerSurgeForm('warden', 'warm', impl)).toEqual({ ok: false, reason: 'duplicate' });
    p.svc.classId = 'warden';
    s.cast('heartshard-surge');
    f.tick(60 * 3);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(impl.mock.calls[0][0]).toMatchObject({ zone: 'warm', radius: 6 });
    plugin.dispose!();
  });

  describe('the Leap', () => {
    const grant = (f: ReturnType<typeof makeCtx>) => f.state.setFlag('ability.surge-leap.learned', true);
    const press = (f: ReturnType<typeof makeCtx>) => {
      f.pressed.add('surgeLeap');
      f.tick(1);
      f.pressed.delete('surgeLeap');
    };

    it('does nothing before M03 grants it', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      press(f);
      expect(f.world.player.leaps).toHaveLength(0);
      expect(f.services.spells!.leap.learned).toBe(false);
      plugin.dispose!();
    });

    it('asks core for a 6 m leap, charges 8 Burn at takeoff and starts the 4 s cooldown', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      grant(f);
      press(f);
      expect(f.world.player.leaps).toEqual([{ distance: 6, apex: expect.any(Number) }]);
      expect(f.services.spells!.burn).toBe(0);
      f.world.player.feet.y = 0.5;
      f.tick(1);
      expect(f.services.spells!.burn).toBeCloseTo(8, 1);
      const cd = f.services.spells!.leap.cooldown();
      expect(cd.total).toBe(4);
      expect(cd.remaining).toBeGreaterThan(3.8);
      f.tick(60 * 4);
      expect(f.services.spells!.leap.cooldown().remaining).toBeCloseTo(0, 5);
      plugin.dispose!();
    });

    describe('effects', () => {
      const withVfx = () => {
        const trail = { stop: vi.fn(), alive: true };
        const spawnEffect = vi.fn((id: string) => (id === 'leap-trail' ? trail : { stop: vi.fn(), alive: false }));
        const vfx = { spawnEffect, fovPunch: vi.fn(), pulseScreen: vi.fn() };
        const f = makeCtx({ vfx });
        plugin.setup(f.ctx);
        grant(f);
        press(f);
        f.world.player.feet.y = 0.5;
        f.tick(1);
        return { f, trail, ids: () => spawnEffect.mock.calls.map((c) => c[0]) };
      };

      it('launch spawns leap-dust, leap-shell and the leap-trail', () => {
        const { ids } = withVfx();
        expect(ids()).toEqual(expect.arrayContaining(['leap-dust', 'leap-shell', 'leap-trail']));
        expect(ids()).not.toContain('shockwave-ring');
        plugin.dispose!();
      });

      it('landing spawns leap-dust and stops the trail', () => {
        const { f, trail, ids } = withVfx();
        expect(trail.stop).not.toHaveBeenCalled();
        f.world.events.emit('player.leap', { phase: 'land', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 6 } });
        expect(trail.stop).toHaveBeenCalledTimes(1);
        expect(ids().filter((i) => i === 'leap-dust')).toHaveLength(2);
        plugin.dispose!();
      });

      it('a cancelled Leap stops the trail', () => {
        const { f, trail } = withVfx();
        f.world.events.emit('player.leap', { phase: 'cancel', from: { x: 0, y: 0, z: 0 } });
        expect(trail.stop).toHaveBeenCalledTimes(1);
        plugin.dispose!();
      });

      it('dispose stops a trail still running', () => {
        const { trail } = withVfx();
        plugin.dispose!();
        expect(trail.stop).toHaveBeenCalled();
      });

      it('rekindling the Quenchstone at Burn 95 scars through the one shard path and flashes the chest (thread 7 seam)', () => {
        const spawnEffect = vi.fn((_id: string) => ({ stop: vi.fn(), alive: false }));
        const f = makeCtx({ vfx: { spawnEffect, fovPunch: vi.fn(), pulseScreen: vi.fn() } });
        plugin.setup(f.ctx);
        const s = f.services.spells!;
        s.addBurn(95, 't');
        f.world.events.emit('waystone.rekindled', { waystoneId: 'quenchstone', cause: 'player' });
        expect(s.scars).toBe(1);
        expect(s.burn).toBe(100);
        expect(spawnEffect.mock.calls.map((c) => c[0])).toContain('scar-flash');
        plugin.dispose!();
      });

      it('a Scar spawns scar-flash', () => {
        const spawnEffect = vi.fn((_id: string) => ({ stop: vi.fn(), alive: false }));
        const f = makeCtx({ vfx: { spawnEffect, fovPunch: vi.fn(), pulseScreen: vi.fn() } });
        plugin.setup(f.ctx);
        f.services.spells!.addBurn(80, 't');
        f.services.spells!.useShard(8, 'test');
        expect(spawnEffect.mock.calls.map((c) => c[0])).toContain('scar-flash');
        plugin.dispose!();
      });
    });

    it('a Leap into a wall costs nothing', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      grant(f);
      press(f);
      f.world.player.leapHandle.active = false;
      f.world.events.emit('player.leap', { phase: 'cancel', from: { x: 0, y: 0, z: 0 } });
      f.tick(5);
      expect(f.services.spells!.burn).toBe(0);
      expect(f.services.spells!.leap.cooldown().remaining).toBe(0);
      plugin.dispose!();
    });

    it('scars at Burn 75 or more, decided at the press', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      grant(f);
      f.services.spells!.addBurn(80, 't');
      press(f);
      f.world.player.feet.y = 1;
      f.tick(1);
      expect(f.services.spells!.scars).toBe(1);
      plugin.dispose!();
    });

    it('is refused when the core refuses, while staggered, in a dialogue, mid-attack, mid-block and mid-cast', () => {
      const refusals: Array<[string, (f: ReturnType<typeof makeCtx>) => void]> = [
        ['core refuses', (f) => { f.world.player.leapResult = 'refuse'; }],
        ['staggered', (f) => { f.world.host.staggered = true; f.world.events.emit('actor.staggered', { actorId: 'player' } as never); }],
        ['dialogue', (f) => { f.world.events.emit('dialogue.started', { dialogueId: 'd', npcId: 'n' } as never); }],
        ['attacking', (f) => { (f.world.player as unknown as { avatar: unknown }).avatar = { controller: { activeAttack: () => ({ active: true }), busy: false, currentAction: null } }; }],
        ['blocking', (f) => { (f.world.player as unknown as { avatar: unknown }).avatar = { controller: { activeAttack: () => null, busy: false, currentAction: 'block' } }; }],
        ['dodging', (f) => { (f.world.player as unknown as { avatar: unknown }).avatar = { controller: { activeAttack: () => null, busy: false, currentAction: 'dodge' } }; }],
        ['casting', (f) => { f.services.spells!.cast('heartshard-surge'); f.tick(2); }],
      ];
      for (const [name, arrange] of refusals) {
        const f = makeCtx();
        plugin.setup(f.ctx);
        grant(f);
        arrange(f);
        const before = f.world.player.leaps.length;
        const burn = f.services.spells!.burn;
        press(f);
        f.world.player.feet.y = 1;
        f.tick(2);
        if (name === 'core refuses') {
          expect(f.world.player.leaps.length).toBe(before + 1);
        } else {
          expect(f.world.player.leaps.length, name).toBe(before);
        }
        expect(f.services.spells!.burn, name).toBeLessThanOrEqual(burn + 25); // only the casting case moves Burn (the Surge)
        expect(f.services.spells!.leap.cooldown().remaining, name).toBe(0);
        plugin.dispose!();
      }
    });

    it('a dead player cannot leap', () => {
      const f = makeCtx();
      plugin.setup(f.ctx);
      grant(f);
      f.world.actors.player.kill();
      press(f);
      expect(f.world.player.leaps).toHaveLength(0);
      plugin.dispose!();
    });
  });

  it('resting at Burn 100 ends at full health on the restored maximum', () => {
    const f = makeCtx();
    plugin.setup(f.ctx);
    const me = f.world.actors.player;
    // a stand-in for progression: the maximum shrinks with Burn and is re-read on burn.changed
    const refresh = () => { me.maxHealth = Math.round(120 * (1 - 0.4 * f.services.spells!.burn / 100)); me.health = Math.min(me.health, me.maxHealth); };
    f.world.events.on('burn.changed', refresh);
    f.services.spells!.addBurn(100, 't');
    expect(me.maxHealth).toBe(72);
    me.health = 72; // the waystone healed to the reduced maximum before `rest`
    f.world.events.emit('rest', { waystoneId: 'w' });
    expect(f.services.spells!.burn).toBe(0);
    expect(me.maxHealth).toBe(120);
    expect(me.health).toBe(120);
    plugin.dispose!();
  });
});
