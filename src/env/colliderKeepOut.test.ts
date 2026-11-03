import { describe, expect, it } from 'vitest';
import { CROWD_LANES, DOORS, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import type { LayoutData } from '../region/layoutTypes';
import { buildKeepOut, chaseLines, CHASE_HALF_WIDTH, DEFAULT_SOURCES, defaultKeepOut, ANCHOR_CLEARANCE, DOOR_CLEARANCE } from './colliderKeepOut';
import { buildTileColliders } from './colliders';

const layout = (p: Partial<LayoutData>): LayoutData => ({ anchors: [], triggers: [], structures: [], patrols: [], npcs: [], fields: [], ...p });
const none = { layouts: [], lanes: [], doors: [], anchors: [], boxes: [] };

describe('keep-out list', () => {
  it('collects anchors (ground level only), sphere and box triggers, doors and the extra lane', () => {
    const l = layout({
      anchors: [
        { id: 'a.ground', x: 1, z: 2, yawDeg: 0 },
        { id: 'a.roof', x: 3, z: 4, yawDeg: 0, dy: 8 },
        { id: 'a.tagged', x: 5, z: 6, yawDeg: 0, tags: ['elevated'] },
      ],
      triggers: [
        { id: 't.sphere', shape: 'sphere', x: 10, z: 10, radius: 3 },
        { id: 't.box', shape: 'box', x: 20, z: 20, half: [4, 2, 6], yawDeg: 90 },
      ],
    });
    const k = buildKeepOut({ ...none, layouts: [l], doors: [{ doorId: 'inn', x: 7, z: 8 }], anchors: [{ id: 'extra', x: 9, z: 9 }] });
    expect(k.discs.map((d) => d.why).sort()).toEqual(['anchor a.ground', 'anchor extra', 'door inn', 'trigger t.sphere']);
    expect(k.discs.find((d) => d.why === 'anchor a.ground')!.r).toBe(ANCHOR_CLEARANCE);
    expect(k.discs.find((d) => d.why === 'door inn')!.r).toBe(DOOR_CLEARANCE);
    expect(k.discs.find((d) => d.why === 'trigger t.sphere')!.r).toBe(3);
    expect(k.boxes).toEqual([{ cx: 20, cz: 20, hx: 4, hz: 6, yaw: Math.PI / 2, why: 'trigger t.box' }]);
  });

  it('turns a lane into segments of its half width, closing a loop', () => {
    const pts = ['p1', 'p2', 'p3'];
    const l = layout({ anchors: pts.map((id, i) => ({ id, x: i * 10, z: 0, yawDeg: 0 })) });
    const open = buildKeepOut({ ...none, layouts: [l], lanes: [{ id: 'lane.a', points: pts, loop: false, halfWidth: 4 }] });
    expect(open.segments).toHaveLength(2);
    expect(open.segments.every((s) => s.r === 4)).toBe(true);
    const loop = buildKeepOut({ ...none, layouts: [l], lanes: [{ id: 'lane.a', points: pts, loop: true, halfWidth: 4 }] });
    expect(loop.segments).toHaveLength(3);
    // a lane naming an anchor that does not exist leaves a shorter line, not a crash
    expect(buildKeepOut({ ...none, layouts: [l], lanes: [{ id: 'lane.b', points: ['p1', 'nope'], loop: false, halfWidth: 4 }] }).segments).toEqual([]);
  });

  it('builds one chase polyline per route, in node order, with the 1.5 m corridor', () => {
    const l = layout({
      anchors: [
        { id: 'chase.m10.1', x: 10, z: 0, yawDeg: 0 },
        { id: 'chase.m10.0', x: 0, z: 0, yawDeg: 0 },
        { id: 'chase.m10.alt.0', x: 0, z: 50, yawDeg: 0 },
        { id: 'chase.m10.alt.1', x: 20, z: 50, yawDeg: 0 },
        { id: 'chase.m10.2', x: 10, z: 30, yawDeg: 0 },
      ],
    });
    const lines = chaseLines([l]);
    expect(lines.map((c) => c.id).sort()).toEqual(['chase.m10', 'chase.m10.alt']);
    expect(lines.find((c) => c.id === 'chase.m10')!.points).toEqual([[0, 0], [10, 0], [10, 30]]);
    const k = buildKeepOut({ ...none, layouts: [l] });
    expect(k.segments).toHaveLength(3);
    expect(k.segments.every((s) => s.r === CHASE_HALF_WIDTH)).toBe(true);
  });

  it('the default list covers Harrowmark: every lane, both chase routes, the doors, the Bastion yard trigger and the gate', () => {
    const k = defaultKeepOut();
    expect(defaultKeepOut()).toBe(k);
    const why = new Set(k.segments.map((s) => s.why));
    for (const lane of CROWD_LANES) expect(why.has(`lane ${lane.id}`), lane.id).toBe(true);
    expect(why.has('chase chase.m10')).toBe(true);
    expect(why.has('chase chase.m10.alt')).toBe(true);
    for (const d of DOORS) expect(k.discs.some((q) => q.why === `door ${d.doorId}`), d.doorId).toBe(true);
    expect(k.boxes.some((b) => b.why === 'trigger trg.harrowmark.bastion-yard')).toBe(true);
    expect(k.discs.some((q) => q.why === 'trigger trg.harrowmark.gate-south')).toBe(true);
    for (const a of HARROWMARK_LAYOUT.anchors.filter((q) => !q.dy && !q.tags?.includes('elevated'))) expect(k.discs.some((q) => q.why === `anchor ${a.id}`), a.id).toBe(true);
    expect(DEFAULT_SOURCES.layouts.length).toBeGreaterThan(1);
  });

  it('keeps the B2 waves road free but leaves the east verge hedge a collider', () => {
    const k = defaultKeepOut();
    const rows = [
      { id: 'hedge-straight', x: 6, z: 250, yaw: 90, scale: 1 }, // east verge, x >= 4
      { id: 'hedge-straight', x: 0, z: 250, yaw: 90, scale: 1 }, // on the lane
    ];
    const r = buildTileColliders('b2', rows, k);
    expect(r.stats.dropped).toBe(1);
    expect(r.boxes).toHaveLength(1);
    expect(r.boxes[0]!.cx).toBe(6);
  });
});
