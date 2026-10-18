import { describe, expect, it } from 'vitest';
import type { ActorId, Team } from '../actors/Actor';
import type { DamageRequest } from '../actors/DamageResolver';
import { StatusEngine, type StatusPorts } from './StatusEngine';
import type { ActorStatusView } from './view';

const DT = 1 / 60;

function harness() {
  const actors = new Map<ActorId, { dead: boolean; hittable: boolean; team: Team }>([
    ['player', { dead: false, hittable: true, team: 'player' }],
    ['wolf', { dead: false, hittable: true, team: 'hostile' }],
    ['guard', { dead: false, hittable: true, team: 'hostile' }],
    ['npc', { dead: false, hittable: false, team: 'neutral' }],
  ]);
  const ticks: DamageRequest[] = [];
  const log: string[] = [];
  const views = new Map<ActorId, ActorStatusView | null>();
  let tickResult = true;
  const ports: StatusPorts = {
    actor: (id) => actors.get(id),
    tick: (req) => { ticks.push(req); return tickResult; },
    applied: (a, id, kind) => log.push(`applied ${a} ${id} ${kind}`),
    expired: (a, id, kind) => log.push(`expired ${a} ${id} ${kind}`),
    view: (a, v) => views.set(a, v ? { ...v } : null),
  };
  const engine = new StatusEngine(ports);
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) engine.update(DT); };
  return { engine, actors, ticks, log, views, run, failTicks: () => { tickResult = false; } };
}

const bleed = (over: Record<string, unknown> = {}) => ({ id: 'bleed:1', kind: 'bleed' as const, dps: 2, seconds: 3, sourceId: 'player', ...over });

describe('apply validation', () => {
  it.each([
    ['zero seconds', { seconds: 0 }],
    ['negative seconds', { seconds: -1 }],
    ['NaN seconds', { seconds: NaN }],
    ['infinite seconds', { seconds: Infinity }],
    ['negative dps', { dps: -1 }],
    ['NaN dps', { dps: NaN }],
    ['empty id', { id: '' }],
    ['unknown kind', { kind: 'burn' as never }],
  ])('refuses %s', (_n, over) => {
    const h = harness();
    expect(h.engine.apply('wolf', bleed(over))).toBe(false);
    expect(h.engine.list('wolf')).toEqual([]);
    expect(h.log).toEqual([]);
  });

  it('refuses a slow without a positive fraction and clamps one above 0.9', () => {
    const h = harness();
    expect(h.engine.apply('wolf', { id: 's', kind: 'slow', seconds: 2, sourceId: null })).toBe(false);
    expect(h.engine.apply('wolf', { id: 's', kind: 'slow', seconds: 2, slow: 0, sourceId: null })).toBe(false);
    expect(h.engine.apply('wolf', { id: 's', kind: 'slow', seconds: 2, slow: 5, sourceId: null })).toBe(true);
    expect(h.engine.view('wolf').slow).toBe(0.9);
  });

  it('refuses unknown, dead and unhittable actors', () => {
    const h = harness();
    h.actors.get('wolf')!.dead = true;
    expect(h.engine.apply('ghost', bleed())).toBe(false);
    expect(h.engine.apply('wolf', bleed())).toBe(false);
    expect(h.engine.apply('npc', bleed())).toBe(false);
    expect(h.log).toEqual([]);
  });

  it('accepts a null source and an unknown source id', () => {
    const h = harness();
    expect(h.engine.apply('wolf', bleed({ sourceId: null }))).toBe(true);
    expect(h.engine.apply('wolf', bleed({ id: 'b2', sourceId: 'gone' }))).toBe(true);
  });

  it('refuses a new id past the per-actor cap but still refreshes an existing one', () => {
    const h = harness();
    for (let i = 0; i < 16; i++) expect(h.engine.apply('wolf', bleed({ id: `b${i}` }))).toBe(true);
    expect(h.engine.apply('wolf', bleed({ id: 'extra' }))).toBe(false);
    expect(h.engine.apply('wolf', bleed({ id: 'b0', seconds: 9 }))).toBe(true);
  });
});

describe('refresh and stacking', () => {
  it('the same id refreshes to the longer time, never stacks dps and emits one applied', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ seconds: 3 }));
    h.run(1.5);
    h.engine.apply('wolf', bleed({ seconds: 2 }));
    expect(h.engine.list('wolf')).toHaveLength(1);
    expect(h.engine.list('wolf')[0]!.remaining).toBeCloseTo(2, 1);
    h.engine.apply('wolf', bleed({ seconds: 1, dps: 1 }));
    expect(h.engine.list('wolf')[0]!.remaining).toBeCloseTo(2, 1);
    expect(h.log.filter((l) => l.startsWith('applied'))).toHaveLength(1);
    h.ticks.length = 0;
    h.run(1);
    expect(h.ticks.map((t) => t.amount)).toEqual([2]);
  });

  it('bleed and ignite with different ids stack their ticks', () => {
    const h = harness();
    h.engine.apply('wolf', bleed());
    h.engine.apply('wolf', { id: 'ignite:1', kind: 'ignite', dps: 4, seconds: 3, sourceId: 'player' });
    h.run(1);
    expect(h.ticks.map((t) => [t.statusId, t.statusKind, t.amount]).sort()).toEqual([
      ['bleed:1', 'bleed', 2],
      ['ignite:1', 'ignite', 4],
    ]);
  });

  it('strongest stun and slow win while weaker ones keep their own time', () => {
    const h = harness();
    h.engine.apply('wolf', { id: 'st1', kind: 'stun', seconds: 1, sourceId: null });
    h.engine.apply('wolf', { id: 'st2', kind: 'stun', seconds: 3, sourceId: null });
    h.engine.apply('wolf', { id: 'sl1', kind: 'slow', slow: 0.3, seconds: 5, sourceId: null });
    h.engine.apply('wolf', { id: 'sl2', kind: 'slow', slow: 0.6, seconds: 2, sourceId: null });
    expect(h.engine.view('wolf')).toMatchObject({ stunned: true, slow: 0.6 });
    expect(h.engine.view('wolf').stunRemaining).toBeCloseTo(3);
    h.run(2.5);
    expect(h.engine.view('wolf').slow).toBe(0.3);
    expect(h.engine.view('wolf').stunRemaining).toBeCloseTo(0.5, 1);
    expect(h.engine.has('wolf', 'stun')).toBe(true);
    h.run(1);
    expect(h.engine.has('wolf', 'stun')).toBe(false);
  });

  it('stun and slow deal no damage', () => {
    const h = harness();
    h.engine.apply('wolf', { id: 'st', kind: 'stun', seconds: 3, dps: 9, sourceId: null });
    h.engine.apply('wolf', { id: 'sl', kind: 'slow', slow: 0.5, dps: 9, seconds: 3, sourceId: null });
    h.run(3.2);
    expect(h.ticks).toEqual([]);
  });
});

describe('ticks and expiry', () => {
  it('ticks once a second as unblockable zero-poise status damage and expires after the last', () => {
    const h = harness();
    h.engine.apply('wolf', bleed());
    h.run(3.1);
    expect(h.ticks).toHaveLength(3);
    expect(h.ticks[0]).toEqual({
      attackerId: 'player', targetId: 'wolf', amount: 2, poise: 0, kind: 'status',
      statusId: 'bleed:1', statusKind: 'bleed', unblockable: true,
    });
    expect(h.engine.list('wolf')).toEqual([]);
    expect(h.log).toEqual(['applied wolf bleed:1 bleed', 'expired wolf bleed:1 bleed']);
    expect(h.views.get('wolf')).toBeNull();
  });

  it('does not tick before a full second and loses a trailing partial second', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ seconds: 2.5 }));
    h.run(0.9);
    expect(h.ticks).toHaveLength(0);
    h.run(2);
    expect(h.ticks).toHaveLength(2);
    expect(h.engine.list('wolf')).toEqual([]);
  });

  it('a sub-second status never ticks and still expires', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ seconds: 0.5 }));
    h.run(1);
    expect(h.ticks).toHaveLength(0);
    expect(h.log.at(-1)).toBe('expired wolf bleed:1 bleed');
  });

  it('a zero-dps bleed ticks nothing', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ dps: 0 }));
    h.run(3.1);
    expect(h.ticks).toEqual([]);
  });

  it('a tick the damage bus drops ends the status instead of repeating', () => {
    const h = harness();
    h.failTicks();
    h.engine.apply('wolf', bleed({ seconds: 10, sourceId: 'guard' }));
    h.run(1.1);
    expect(h.ticks).toHaveLength(1);
    expect(h.engine.list('wolf')).toEqual([]);
  });

  it('a dead target is cleared with expired events and no further ticks', () => {
    const h = harness();
    h.engine.apply('wolf', bleed());
    h.actors.get('wolf')!.dead = true;
    h.run(2);
    expect(h.ticks).toHaveLength(0);
    expect(h.engine.actorCount).toBe(0);
    expect(h.log).toContain('expired wolf bleed:1 bleed');
  });

  it('keeps ticking when the source despawns', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ sourceId: 'guard' }));
    h.actors.delete('guard');
    h.run(1.1);
    expect(h.ticks).toHaveLength(1);
    expect(h.ticks[0]!.attackerId).toBe('guard');
  });
});

describe('clearing', () => {
  it('clear(actor, id) removes one entry; clear(actor) all; clearAll everything', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ id: 'a' }));
    h.engine.apply('wolf', bleed({ id: 'b' }));
    h.engine.apply('guard', bleed({ id: 'c' }));
    h.engine.clear('wolf', 'a');
    expect(h.engine.list('wolf').map((e) => e.id)).toEqual(['b']);
    h.engine.clear('wolf', 'missing');
    h.engine.clear('wolf');
    expect(h.engine.list('wolf')).toEqual([]);
    expect(h.engine.has('guard', 'bleed')).toBe(true);
    h.engine.clearAll();
    expect(h.engine.actorCount).toBe(0);
    expect(h.log.filter((l) => l.startsWith('expired'))).toHaveLength(3);
  });

  it('a mercy clears only what the player side applied', () => {
    const h = harness();
    h.engine.apply('wolf', bleed({ id: 'mine', sourceId: 'player' }));
    h.engine.apply('wolf', bleed({ id: 'theirs', sourceId: 'guard' }));
    h.engine.apply('wolf', { id: 'env', kind: 'slow', slow: 0.2, seconds: 5, sourceId: null });
    h.engine.clearPlayerSourced('wolf');
    expect(h.engine.list('wolf').map((e) => e.id).sort()).toEqual(['env', 'theirs']);
  });

  it('publishes the view on every change and the remaining stun each update', () => {
    const h = harness();
    h.engine.apply('wolf', { id: 'st', kind: 'stun', seconds: 2, sourceId: null });
    expect(h.views.get('wolf')).toMatchObject({ stunned: true, slow: 0 });
    h.run(1);
    expect(h.views.get('wolf')!.stunRemaining).toBeCloseTo(1, 1);
    h.run(1.1);
    expect(h.views.get('wolf')).toBeNull();
  });
});
