import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpellCaster } from './SpellCaster';
import { TEST_SPELLS } from './spellDefs';
import { SPELL_LOCK_ACTIONS } from './tuning';
import { FakePlayer, makeWorld, type World } from './testHost';

const bolt = TEST_SPELLS['test-bolt'];
const DT = 1 / 60;
// Spellcast_Long: duration 2.533, release 0.54 -> 1.368 s -> tick 83 (82.08)
const RELEASE_TICKS = Math.ceil((2.533 * 0.54) / DT - 1e-9);

let w: World;
let caster: SpellCaster;
let onRelease: ReturnType<typeof vi.fn>;
beforeEach(() => {
  w = makeWorld();
  caster = new SpellCaster(w.host);
  onRelease = vi.fn();
  caster.register(bolt, onRelease);
});
const ticks = (n: number) => { for (let i = 0; i < n; i++) caster.update(DT); };

describe('SpellCaster', () => {
  it('success path: cast -> clip -> released at the right tick', () => {
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: true });
    expect(caster.state).toBe('casting');
    expect(w.ember.value).toBe(90);
    expect(w.player.modifiers.size).toBe(1);
    expect([...w.player.modifiers.values()][0].mod.lockMove).toBe(true);
    ticks(RELEASE_TICKS - 1);
    expect(onRelease).not.toHaveBeenCalled();
    ticks(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(caster.state).toBe('recovering');
    expect(w.events.types().filter((t) => ['spell.cast', 'clip', 'spell.released'].includes(t))).toEqual(['clip', 'spell.cast', 'spell.released']);
    expect(caster.cooldown('test-bolt')).toBeGreaterThan(0.9);
    ticks(200);
    expect(caster.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(w.host.clips).toEqual(['Spellcast_Long']);
  });
  it('unknown spell', () => {
    expect(caster.cast('player', 'nope')).toEqual({ ok: false, reason: 'unknown' });
  });
  it('insufficient ember leaves ember untouched', () => {
    w.ember.spend(95);
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'ember' });
    expect(w.ember.value).toBe(5);
    expect(w.player.modifiers.size).toBe(0);
    expect(w.events.types()).not.toContain('spell.cast');
  });
  it('cooldown', () => {
    caster.cast('player', 'test-bolt');
    ticks(300);
    expect(caster.cooldown('test-bolt')).toBe(0); // 1 s cooldown has passed
    caster.cast('player', 'test-bolt');
    ticks(RELEASE_TICKS);
    ticks(200);
    // cooldown ran 1 s from release; wait fewer ticks than that at a fresh cast
    const w2 = makeWorld();
    const c2 = new SpellCaster(w2.host);
    c2.register({ ...bolt, cooldown: 10 }, () => undefined);
    c2.cast('player', 'test-bolt');
    for (let i = 0; i < 200; i++) c2.update(DT);
    expect(c2.state).toBe('idle');
    expect(c2.canCast('player', 'test-bolt')).toEqual({ ok: false, reason: 'cooldown' });
    expect(c2.cooldown('test-bolt')).toBeGreaterThan(5);
  });
  it('staggered caster refused with no side effects', () => {
    w.host.staggered = true;
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'staggered' });
    expect(w.ember.value).toBe(100);
    expect(w.player.modifiers.size).toBe(0);
    expect(w.events.log).toHaveLength(0);
  });
  it('busy second cast and host busy', () => {
    caster.cast('player', 'test-bolt');
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'busy' });
    expect(w.ember.value).toBe(90);
    caster.cancel('x');
    w.host.busy = true;
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'busy' });
  });
  it('inputBlocked', () => {
    w.host.blocked = true;
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'blocked' });
    expect(w.ember.value).toBe(100);
  });
  it('dead caster refused', () => {
    w.actors.player.kill();
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'dead' });
    expect(caster.cast('ghost', 'test-bolt')).toEqual({ ok: false, reason: 'dead' });
  });
  it('stagger before release cancels, refunds, no onRelease', () => {
    caster.cast('player', 'test-bolt');
    ticks(10);
    w.events.emit('actor.staggered', { actorId: 'player', byId: null });
    expect(caster.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
    expect(w.ember.value).toBe(100);
    expect(onRelease).not.toHaveBeenCalled();
    expect(w.events.log.at(-1)).toEqual({ type: 'spell.cancelled', payload: { casterId: 'player', spellId: 'test-bolt', reason: 'staggered' } });
    ticks(300);
    expect(onRelease).not.toHaveBeenCalled();
    expect(caster.cooldown('test-bolt')).toBe(0);
  });
  it('stagger of someone else does not cancel', () => {
    caster.cast('player', 'test-bolt');
    w.events.emit('actor.staggered', { actorId: 'orc', byId: null });
    expect(caster.state).toBe('casting');
  });
  it('stagger after release keeps the effect, no refund', () => {
    caster.cast('player', 'test-bolt');
    ticks(RELEASE_TICKS + 3);
    w.events.emit('actor.staggered', { actorId: 'player', byId: null });
    expect(caster.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
    expect(w.ember.value).toBe(90);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(caster.cooldown('test-bolt')).toBeGreaterThan(0);
  });
  it('death mid-cast', () => {
    caster.cast('player', 'test-bolt');
    ticks(5);
    w.actors.player.kill();
    ticks(1);
    expect(caster.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
    expect(w.ember.value).toBe(100);
    expect(onRelease).not.toHaveBeenCalled();
  });
  it('died event cancels', () => {
    caster.cast('player', 'test-bolt');
    w.events.emit('actor.died', { actorId: 'player', killerId: null });
    expect(caster.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
  });
  it('cancelRequested cancels with its reason', () => {
    caster.cast('player', 'test-bolt');
    w.host.cancelReason = 'rest';
    ticks(1);
    expect(caster.state).toBe('idle');
    expect(w.events.log.at(-1)?.payload).toMatchObject({ reason: 'rest' });
    expect(w.ember.value).toBe(100);
  });
  it('playClip false refunds and reports busy', () => {
    w.host.clipResult = false;
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'busy' });
    expect(w.ember.value).toBe(100);
    expect(w.player.modifiers.size).toBe(0);
    expect(caster.state).toBe('idle');
    expect(caster.cooldown('test-bolt')).toBe(0);
  });
  it('explicit cancel while idle is a no-op; update ignores bad dt', () => {
    caster.cancel('x');
    caster.cast('player', 'test-bolt');
    caster.update(NaN);
    caster.update(-1);
    ticks(RELEASE_TICKS - 1);
    expect(onRelease).not.toHaveBeenCalled();
    expect(w.events.types()).not.toContain('spell.cancelled');
  });
  it('a throwing onRelease still ends the cast cleanly', () => {
    const c = new SpellCaster(w.host);
    c.register(bolt, () => { throw new Error('boom'); });
    c.cast('player', 'test-bolt');
    expect(() => { for (let i = 0; i < RELEASE_TICKS; i++) c.update(DT); }).toThrow('boom');
    for (let i = 0; i < 300; i++) c.update(DT);
    expect(c.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
  });
  it('unregister removes the spell', () => {
    const c = new SpellCaster(w.host);
    const off = c.register(bolt, () => undefined);
    off();
    expect(c.def('test-bolt')).toBeUndefined();
    expect(caster.def('test-bolt')).toBe(bolt);
  });
  it('modifier never leaks over 200 randomised sequences', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let run = 0; run < 200; run++) {
      const ww = makeWorld();
      const c = new SpellCaster(ww.host);
      c.register(bolt, () => undefined);
      for (let step = 0; step < 40; step++) {
        const r = rnd();
        if (r < 0.25) c.cast('player', 'test-bolt');
        else if (r < 0.35) c.cancel('rand');
        else if (r < 0.42) ww.events.emit('actor.staggered', { actorId: 'player', byId: null });
        else if (r < 0.46) ww.host.cancelReason = 'rest';
        else if (r < 0.5) ww.host.clipResult = !ww.host.clipResult;
        else if (r < 0.53) ww.events.emit('actor.died', { actorId: 'player', killerId: null });
        else for (let i = 0, n = Math.floor(rnd() * 40); i < n; i++) c.update(DT);
        expect(ww.player.modifiers.size).toBe(c.state === 'idle' ? 0 : 1);
      }
      c.cancel('end');
      expect(ww.player.modifiers.size).toBe(0);
      expect(ww.ember.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('lock actions are real action ids (copy of contracts/input-and-hud.md section 1) and are passed exactly', () => {
    const CONTRACT_ACTIONS = [
      'moveForward', 'moveBack', 'moveLeft', 'moveRight', 'sprint', 'jump', 'interact', 'mercy',
      'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'lockOn', 'surge', 'surgeLeap', 'sneak', 'mount',
      'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
      'inventory', 'skills', 'journal', 'map', 'menu',
      'dialogueNext', 'dialogueChoice1', 'dialogueChoice2', 'dialogueChoice3', 'dialogueChoice4',
    ];
    for (const a of SPELL_LOCK_ACTIONS) expect(CONTRACT_ACTIONS).toContain(a);
    expect(SPELL_LOCK_ACTIONS).toEqual([
      'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'jump', 'surge', 'interact',
      'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
    ]);
    expect(SPELL_LOCK_ACTIONS).not.toContain('lockOn');
    caster.cast('player', 'test-bolt');
    expect([...w.player.modifiers.values()][0].mod.lockActions).toEqual([...SPELL_LOCK_ACTIONS]);
  });
  it('a throwing addMoveModifier refuses with busy, leaves nothing active, refunds and emits nothing', () => {
    w.player.addMoveModifier = () => { throw new Error('modifier'); };
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'busy' });
    expect(caster.state).toBe('idle');
    expect(w.ember.value).toBe(100);
    expect(w.host.clips).toEqual([]);
    expect(w.events.types()).not.toContain('spell.cast');
    expect(caster.cooldown('test-bolt')).toBe(0);
    w.player.addMoveModifier = FakePlayer.prototype.addMoveModifier;
  });
  it('a throwing playClip refuses with busy, releases the modifier and emits nothing', () => {
    w.host.playClip = () => { throw new Error('clip'); };
    expect(caster.cast('player', 'test-bolt')).toEqual({ ok: false, reason: 'busy' });
    expect(caster.state).toBe('idle');
    expect(w.player.modifiers.size).toBe(0);
    expect(w.ember.value).toBe(100);
    expect(w.events.types()).not.toContain('spell.cast');
  });
  it('spell.cast is emitted after the clip started', () => {
    caster.cast('player', 'test-bolt');
    expect(w.events.types().indexOf('clip')).toBeLessThan(w.events.types().indexOf('spell.cast'));
  });
});
