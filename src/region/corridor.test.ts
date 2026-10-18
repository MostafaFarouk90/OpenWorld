import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { CORRIDOR_LAYOUT, FOG_WALL_X, ledgeCluster } from './corridor.layout';
import { ROAD_Z } from './deadRoad';
import { footprintCorners, groundRange } from './geometry';
import { FOUNDATION_KINDS, LEDGE_MAX_HEIGHT, LEDGE_MIN_DEPTH, LEDGE_MIN_HEIGHT, type LayoutData } from './layoutTypes';
import { REGION_BOXES_MAP, MAP_TO_ENGINE_OFFSET } from './regionMask';
import { validateLayout } from './validateLayout';

const anchorIds = new Set(BRIGHTWATER_LAYOUT.anchors.map((a) => a.id));
const triggerIds = new Set(BRIGHTWATER_LAYOUT.triggers.map((t) => t.id));
const anchor = (id: string) => BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === id)!;
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

describe('the corridor layout', () => {
  it('passes the validator on the real terrain, with every standing anchor reachable', () => {
    expect(validateLayout(BRIGHTWATER_LAYOUT, heightAt)).toEqual([]);
  });

  it('publishes every anchor and trigger id the sibling threads were promised', () => {
    const anchors = [
      'waystone.hollin-ford', 'ford.toll-post', 'ford.carters.cart', 'ford.carters.walk-off', 'spawn.ford.pair-1', 'spawn.ford.pair-2',
      'npc-post.gaut.ford', 'npc-post.carter-1', 'npc-post.carter-2', 'npc-post.tobb', 'poi.leap.chapel-ledge', 'poi.leap.reed-island',
      'chapel.shard-study', 'vault.door', 'npc-post.aelfreda.vault', 'shrine.quenchstone.basin', 'waystone.quenchstone', 'fog.harrowmark',
      'spawn.deadroad.patrol-1', 'spawn.deadroad.patrol-2',
      ...range(1, 2).map((i) => `r01.brazier.${i}`),
      ...range(1, 6).map((i) => `r01.scarecrow.${i}`),
      ...range(1, 5).map((i) => `wardstone.${i}`),
      ...range(1, 4).map((i) => `pile.churchyard.${i}`),
      ...range(1, 6).map((i) => `pile.deadroad.${i}`),
      ...[1, 2].flatMap((g) => range(1, 4).map((i) => `patrol.deadroad.${g}.${i}`)),
    ];
    for (const id of anchors) expect(anchorIds.has(id), id).toBe(true);
    for (const id of ['trg.ford.toll-post', 'trg.leap.chapel-ledge', 'trg.vault.door', 'trg.wardstones.road', 'trg.shrine.basin']) expect(triggerIds.has(id), id).toBe(true);
    // The old names and a third patrol are not published.
    expect(triggerIds.has('m03.cliff-ledge')).toBe(false);
    expect(anchorIds.has('spawn.deadroad.patrol-3')).toBe(false);
    // trg.fog.harrowmark exists only while the wall stands, so the layout never carries it.
    expect(triggerIds.has('trg.fog.harrowmark')).toBe(false);
  });

  it('keeps every corridor anchor inside the Brightwater box (phase A) and every id unique', () => {
    const b = REGION_BOXES_MAP.brightwater;
    for (const a of CORRIDOR_LAYOUT.anchors) {
      const mx = a.x - MAP_TO_ENGINE_OFFSET.x;
      const mz = a.z - MAP_TO_ENGINE_OFFSET.z;
      expect(mx >= b.x0 && mx < b.x1 && mz >= b.z0 && mz < b.z1, a.id).toBe(true);
      expect(a.x, a.id).toBeLessThanOrEqual(FOG_WALL_X);
    }
    const all = BRIGHTWATER_LAYOUT.anchors.map((a) => a.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the road anchors on the Dead Road corridor and the wardstones where the contract has them', () => {
    for (const i of range(1, 5)) {
      const a = anchor(`wardstone.${i}`);
      expect(a.x).toBe(180 + i * 120);
      expect(a.z).toBe(-146);
    }
    expect(anchor('fog.harrowmark')).toMatchObject({ x: FOG_WALL_X, z: ROAD_Z });
    expect(anchor('ford.toll-post').x).toBeGreaterThan(-420); // the bridge's east end
  });

  it('puts waystone stones 1.8 m from their stand points, facing them', () => {
    for (const id of ['hollin-ford', 'quenchstone']) {
      const stand = anchor(`waystone.${id}`);
      const stone = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === `waystone-${id}`)!;
      expect(Math.hypot(stone.x - stand.x, stone.z - stand.z)).toBeCloseTo(1.8);
    }
  });

  it('gives the vault door a yaw facing away from the stair, which the vault exit relies on', () => {
    const door = anchor('vault.door');
    const stair = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === 'crypt-stair')!;
    const yaw = (door.yawDeg * Math.PI) / 180;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const toStair = { x: stair.x - door.x, z: stair.z - door.z };
    expect(forward.x * toStair.x + forward.z * toStair.z).toBeLessThan(0);
    // 1.6 m in front of the door is inside the chapel and clear of the altar.
    const arrive = { x: door.x + forward.x * 1.6, z: door.z + forward.z * 1.6 };
    const chapel = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === 'chapel')!;
    expect(Math.abs(arrive.x - chapel.x)).toBeLessThan(chapel.footprint[0] / 2 - 0.6);
    expect(Math.abs(arrive.z - chapel.z)).toBeLessThan(chapel.footprint[1] / 2 - 0.6);
  });

  it('declares the ledge anchors leap-gated and on their platforms, with a launch point 2 to 4 m from the edge', () => {
    for (const [poi, prefix, launch] of [['poi.leap.chapel-ledge', 'chapel', 'poi.leap.chapel-ledge.launch'], ['poi.leap.reed-island', 'reed-island', 'poi.leap.reed-island.launch']] as const) {
      const a = anchor(poi);
      expect(a.tags).toContain('leap-gated');
      expect(a.onStructure).toBe(`${prefix}-ledge`);
      const platform = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === `${prefix}-ledge`)!;
      const edge = platform.z - platform.footprint[1] / 2;
      const fromEdge = edge - anchor(launch).z;
      expect(fromEdge).toBeGreaterThanOrEqual(2);
      expect(fromEdge).toBeLessThanOrEqual(4);
    }
  });
});

describe('ledge and foundation rules', () => {
  const withLedge = (patch: Partial<LayoutData['structures'][number]>): LayoutData => ({
    ...BRIGHTWATER_LAYOUT,
    structures: BRIGHTWATER_LAYOUT.structures.map((s) => (s.id === 'chapel-ledge' ? { ...s, ...patch } : s)),
  });

  it('accepts the shipped ledges: 1.8 m high and at least 3 m deep', () => {
    for (const s of BRIGHTWATER_LAYOUT.structures.filter((x) => x.role === 'ledge')) {
      expect(s.height).toBeGreaterThanOrEqual(LEDGE_MIN_HEIGHT);
      expect(s.height).toBeLessThanOrEqual(LEDGE_MAX_HEIGHT);
      expect(Math.min(...s.footprint)).toBeGreaterThanOrEqual(LEDGE_MIN_DEPTH);
    }
    expect(BRIGHTWATER_LAYOUT.structures.filter((x) => x.role === 'ledge')).toHaveLength(2);
  });

  it('rejects a ledge a plain jump could reach (1.3 m)', () => {
    expect(validateLayout(withLedge({ height: 1.3 }), heightAt).join('\n')).toContain('a ledge must be 1.7 to 1.9 m high');
  });

  it('rejects a ledge the Leap cannot clear (2.4 m)', () => {
    expect(validateLayout(withLedge({ height: 2.4 }), heightAt).join('\n')).toContain('a ledge must be 1.7 to 1.9 m high');
  });

  it('rejects a ledge whose top is less than 3 m deep', () => {
    expect(validateLayout(withLedge({ footprint: [6, 2.5] }), heightAt).join('\n')).toContain('at least 3 m deep');
  });

  it('rejects a ledge that is not solid', () => {
    expect(validateLayout(withLedge({ mode: 'open' }), heightAt).join('\n')).toContain('must be solid');
  });

  it('lets a rock stand on sloping ground, and still holds a house to the flat-site rule', () => {
    const slope = (x: number) => x * 0.3;
    const rock = { id: 'r', kind: 'rock' as const, x: 400, z: 0, yawDeg: 0, footprint: [6, 6] as [number, number], mode: 'solid' as const, height: 3 };
    const base: LayoutData = { anchors: [{ id: 'brightwater.player-spawn', x: 400, z: -20, yawDeg: 0 }], triggers: [], structures: [rock], patrols: [], npcs: [], fields: [] };
    expect(validateLayout(base, slope)).toEqual([]);
    const house = { ...rock, id: 'h', kind: 'house' as const };
    expect(validateLayout({ ...base, structures: [house] }, slope).join('\n')).toContain('not flat enough');
    expect(FOUNDATION_KINDS).toContain('rock');
  });

  it('measures a ledge from the highest ground within 1 m, with the column down to the lowest', () => {
    const rock = ledgeCluster('t', 0, 0)[0];
    const slope = (x: number) => x * 0.5;
    const r = groundRange(rock, (x) => slope(x), 1);
    // The footprint is 6 wide, grown by 1 m each side: x from -4 to 4.
    expect(r.min).toBeCloseTo(-2);
    expect(r.max).toBeCloseTo(2);
    expect(footprintCorners(rock)).toHaveLength(4);
  });

  it('wraps the flood fill in a window per cluster, so a far-away cluster costs only its own cells', () => {
    const l: LayoutData = {
      anchors: [
        { id: 'brightwater.player-spawn', x: 0, z: 0, yawDeg: 0 },
        { id: 'far.a', x: 40_000, z: 40_000, yawDeg: 0 },
        { id: 'far.b', x: 40_030, z: 40_000, yawDeg: 0 },
      ],
      triggers: [], structures: [], patrols: [], npcs: [], fields: [],
    };
    const t0 = Date.now();
    expect(validateLayout(l, () => 0)).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('flags an anchor walled in inside its own cluster', () => {
    const wall = (id: string, x: number, z: number, w: number, d: number) => ({ id, kind: 'rock' as const, x, z, yawDeg: 0, footprint: [w, d] as [number, number], mode: 'solid' as const, height: 3 });
    const l: LayoutData = {
      anchors: [
        { id: 'brightwater.player-spawn', x: 0, z: 0, yawDeg: 0 },
        { id: 'far.seed', x: 500, z: 0, yawDeg: 0, tags: ['flood-seed'] },
        { id: 'far.trapped', x: 520, z: 0, yawDeg: 0 },
      ],
      triggers: [], patrols: [], npcs: [], fields: [],
      structures: [wall('n', 520, 3, 6, 1), wall('s', 520, -3, 6, 1), wall('e', 523, 0, 1, 7), wall('w', 517, 0, 1, 7)],
    };
    expect(validateLayout(l, () => 0).join('\n')).toContain('anchor "far.trapped": unreachable from "far.seed"');
  });

  it('flags a whole cluster sealed off from the world, which the per-cluster fill would otherwise accept', () => {
    const ford = BRIGHTWATER_LAYOUT.anchors.filter((a) => a.id.startsWith('ford.') || a.id.includes('.ford') || a.id === 'waystone.hollin-ford');
    const cx = ford.reduce((s, a) => s + a.x, 0) / ford.length;
    const wall = (id: string, x: number, z: number, w: number, d: number) => ({ id, kind: 'rock' as const, x, z, yawDeg: 0, footprint: [w, d] as [number, number], mode: 'solid' as const, height: 4 });
    const sealed: LayoutData = {
      ...BRIGHTWATER_LAYOUT,
      structures: [...BRIGHTWATER_LAYOUT.structures, wall('seal-n', cx, -100, 202, 2), wall('seal-s', cx, -220, 202, 2), wall('seal-w', cx - 100, -160, 2, 118), wall('seal-e', cx + 100, -160, 2, 118)],
    };
    expect(validateLayout(sealed, heightAt).join('\n')).toContain('walled off');
  });

  it('sees a structure that crosses a cluster window without a corner inside it', () => {
    const palisade = { id: 'palisade', kind: 'rock' as const, x: 540, z: -146, yawDeg: 0, footprint: [90, 90] as [number, number], mode: 'solid' as const, height: 3 };
    const l: LayoutData = { ...BRIGHTWATER_LAYOUT, structures: [...BRIGHTWATER_LAYOUT.structures, palisade] };
    expect(validateLayout(l, heightAt).join('\n')).toContain('"wardstone.3": inside a solid structure');
  });

  it('does not require a leap-gated anchor to be walkable', () => {
    const errors = validateLayout(BRIGHTWATER_LAYOUT, heightAt).filter((e) => e.includes('poi.leap'));
    expect(errors).toEqual([]);
  });
});
