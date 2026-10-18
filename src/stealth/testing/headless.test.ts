import { describe, expect, it } from 'vitest';
import { perceive } from '../../enemies/ai/perception';
import { combineModifiers } from '../../enemies/perceptionHook';
import { HARROWMARK_LAYOUT } from '../../harrowmark/harrowmark.layout';
import { COUNTING_HOUSE_DEF } from '../../interiors/harrowmark';
import { resolveAnchor } from '../../region/resolveLayout';
import { heightAt } from '../../terrain/heightfield';
import type { GameContext } from '../../core/Game';
import { chaseRoute, makeUndetectable, stealthRoute } from './headless';

const city = new Map(HARROWMARK_LAYOUT.anchors.map((s) => [s.id, resolveAnchor(s, heightAt)]));
const house = new Map(COUNTING_HOUSE_DEF.anchors.map((a) => [a.id, { id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 }]));

describe('headless test helpers (thread 21)', () => {
  it('M06 route: start, the inside checkpoint, the end, on thread 17 anchors', () => {
    const r = stealthRoute('m06.south-gate', (id) => city.get(id));
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual(city.get('stealth.m06.start')!.position);
    expect(r[2]).toEqual(city.get('stealth.m06.end')!.position);
  });

  it('M09 route: entry, the three invoices, back out the exit, on 3a anchors', () => {
    const r = stealthRoute('m09.counting-house', (id) => house.get(id));
    expect(r).toHaveLength(9);
    expect(r[3]).toEqual(house.get('m09.invoice-1')!.position);
    expect(r.at(-1)).toEqual(house.get('stealth.m09.exit')!.position);
  });

  it('a missing anchor or an unknown section throws by name', () => {
    expect(() => stealthRoute('m09.counting-house', () => undefined)).toThrow('stealth.m09.entry');
    expect(() => stealthRoute('nope', (id) => city.get(id))).toThrow('unknown section');
    expect(() => chaseRoute(() => undefined)).toThrow('chase.m10');
  });

  it('chase route: begins on chase.m10.0 and ends on the last node, detours included', () => {
    const r = chaseRoute((id) => city.get(id));
    expect(r[0]).toEqual(city.get('chase.m10.0')!.position);
    expect(r.at(-1)).toEqual(city.get('chase.m10.15')!.position);
    expect(r.length).toBeGreaterThanOrEqual(16);
  });

  it('makeUndetectable: a guard face to face cannot see or hear the player; removing it restores perception', () => {
    let provider: { modifiers(t: string, o: unknown): unknown } | null = null;
    const ctx = {
      player: { actor: { id: 'player' } },
      services: { get: () => ({ perception: { register: (p: typeof provider) => ((provider = p), () => (provider = null)) } }) },
    } as unknown as GameContext;
    const off = makeUndetectable(ctx);
    const input = { selfFeet: { x: 0, y: 0, z: 0 }, selfYaw: 0, targetFeet: { x: 0, y: 0, z: -2 }, targetAlive: true, targetLoud: true, damagedBy: false, lineOfSight: () => true };
    const mods = provider!.modifiers('player', {}) as Parameters<typeof combineModifiers>[0][number];
    expect(perceive({ ...input, modifiers: combineModifiers([mods]) }).notices).toBe(false);
    expect(provider!.modifiers('npc:x', {})).toBeNull();
    expect(perceive(input).notices).toBe(true);
    off();
    expect(provider).toBeNull();
  });
});
