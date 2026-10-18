import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SurgeFormContext } from '../../spells/SurgeAndRally';
import { SURGE } from '../../vfx/tuning';
import { createAshbladeForms, type DriftPorts } from './surgeForms';
import { ASH_DRIFT } from './tuning';

type V3 = { x: number; y: number; z: number };

/** A hostile actor stub: position and (optionally) a root facing `yaw` (root forward is -Z). */
function foe(id: string, pos: V3, opts: { yaw?: number; team?: string; noRoot?: boolean } = {}) {
  const root = new THREE.Object3D();
  root.rotation.y = opts.yaw ?? 0;
  root.updateMatrixWorld(true);
  return {
    id,
    team: opts.team ?? 'hostile',
    hittable: true,
    dead: false,
    root: opts.noRoot ? null : root,
    worldPosition: (out: THREE.Vector3) => out.set(pos.x, pos.y, pos.z),
  };
}

function harness(actors: ReturnType<typeof foe>[], over: Partial<DriftPorts> & { walls?: (o: V3, d: V3, max: number) => { distance: number } | null; ground?: number | null; zone?: number } = {}) {
  const teleports: { feet: V3; yaw: number }[] = [];
  const release = vi.fn();
  const invulnerable = vi.fn((_s: number) => release);
  const arrive = vi.fn();
  const warn = vi.fn();
  const ports: DriftPorts = {
    interiorAt: () => null,
    currentInterior: () => null,
    raycast: (origin, dir, max) => {
      if (dir.y === -1) {
        if (over.ground === null) return null;
        const y = over.ground ?? 0;
        return { distance: origin.y - y, point: { x: origin.x, y, z: origin.z } };
      }
      const w = over.walls?.(origin, dir, max);
      return w && w.distance <= max ? { distance: w.distance, point: { x: 0, y: 0, z: 0 } } : null;
    },
    teleport: (feet, yaw) => teleports.push({ feet, yaw }),
    invulnerable,
    arrive,
    warn,
    ...(over.interiorAt ? { interiorAt: over.interiorAt } : {}),
    ...(over.currentInterior ? { currentInterior: over.currentInterior } : {}),
  };
  if ('invulnerable' in over) ports.invulnerable = over.invulnerable!;
  const apply = vi.fn();
  const forms = createAshbladeForms(ports);
  const ctx = (radius = 6, feet: V3 = { x: 0, y: 0, z: 0 }, yaw = 0): SurgeFormContext =>
    ({
      casterId: 'player',
      zone: 'warm',
      feet,
      facingYaw: yaw,
      radius,
      poise: SURGE.poise,
      host: { actors: { all: () => actors, get: () => undefined }, player: {}, events: {} },
      damage: { apply, heal: () => undefined },
    }) as unknown as SurgeFormContext;
  return { forms, ctx, teleports, release, invulnerable, arrive, warn, apply };
}

// The target at (0,0,-4) faces the player (+Z): its root yaw is PI.
const facingPlayer = { yaw: Math.PI };

describe('Ash-drift (Warm)', () => {
  it('goes invulnerable for 2 s, lands behind the nearest hostile facing it, and strikes once', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 }, facingPlayer)]);
    t.forms.warm(t.ctx());
    expect(t.invulnerable).toHaveBeenCalledWith(ASH_DRIFT.seconds);
    expect(t.teleports).toHaveLength(1);
    expect(t.teleports[0].feet.x).toBeCloseTo(0);
    expect(t.teleports[0].feet.z).toBeCloseTo(-5.2);
    // facing the target means forward (-sin yaw, -cos yaw) points to +Z
    expect(Math.cos(t.teleports[0].yaw)).toBeCloseTo(-1);
    expect(t.arrive).toHaveBeenCalledOnce();
    expect(t.apply).toHaveBeenCalledOnce();
    const req = t.apply.mock.calls[0][0];
    expect(req).toMatchObject({ attackerId: 'player', targetId: 'a', amount: SURGE.damage, poise: SURGE.poise, kind: 'spell', attackId: SURGE.spellId });
    expect(t.release).not.toHaveBeenCalled();
  });

  it('prefers a target in front over a nearer one behind', () => {
    const t = harness([foe('behind', { x: 0, y: 0, z: 2 }), foe('front', { x: 0, y: 0, z: -4 })]);
    t.forms.warm(t.ctx());
    expect(t.apply.mock.calls[0][0].targetId).toBe('front');
  });

  it('ignores allies, targets out of range, in another space or at another height', () => {
    const t = harness(
      [
        foe('ally', { x: 0, y: 0, z: -3 }, { team: 'ally' }),
        foe('far', { x: 0, y: 0, z: -9 }),
        foe('floor-above', { x: 0, y: 150, z: -3 }),
        foe('inside', { x: 0, y: 0, z: -2 }),
      ],
      { interiorAt: (p) => (p.z === -2 ? 'keep' : null), currentInterior: () => null },
    );
    t.forms.warm(t.ctx());
    expect(t.apply).not.toHaveBeenCalled();
    // a hostile existed but none was a legal target, so there is no free drift either, only the invulnerability
    expect(t.invulnerable).toHaveBeenCalledOnce();
  });

  it('only jumps to a target in the interior the player is in', () => {
    const t = harness([foe('in', { x: 0, y: 0, z: -3 })], { interiorAt: () => 'keep', currentInterior: () => 'keep' });
    t.forms.warm(t.ctx());
    expect(t.apply).toHaveBeenCalledOnce();
  });

  it('falls back to the player side of the target when the back is walled off', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 }, facingPlayer)], {
      // a wall between the target and the point behind it
      walls: (o, d) => (d.z < 0 && o.z === -4 + 0 ? { distance: 0.5 } : null),
    });
    t.forms.warm(t.ctx());
    expect(t.teleports).toHaveLength(1);
    expect(t.teleports[0].feet.z).toBeCloseTo(-2.8);
    expect(t.apply).toHaveBeenCalledOnce();
  });

  it('does not hop or strike when no landing is safe, but keeps the invulnerability', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 })], { ground: null });
    t.forms.warm(t.ctx());
    expect(t.teleports).toHaveLength(0);
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.invulnerable).toHaveBeenCalledOnce();
  });

  it('rejects a landing whose ground is far from the target feet', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 })], { ground: -8 });
    t.forms.warm(t.ctx());
    expect(t.teleports).toHaveLength(0);
  });

  it('with no hostile drifts 6 m forward along (-sin, -cos) and hits nobody', () => {
    const t = harness([]);
    t.forms.warm(t.ctx(6, { x: 1, y: 0, z: 1 }, Math.PI / 2));
    expect(t.teleports).toHaveLength(1);
    expect(t.teleports[0].feet.x).toBeCloseTo(1 - 6);
    expect(t.teleports[0].feet.z).toBeCloseTo(1, 5);
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.invulnerable).toHaveBeenCalledOnce();
  });

  it('shortens the free drift at a wall and skips it when the wall is at arm length', () => {
    const near = harness([], { walls: () => ({ distance: 3 }) });
    near.forms.warm(near.ctx());
    expect(near.teleports[0].feet.z).toBeCloseTo(-2.4);
    const flush = harness([], { walls: () => ({ distance: 0.5 }) });
    flush.forms.warm(flush.ctx());
    expect(flush.teleports).toHaveLength(0);
  });

  it('warns and still works when the invulnerability hook is absent', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 })], { invulnerable: () => null });
    t.forms.warm(t.ctx());
    expect(t.warn).toHaveBeenCalledOnce();
    expect(t.apply).toHaveBeenCalledOnce();
  });

  it('never throws: a failing strike is caught, warned, and the invulnerability released', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 })]);
    t.apply.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => t.forms.warm(t.ctx())).not.toThrow();
    expect(t.warn).toHaveBeenCalledOnce();
    expect(t.release).toHaveBeenCalledOnce();
  });
});

describe('Ash-drift (Blaze)', () => {
  it('strikes two targets, the second the nearest to the first', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 }, facingPlayer), foe('b', { x: 3, y: 0, z: -5 }, facingPlayer), foe('c', { x: -7, y: 0, z: 0 })]);
    t.forms.blaze(t.ctx(8));
    expect(t.apply.mock.calls.map((c) => c[0].targetId)).toEqual(['a', 'b']);
    expect(t.teleports).toHaveLength(2);
    expect(t.invulnerable).toHaveBeenCalledOnce();
  });

  it('strikes the single target once when there is only one', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 })]);
    t.forms.blaze(t.ctx(8));
    expect(t.apply).toHaveBeenCalledOnce();
  });
});

describe('Cinderburst', () => {
  it('hits every hostile in range without a hop or the invulnerability', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 }), foe('b', { x: 5, y: 0, z: 5 }), foe('far', { x: 20, y: 0, z: 0 }), foe('ally', { x: 1, y: 0, z: 1 }, { team: 'ally' })]);
    t.forms.cinder(t.ctx(10));
    expect(t.apply.mock.calls.map((c) => c[0].targetId).sort()).toEqual(['a', 'b']);
    expect(t.teleports).toHaveLength(0);
    expect(t.invulnerable).not.toHaveBeenCalled();
  });

  it('is caught if a hit throws', () => {
    const t = harness([foe('a', { x: 0, y: 0, z: -4 })]);
    t.apply.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => t.forms.cinder(t.ctx(10))).not.toThrow();
    expect(t.warn).toHaveBeenCalledOnce();
  });
});
