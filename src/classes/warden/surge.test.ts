import { describe, expect, it, vi } from 'vitest';
import { FakeActor, FakeActors, FakeEvents } from '../../spells/testHost';
import type { SurgeFormContext } from '../../spells/SurgeAndRally';
import { SURGE } from '../../vfx/tuning';
import { SurgeForms } from '../../spells/SurgeAndRally';
import { inFissure, wardenSurgeForm } from './surge';
import { FISSURE } from './tuning';

function ctx(zone: 'warm' | 'blaze' | 'cinder', yaw = 0) {
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const applied: any[] = [];
  const suppress = vi.fn();
  const radius = { warm: 6, blaze: 8, cinder: 10 }[zone];
  const c = {
    casterId: 'player',
    zone,
    feet: { x: 0, y: 0, z: 0 },
    facingYaw: yaw,
    radius,
    poise: zone === 'cinder' ? 999 : SURGE.poise,
    host: { events: new FakeEvents(), player: player as never, actors },
    damage: { apply: (r: unknown) => void applied.push(r) },
    suppressRing: suppress,
  } as unknown as SurgeFormContext;
  const foe = (id: string, x: number, z: number) => actors.add(new FakeActor(id, 'hostile', x, z));
  return { c, applied, suppress, foe, actors };
}
const ports = () => ({ igniteAxe: vi.fn(), fissureFx: vi.fn() });

describe('Warden Surge forms', () => {
  it('Warm: the stomp ring hits everything within 6 m with the Surge numbers and lights the axe', () => {
    const t = ctx('warm');
    t.foe('near', 0, -2);
    t.foe('behind', 0, 5);
    t.foe('far', 0, -6.5);
    t.actors.add(new FakeActor('ally', 'ally', 0, -1));
    t.foe('dead', 1, 1).kill();
    const p = ports();
    wardenSurgeForm('warm', p)(t.c);
    expect(t.applied.map((a) => a.targetId).sort()).toEqual(['behind', 'near']);
    expect(t.applied[0]).toMatchObject({ attackerId: 'player', amount: SURGE.damage, poise: SURGE.poise, kind: 'spell', attackId: SURGE.spellId });
    expect(p.igniteAxe).toHaveBeenCalledTimes(1);
    expect(t.suppress).not.toHaveBeenCalled();
  });

  it('Blaze: a fissure line replaces the ring, asks for the shared ring to be left out and lights the axe', () => {
    const t = ctx('blaze');
    t.foe('inline', 0, -9);
    t.foe('wide', 1.9, -4);
    t.foe('toowide', 2.5, -4);
    t.foe('past', 0, -10.5);
    t.foe('behind', 0, 1);
    t.foe('close', 0, -0.5);
    const p = ports();
    wardenSurgeForm('blaze', p)(t.c);
    expect(t.applied.map((a) => a.targetId).sort()).toEqual(['close', 'inline', 'wide']);
    expect(t.suppress).toHaveBeenCalledTimes(1);
    expect(p.igniteAxe).toHaveBeenCalledTimes(1);
    expect(p.fissureFx).toHaveBeenCalledTimes(1);
    expect(p.fissureFx.mock.calls[0][0]).toHaveLength(5);
    expect(p.fissureFx.mock.calls[0][0][4].z).toBeCloseTo(-FISSURE.length);
  });

  it('Blaze works when the core has no suppressRing', () => {
    const t = ctx('blaze');
    t.foe('a', 0, -3);
    delete (t.c as { suppressRing?: unknown }).suppressRing;
    expect(() => wardenSurgeForm('blaze', ports())(t.c)).not.toThrow();
    expect(t.applied).toHaveLength(1);
  });

  it('Blaze follows the facing', () => {
    const t = ctx('blaze', Math.PI / 2);
    t.foe('west', -6, 0);
    t.foe('north', 0, -6);
    wardenSurgeForm('blaze', ports())(t.c);
    expect(t.applied.map((a) => a.targetId)).toEqual(['west']);
  });

  it('Cinder: the 10 m burst at poise 999 and no ignite (the design gives the Cinderburst none)', () => {
    const t = ctx('cinder');
    t.foe('a', 0, -9.5);
    t.foe('b', 0, 9.5);
    t.foe('c', 0, 11);
    const p = ports();
    wardenSurgeForm('cinder', p)(t.c);
    expect(t.applied.map((a) => a.targetId).sort()).toEqual(['a', 'b']);
    expect(t.applied[0].poise).toBe(999);
    expect(p.igniteAxe).not.toHaveBeenCalled();
  });

  it('registers in the real SurgeForms registry for all three zones, once', () => {
    const forms = new SurgeForms();
    for (const zone of ['warm', 'blaze', 'cinder'] as const) {
      expect(forms.register('warden', zone, wardenSurgeForm(zone, ports())).ok).toBe(true);
      expect(forms.has('warden', zone)).toBe(true);
    }
    expect(forms.register('warden', 'warm', wardenSurgeForm('warm', ports()))).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('inFissure', () => {
  const feet = { x: 0, y: 0, z: 0 };
  it('is a 10 m by 4 m box in front of the player', () => {
    expect(inFissure(feet, 0, { x: 0, y: 0, z: -10 })).toBe(true);
    expect(inFissure(feet, 0, { x: 2, y: 0, z: -5 })).toBe(true);
    expect(inFissure(feet, 0, { x: 2.01, y: 0, z: -5 })).toBe(false);
    expect(inFissure(feet, 0, { x: 0, y: 0, z: -10.01 })).toBe(false);
    expect(inFissure(feet, 0, { x: 0, y: 0, z: 0.01 })).toBe(false);
  });
});
