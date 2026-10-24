import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeCore } from '../../region/testing/fakeCore';
import { GREYFEN_CODEX, GREYFEN_CODEX_SIGHT } from './codex';
import plugin, { FEN_FIRE_ORDER, GREYFEN_KILL_XP_FACTOR } from './fen.plugin';
import { FireDedupe, fenPoise, isFireHit } from './fire';
import { GREYFEN_FAUNA_GROUPS, GREYFEN_FAUNA_LAYOUT } from './greyfenFauna.layout';
import { registeredPeatPatches } from './peat';
import { FEN_TUNING } from './tuning';

type Enemy = { id: string; def: { kind: string }; active: boolean; feet: { x: number; z: number } };

/** The fake core plus the services the fen plugin reads: the enemies' ground list, the region factor and a codex. */
function setup(opts: { factor?: boolean; codex?: boolean } = {}) {
  const fc = createFakeCore();
  const enemies: Enemy[] = [];
  fc.services.set('enemies', { ground: { all: () => enemies, get: (id: string) => enemies.find((e) => e.id === id) } });
  const factors = new Map<string, number>();
  if (opts.factor ?? true) {
    fc.services.set('killXpRegionFactor', {
      set(region: string, f: number) {
        factors.set(region, f);
        return () => factors.delete(region);
      },
      factor: (r: string | null) => (r ? (factors.get(r) ?? 1) : 1),
    });
  }
  const unlocked: string[] = [];
  const registered: unknown[][] = [];
  if (opts.codex ?? true) {
    fc.services.set('codex', {
      register(entries: unknown[]) {
        registered.push(entries);
        return () => registered.splice(registered.indexOf(entries), 1);
      },
      unlock: (id: string) => void unlocked.push(id),
    });
  }
  const live = new Map<string, { id: string; dead: boolean; poise: number }>();
  (fc.ctx.actors as unknown as { get(id: string): unknown }).get = (id: string) => live.get(id);
  const applied: Array<Record<string, unknown>> = [];
  (fc.ctx.damage as unknown as { apply(r: Record<string, unknown>): void }).apply = (r) => void applied.push(r);
  const add = (id: string, kind: string, x = 0, z = 0, poise = 30) => {
    enemies.push({ id, def: { kind }, active: true, feet: { x, z } });
    live.set(id, { id, dead: false, poise });
  };
  const modifier = () => fc.modifiers.get('fen.fire')!;
  const hit = (targetId: string, req: Record<string, unknown>, attackerTeam = 'player') => {
    const r = { outcome: 'hit', kind: 'melee', amount: 10, poise: 10, ...req };
    modifier()(r, { id: targetId, poise: live.get(targetId)?.poise ?? 0 }, { team: attackerTeam });
    return r as { poise: number };
  };
  return { fc, enemies, factors, unlocked, registered, applied, add, hit };
}

afterEach(() => {
  plugin.dispose?.();
});

describe('fen-creatures plugin', () => {
  it('defines every fauna anchor, a peat patch per shambler bog, the region factor and the strings', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    expect(s.fc.anchors.size).toBe(GREYFEN_FAUNA_LAYOUT.anchors.length);
    const bogs = GREYFEN_FAUNA_GROUPS.filter((g) => g.kind === 'shambler').map((g) => `greyfen.${g.id}`);
    expect(registeredPeatPatches().map((p) => p.id).sort()).toEqual([...bogs].sort());
    expect(s.factors.get('greyfen')).toBe(GREYFEN_KILL_XP_FACTOR);
    expect(s.fc.strings.get('enemies.fen.drag')).toBe('Hold {key}: Drag out');
    expect(s.registered).toHaveLength(1);
    expect(s.registered[0]).toBe(GREYFEN_CODEX);
  });

  it('dispose undoes all of it', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    plugin.dispose?.();
    expect(s.fc.anchors.size).toBe(0);
    expect(registeredPeatPatches()).toEqual([]);
    expect(s.factors.has('greyfen')).toBe(false);
    expect(s.fc.strings.get('enemies.fen.drag')).toBeUndefined();
    expect(s.registered).toHaveLength(0);
    expect(s.fc.modifiers.has('fen.fire')).toBe(false);
  });

  it('with no factor service it warns and still sets up', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup({ factor: false });
    plugin.setup(s.fc.ctx);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('killXpRegionFactor'));
    expect(s.fc.anchors.size).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('binds the codex late when it sets up after this plugin, and unlocks on first sight within range', () => {
    const s = setup({ codex: false });
    plugin.setup(s.fc.ctx);
    s.add('leech#1', 'fen-leech', 0, GREYFEN_CODEX_SIGHT + 5);
    const unlocked: string[] = [];
    const registered: unknown[] = [];
    s.fc.services.set('codex', { register: (e: unknown[]) => (registered.push(e), () => {}), unlock: (id: string) => void unlocked.push(id) });
    s.fc.tick('afterCombat', 0.6);
    expect(registered).toHaveLength(1);
    expect(unlocked).toEqual([]);
    s.enemies[0]!.feet.z = GREYFEN_CODEX_SIGHT - 1;
    s.fc.tick('afterCombat', 0.6);
    expect(unlocked).toEqual(['fen-leech']);
  });
});

describe('the fire rule', () => {
  it('isFireHit: fire element, Emberwright spells and the Surge; never a status tick', () => {
    expect(isFireHit({ kind: 'spell', element: 'fire' })).toBe(true);
    expect(isFireHit({ kind: 'spell', attackId: 'emberwright.bolt' })).toBe(true);
    expect(isFireHit({ kind: 'spell', attackId: 'heartshard-surge' })).toBe(true);
    expect(isFireHit({ kind: 'melee', attackId: 'knight.light1' })).toBe(false);
    expect(isFireHit({ kind: 'status', element: 'fire' })).toBe(false);
  });

  it('fenPoise: a leech breaks on fire or a heavy blow; a shambler loses 50 more to fire; others untouched', () => {
    expect(fenPoise('fen-leech', { kind: 'spell', poise: 5 }, 30, true)).toBe(30);
    expect(fenPoise('fen-leech', { kind: 'melee', poise: 5 }, 30, false)).toBe(5);
    expect(fenPoise('peat-shambler', { kind: 'spell', poise: 5 }, 150, true)).toBe(5 + FEN_TUNING.shambler.firePoise);
    expect(fenPoise('peat-shambler', { kind: 'melee', poise: 5 }, 150, false)).toBe(5);
  });

  it('the modifier breaks a leech on a fire hit and adds 50 to a shambler, player and ally attackers only', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    s.add('leech#1', 'fen-leech', 0, 0, 20);
    s.add('sham#1', 'peat-shambler', 0, 0, 150);
    s.add('wraith#1', 'ash-wraith', 0, 0, 20);
    expect(s.hit('leech#1', { kind: 'spell', attackId: 'emberwright.bolt', poise: 2 }).poise).toBe(20);
    expect(s.hit('sham#1', { kind: 'spell', element: 'fire', poise: 2 }).poise).toBe(52);
    expect(s.hit('wraith#1', { kind: 'spell', element: 'fire', poise: 2 }).poise).toBe(2);
    expect(s.hit('sham#1', { kind: 'spell', element: 'fire', poise: 2 }, 'hostile').poise).toBe(2);
    expect(s.hit('sham#1', { kind: 'status', element: 'fire', poise: 2 }).poise).toBe(2);
    expect(s.hit('sham#1', { kind: 'spell', element: 'fire', poise: 2, outcome: 'blocked' }).poise).toBe(2);
    expect(FEN_FIRE_ORDER).toBeGreaterThan(0);
  });

  it('a bolt that also ignites counts once; a landed ignite alone counts as a fire hit', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    s.add('sham#1', 'peat-shambler', 0, 0, 150);
    s.add('sham#2', 'peat-shambler', 0, 0, 150);
    s.hit('sham#1', { kind: 'spell', element: 'fire', poise: 2 });
    s.fc.fire('status.applied', { actorId: 'sham#1', id: 'ignite', kind: 'ignite' });
    expect(s.applied).toHaveLength(0);
    s.fc.fire('status.applied', { actorId: 'sham#2', id: 'ignite', kind: 'ignite' });
    expect(s.applied).toEqual([expect.objectContaining({ targetId: 'sham#2', poise: FEN_TUNING.shambler.firePoise, kind: 'script', amount: 0 })]);
    // After the window the next fire hit counts again.
    s.fc.tick('afterCombat', FEN_TUNING.fireDedupeSeconds + 0.1);
    expect(s.hit('sham#1', { kind: 'spell', element: 'fire', poise: 2 }).poise).toBe(52);
  });

  it('a heavy chop breaks a leech with no fire at all', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    s.add('leech#1', 'fen-leech', 0, 0, 20);
    expect(s.hit('leech#1', { kind: 'melee', attackId: '1H_Melee_Attack_Chop', poise: 3 }).poise).toBe(20);
    expect(s.hit('leech#1', { kind: 'melee', attackId: '1H_Melee_Attack_Slice_Diagonal', poise: 3 }).poise).toBe(3);
  });

  it('FireDedupe forgets on despawn and clears on load', () => {
    const d = new FireDedupe();
    expect(d.take('a')).toBe(true);
    expect(d.take('a')).toBe(false);
    d.forget('a');
    expect(d.take('a')).toBe(true);
    d.clear();
    expect(d.take('a')).toBe(true);
  });
});
