import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../region/corridor.layout';
import { pointInFootprint } from '../region/geometry';
import { arrival, radiusOf } from './validateCity';
import { BANNER_COUNT, BRAZIER_COUNT, CHASE_M10, CROWD_LANES, DOORS, HARROWMARK_LAYOUT, HARROWMARK_NPCS, WARD } from './harrowmark.layout';
import { HARROWMARK_NPC_DEFS } from './npcDefs';

const anchors = new Map(HARROWMARK_LAYOUT.anchors.map((a) => [a.id, a]));
const dist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);
const at = (id: string) => {
  const a = anchors.get(id);
  if (!a) throw new Error(`missing anchor ${id}`);
  return a;
};

describe('Harrowmark anchor ids (the contract for threads 3a, 6, 12, 17b, 18, 19)', () => {
  it('has every id the other threads asked for', () => {
    const want = [
      // 19
      'shop.wystan', 'shop.merrin', 'shop.dunstan', 'shop.gerta', 'shop.ashdown', 'chest.harrowmark.1', 'chest.harrowmark.2', 'chest.harrowmark.3', 'chest.harrowmark.4',
      // 12
      'harrowmark.bastion.yard', 'harrowmark.bastion.drill.blocker', 'harrowmark.bastion.drill.dodge-lane',
      ...['gaut', 'stane', 'pennard', 'gerta', 'ashdown'].map((n) => `harrowmark.bastion.trainer.${n}`),
      // 6
      'm06.gate-brazier', 'm07.bastion-yard', 'm07.satchel', 'm07.thieves.1', 'm07.thieves.3', 'r03.guildhall.1', 'r03.guildhall.3', 'r03.brewing-copper', 'm10.courier-orders', 'r04.page-1', 'r04.page-2', 'r04.page-3',
      'npc-post.stane.bastion', 'npc-post.rook.gate',
      // 18
      'stealth.m06.start', 'stealth.m06.cp.inside', 'stealth.m06.end', 'hide.m06.1', 'hide.m06.4', 'patrol.m06.gate-square.1',
      'chase.m10.0', 'chase.m10.15',
      // 3a doors
      'harrowmark.tilted-anvil.door', 'harrowmark.tilted-anvil-back.door', 'harrowmark.keep-hall.door', 'harrowmark.counting-house.door', 'harrowmark.archive.door', 'harrowmark.underways.door',
    ];
    for (const id of want) expect(anchors.has(id), id).toBe(true);
  });

  it('does not define the interior-only ids that belong to thread 3a', () => {
    for (const id of ['inn.aldith', 'inn.room', 'm08.keep-hall', 'm09.invoice-1', 'npc-post.aldith.inside', 'npc-post.edric.hall', 'stealth.m09.cp.office', 'hide.m09.1', 'patrol.m09.hall.1']) expect(anchors.has(id), id).toBe(false);
  });

  it('shares no anchor or trigger id with Brightwater or the corridor', () => {
    const taken = new Set([...BRIGHTWATER_LAYOUT.anchors, ...CORRIDOR_LAYOUT.anchors].map((a) => a.id));
    for (const id of anchors.keys()) expect(taken.has(id), id).toBe(false);
    const trig = new Set([...BRIGHTWATER_LAYOUT.triggers, ...CORRIDOR_LAYOUT.triggers].map((t) => t.id));
    for (const t of HARROWMARK_LAYOUT.triggers) expect(trig.has(t.id), t.id).toBe(false);
  });

  it('interactable-bound names have no dots (door ids, hide names)', () => {
    for (const d of DOORS) expect(d.doorId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(new Set(DOORS.map((d) => d.doorId)).size).toBe(DOORS.length);
    expect(DOORS.map((d) => d.doorId).sort()).toEqual(['archive', 'counting-house', 'keep-hall', 'tilted-anvil', 'tilted-anvil-back', 'underways']);
  });

  it('gives every door a trigger at its outside anchor', () => {
    for (const d of DOORS) {
      const t = HARROWMARK_LAYOUT.triggers.find((q) => q.id === `trg.harrowmark.door.${d.doorId}`)!;
      expect(t).toBeDefined();
      expect(dist(t, at(d.anchor))).toBe(0);
    }
  });

  it('defines the Bastion yard trigger and Tobb\'s two waits, clear of the door prompts', () => {
    const t = HARROWMARK_LAYOUT.triggers.find((q) => q.id === 'trg.harrowmark.bastion-yard')!;
    expect(t.shape).toBe('box');
    expect(HARROWMARK_LAYOUT.triggers.some((q) => q.id === 'trg.harrowmark.keep-hall')).toBe(false); // 3a's hall box
    expect(dist(at('npc-post.tobb.keep'), at('harrowmark.keep-hall.door'))).toBeGreaterThanOrEqual(5);
    expect(dist(at('npc-post.tobb.keep'), arrival(at('harrowmark.keep-hall.door')))).toBeGreaterThanOrEqual(4);
    expect(at('npc-post.tobb.south-gate').z).toBeGreaterThan(at('harrowmark.gate.south.inside').z);
  });

  it('opens the Tilted Anvil back door onto the Bastion yard', () => {
    const back = at('harrowmark.tilted-anvil-back.door');
    const yard = HARROWMARK_LAYOUT.structures.find((s) => s.id === 'bastion.yard-fence')!;
    const p = arrival(back);
    expect(Math.abs(p.x - yard.x)).toBeLessThan(yard.footprint[0] / 2);
    expect(Math.abs(p.z - yard.z)).toBeLessThan(yard.footprint[1] / 2);
  });
});

describe('Harrowmark NPCs', () => {
  it('has a def for every spec and a post anchor for every spec', () => {
    expect(HARROWMARK_NPC_DEFS.map((d) => d.id).sort()).toEqual(HARROWMARK_NPCS.map((n) => n.id).sort());
    for (const n of HARROWMARK_NPCS) expect(anchors.has(n.post), n.id).toBe(true);
  });

  it('does not repeat a Brightwater NPC (Gaut, Stane, Aelfreda, Tobb move by rule)', () => {
    const ids = new Set(BRIGHTWATER_LAYOUT.npcs.map((n) => n.id));
    for (const n of HARROWMARK_NPCS) expect(ids.has(n.id), n.id).toBe(false);
  });

  it('holds Vey back until M08 and Ashdown until M07', () => {
    expect(HARROWMARK_NPCS.find((n) => n.id === 'vey')?.presentWhen).toBe('story.m08.started');
    expect(HARROWMARK_NPCS.find((n) => n.id === 'ashdown')?.presentWhen).toBe('story.m07.started');
  });

  it('keeps trainer spots 2.5 m in front of each Bastion post, and shop spots 3 m or more from talk posts', () => {
    for (const n of ['gaut', 'stane', 'pennard', 'gerta', 'ashdown']) {
      expect(dist(at(`harrowmark.bastion.trainer.${n}`), at(`npc-post.${n}.bastion`))).toBeCloseTo(2.5, 6);
    }
    const posts = HARROWMARK_LAYOUT.anchors.filter((a) => a.tags?.includes('npc-post'));
    for (const shop of HARROWMARK_LAYOUT.anchors.filter((a) => a.tags?.includes('shop'))) {
      for (const post of posts) expect(dist(shop, post), `${shop.id} / ${post.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves Gaut\'s South Gate post to thread 4 (npc-post.gaut.south-gate)', () => {
    expect(anchors.has('npc-post.gaut.gate')).toBe(false);
    expect(anchors.has('npc-post.gaut.south-gate')).toBe(false);
  });

  it('places Stane at the Bastion (the contract names npc-post.stane.bastion)', () => {
    const p = at('npc-post.stane.bastion');
    expect(Math.abs(p.x - 8175)).toBeLessThan(40);
    expect(Math.abs(p.z - 1745)).toBeLessThan(40);
  });
});

describe('Harrowmark routes', () => {
  it('keeps the Rooftop Ward inside the wall', () => {
    const half = WARD.size / 2;
    for (const [i, j] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
      const x = WARD.cx + (i - 1) * WARD.pitch + (i === 2 ? half : -half);
      const z = WARD.cz + (j - 1) * WARD.pitch + (j === 2 ? half : -half);
      expect(radiusOf(x, z)).toBeLessThanOrEqual(744);
    }
  });

  it('numbers chase nodes 0..15, each tagged run, vault, drop or gap, rooftop ones elevated', () => {
    expect(CHASE_M10).toHaveLength(16);
    CHASE_M10.forEach((n, i) => {
      const a = at(`chase.m10.${i}`);
      expect(a.tags).toContain(n.tag);
      expect(['run', 'vault', 'drop', 'gap']).toContain(n.tag);
      expect(a.tags?.includes('elevated')).toBe(!!n.roof);
    });
  });

  it('crosses only 3 m alleys between roofs, at most 0.5 m up (a walk-speed jump clears 1.05 m)', () => {
    const blocks = HARROWMARK_LAYOUT.structures.filter((s) => s.id.startsWith('ward.b'));
    expect(blocks).toHaveLength(9);
    for (const p of blocks) {
      for (const q of blocks) {
        if (p === q) continue;
        const dx = Math.abs(p.x - q.x) - WARD.size;
        const dz = Math.abs(p.z - q.z) - WARD.size;
        const adjacent = (Math.abs(p.x - q.x) === WARD.pitch && p.z === q.z) || (Math.abs(p.z - q.z) === WARD.pitch && p.x === q.x);
        if (adjacent) {
          expect(Math.max(dx, dz)).toBeCloseTo(3, 9);
          expect(Math.abs((p.height ?? 0) - (q.height ?? 0))).toBeLessThanOrEqual(0.5 + 1e-9);
        }
      }
    }
  });

  it('keeps every chase step reachable: ground steps under 180 m, roof hops under 100 m, the drop under 12 m', () => {
    for (let i = 1; i < CHASE_M10.length; i++) {
      const p = CHASE_M10[i - 1];
      const q = CHASE_M10[i];
      const d = dist(p, q);
      if (q.tag === 'drop' || p.tag === 'drop') expect(Math.abs((p.roof ?? 0) - (q.roof ?? 0))).toBeLessThanOrEqual(12);
      expect(d, `${i - 1}->${i}`).toBeLessThan(p.roof && q.roof ? 100 : 180);
    }
  });

  it('closes the patrols that loop and gives every patrol two or more points', () => {
    for (const p of HARROWMARK_LAYOUT.patrols) expect(p.points.length).toBeGreaterThanOrEqual(2);
    expect(HARROWMARK_LAYOUT.patrols.find((p) => p.id === 'patrol.m06.gate-square')?.loop).toBe(true);
    expect(HARROWMARK_LAYOUT.patrols.find((p) => p.id === 'harrowmark.patrol.gate-wall-walk')?.loop).toBe(false);
  });

  it('keeps hide spots 2 m clear of every patrol segment, and patrol and chase segments clear of solid footprints', () => {
    const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / l2));
      return dist(p, { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
    };
    const hides = HARROWMARK_LAYOUT.anchors.filter((q) => q.tags?.includes('hide') && !q.tags.includes('elevated'));
    const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode === 'solid');
    const routes = [
      ...HARROWMARK_LAYOUT.patrols.map((p) => ({ id: p.id, pts: p.points.map(at), loop: p.loop })),
      { id: 'chase-start', pts: CHASE_M10.slice(0, 5).map((n) => ({ x: n.x, z: n.z })), loop: false },
      { id: 'chase-end', pts: CHASE_M10.slice(13).map((n) => ({ x: n.x, z: n.z })), loop: false },
    ];
    for (const r of routes) {
      const n = r.loop ? r.pts.length : r.pts.length - 1;
      for (let i = 0; i < n; i++) {
        const p = r.pts[i];
        const q = r.pts[(i + 1) % r.pts.length];
        for (const h of hides) expect(segDist(h, p, q), `${r.id} ${i} vs ${h.id}`).toBeGreaterThanOrEqual(2);
        // sample the segment against solid footprints (roof legs are excluded above)
        for (let k = 0; k <= 20; k++) {
          const pt = { x: p.x + ((q.x - p.x) * k) / 20, z: p.z + ((q.z - p.z) * k) / 20 };
          for (const s of solids) expect(pointInFootprint(s, pt.x, pt.z, 0.4), `${r.id} ${i} through ${s.id}`).toBe(false);
        }
      }
    }
  });

  it('lays crowd lanes as ordered anchors, no gap over 90 m, away from stealth, patrol, hide and chase nodes', () => {
    expect(CROWD_LANES.length).toBe(10);
    const keep = HARROWMARK_LAYOUT.anchors.filter((a) => a.tags?.some((t) => ['hide', 'patrol', 'chase', 'stealth'].includes(t)) && !a.tags.includes('elevated'));
    for (const lane of CROWD_LANES) {
      expect(lane.points.length).toBeGreaterThanOrEqual(4);
      const pts = lane.points.map(at);
      for (let i = 1; i < pts.length; i++) expect(dist(pts[i - 1], pts[i]), lane.id).toBeLessThan(90);
      for (const p of pts) for (const k of keep) expect(dist(p, k), `${lane.id} ${p.id} vs ${k.id}`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('crowd lanes against the buildings', () => {
  const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode !== 'open' && !/^(wall|tower|plug|portcullis)\./.test(s.id));
  const sample = (lane: (typeof CROWD_LANES)[number]) => {
    const pts = lane.points.map(at);
    const out: Array<{ x: number; z: number }> = [];
    const n = lane.loop ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const steps = Math.max(1, Math.ceil(dist(p, q)));
      for (let k = 0; k <= steps; k++) out.push({ x: p.x + ((q.x - p.x) * k) / steps, z: p.z + ((q.z - p.z) * k) / steps });
    }
    return out;
  };

  it('keeps every lane, at its full half-width, clear of every solid footprint', () => {
    for (const lane of CROWD_LANES) {
      for (const pt of sample(lane)) {
        for (const s of solids) expect(pointInFootprint(s, pt.x, pt.z, lane.halfWidth), `${lane.id} at ${pt.x},${pt.z} vs ${s.id}`).toBe(false);
      }
    }
  });

  it('catches a lane that runs into a building', () => {
    const house = solids.find((s) => s.id === 'guild.alley-b')!;
    expect(pointInFootprint(house, 8940, 1527.5, 1.5)).toBe(true);
  });

  it('leaves the 3 m Rooftop Ward alleys at least 0.5 m either side of the lane', () => {
    const lane = CROWD_LANES.find((l) => l.id === 'harrowmark.lane.rooftop-ward-streets')!;
    expect(lane.halfWidth).toBeLessThanOrEqual(1.0);
  });

  it('tags the Keep-road braziers and every banner for the crowd keep-out', () => {
    const tagged = (prefix: string) => HARROWMARK_LAYOUT.anchors.filter((x) => x.id.startsWith(prefix));
    for (const x of tagged('harrowmark.brazier.keep-road.')) expect(x.tags).toContain('brazier');
    for (const x of tagged('harrowmark.banner.')) expect(x.tags).toContain('banner');
  });
});

describe('Rook at the South Gate', () => {
  it('stands outside the closed gate, near the threshold, clear of the gate-queue lane and the waystone stand point', () => {
    const rook = at('npc-post.rook.gate');
    const gate = at('harrowmark.gate.south');
    expect(rook.z).toBeLessThan(gate.z + 1); // on the road side, not inside the wall
    expect(dist(rook, at('harrowmark.gate.south.threshold'))).toBeLessThan(30);
    for (const id of ['harrowmark.gate.south.queue.1', 'harrowmark.gate.south.queue.2', 'harrowmark.gate.south.queue.3']) expect(dist(rook, at(id)), id).toBeGreaterThanOrEqual(4);
    expect(dist(rook, { x: 8516, z: 1212 })).toBeGreaterThanOrEqual(4);
    const lane = CROWD_LANES.find((l) => l.id === 'harrowmark.lane.gate-queue')!;
    for (const p of lane.points.map(at)) expect(dist(rook, p)).toBeGreaterThan(lane.halfWidth);
  });
});

describe('Harrowmark world-change anchors', () => {
  it('has 21 braziers along the Keep road, 4 Bastion and 6 Keep banners', () => {
    expect(HARROWMARK_LAYOUT.anchors.filter((a) => a.id.startsWith('harrowmark.brazier.keep-road.'))).toHaveLength(BRAZIER_COUNT);
    expect(HARROWMARK_LAYOUT.anchors.filter((a) => a.id.startsWith('harrowmark.banner.bastion.'))).toHaveLength(BANNER_COUNT.bastion);
    expect(HARROWMARK_LAYOUT.anchors.filter((a) => a.id.startsWith('harrowmark.banner.keep.'))).toHaveLength(BANNER_COUNT.keep);
  });

  it('starts the brazier line outside the fountain plaza (radius 45 around z 1700)', () => {
    const first = HARROWMARK_LAYOUT.anchors.filter((a) => a.id.startsWith('harrowmark.brazier.')).map((a) => a.z);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(1745);
  });
});
