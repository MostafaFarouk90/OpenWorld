// Harrowmark in Act 4 (L2): the layout's new anchors and cast, the ash state, R20's huts and the Act 4 posts.
import { describe, expect, it } from 'vitest';
import { classOf } from '../../env/PlacementField';
import { glowRegistry } from '../../env/glowSources';
import { TILES } from '../../env/tiles';
import { POST_RULES, resolvePosts } from '../../quests/posts';
import type { ConditionEnv } from '../../quests/ports';
import type { FlagValue, QuestState } from '../../quests/types';
import { pointInFootprint } from '../../region/geometry';
import { createFakeCore } from '../../region/testing/fakeCore';
import { CENTER, gateBearing, GATE_NAMES, gatePosition, RING_RADIUS } from '../city';
import { DOORS, HARROWMARK_LAYOUT } from '../harrowmark.layout';
import { HARROWMARK_NPC_DEFS, HARROWMARK_NPC_STRINGS_EN } from '../npcDefs';
import { validateCity } from '../validateCity';
import { ACT4_LAYOUT_HM, ACT4_POSTS, guardSpots, postAnchor } from './act4.layout';
import { buildAshState, checkpointStructures, POSTER_COUNT, posterSpots, SOOT_COUNT } from './ashState';
import { ACT4_NPC_DEFS } from './npcDefs';
import { ACT4_CITY, ACT4_POST_ROWS, withAct4Posts } from './postRules';
import { buildR20Huts, hutLook, hutStructures } from './r20Huts';
import {
  A4_FLAG,
  CHECKPOINTS,
  CRUCIBLE_DOOR,
  GATE_FACE_HALF_LENGTH,
  GATE_FACE_PUSH_DEPTH,
  gateFaceAnchor,
  OCCUPIED_FLAG,
  R20_HUTS,
  RING_FACE_RADIUS,
  WORKING_GATES,
} from './sites';

const props = Object.values(TILES).flat().filter((r) => classOf(r.id) !== 'ground');
const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode !== 'open');
const radius = (x: number, z: number) => Math.hypot(x - CENTER.x, z - CENTER.z);

/** A rapier stand-in for buildCity (the fake core's physics records the colliders). */
const fakeRapier = {
  ColliderDesc: {
    cuboid: () => {
      const d = { setTranslation: () => d, setRotation: () => d };
      return d;
    },
  },
} as never;

describe('Act 4 layout', () => {
  it('validates with the rest of the city', () => {
    expect(validateCity(HARROWMARK_LAYOUT, { doors: DOORS })).toEqual([]);
  });

  it('stands every Act 4 anchor clear of structures (0.5 m), environment props (1.5 m) and the shipped anchors (0.5 m)', () => {
    const mine = new Set(ACT4_LAYOUT_HM.anchors.map((a) => a.id));
    for (const a of ACT4_LAYOUT_HM.anchors) {
      for (const s of solids) expect(pointInFootprint(s, a.x, a.z, 0.5), `${a.id} in ${s.id}`).toBe(false);
      for (const r of props) expect(Math.hypot(r.x - a.x, r.z - a.z), `${a.id} near ${r.id}`).toBeGreaterThanOrEqual(1.5);
      for (const b of HARROWMARK_LAYOUT.anchors) if (!mine.has(b.id)) expect(Math.hypot(b.x - a.x, b.z - a.z), `${a.id} on ${b.id}`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('puts the Crucible door inside the Smelter gate and every working gate a face 15 m outside it', () => {
    const smelter = gatePosition('smelter', 732);
    expect(Math.hypot(CRUCIBLE_DOOR.x - smelter.x, CRUCIBLE_DOOR.z - smelter.z)).toBeLessThan(0.01);
    expect(radius(CRUCIBLE_DOOR.x, CRUCIBLE_DOOR.z)).toBeLessThan(RING_RADIUS);
    for (const g of WORKING_GATES) {
      const a = ACT4_LAYOUT_HM.anchors.find((x) => x.id === gateFaceAnchor(g))!;
      expect(a, g).toBeDefined();
      expect(radius(a.x, a.z)).toBeCloseTo(RING_FACE_RADIUS, 1);
    }
    // L1's track round the walls runs about 45 m out: a face never pushes that far.
    expect(RING_FACE_RADIUS - RING_RADIUS + GATE_FACE_PUSH_DEPTH).toBeLessThan(45);
    expect(GATE_FACE_HALF_LENGTH).toBeLessThanOrEqual(10);
  });

  it('keeps the checkpoint rails and braziers off every structure and prop, each leaving a 3 m pass', () => {
    for (const s of checkpointStructures()) {
      const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
        const h = (s.yawDeg * Math.PI) / 180;
        const lx = (sx * s.footprint[0]) / 2;
        const lz = (sz * s.footprint[1]) / 2;
        return { x: s.x + lx * Math.cos(h) + lz * Math.sin(h), z: s.z - lx * Math.sin(h) + lz * Math.cos(h) };
      }));
      for (const c of [...corners, { x: s.x, z: s.z }]) {
        for (const t of solids) expect(pointInFootprint(t, c.x, c.z, 0.3), `${s.id} in ${t.id}`).toBe(false);
      }
      for (const r of props) expect(Math.hypot(r.x - s.x, r.z - s.z), `${s.id} near ${r.id}`).toBeGreaterThanOrEqual(1.5);
    }
    for (const c of CHECKPOINTS) {
      const rails = checkpointStructures().filter((s) => s.id.startsWith(`a4cp.${c.id}.rail`));
      expect(rails).toHaveLength(2);
      const gap = Math.hypot(rails[0]!.x - rails[1]!.x, rails[0]!.z - rails[1]!.z) - rails[0]!.footprint[0];
      expect(gap).toBeGreaterThan(2.9);
      expect(gap).toBeLessThan(3.1);
      // Its guards stand past the rail ends, not in the pass.
      for (const g of guardSpots(c)) expect(Math.hypot(g.x - c.x, g.z - c.z)).toBeGreaterThan(4);
    }
  });

  it('hangs the posters on the Keep road house fronts', () => {
    const spots = posterSpots();
    expect(spots).toHaveLength(POSTER_COUNT);
    for (const p of spots) {
      const host = solids.find((s) => s.id.startsWith('keep-road.') && pointInFootprint(s, p.x + (p.facing === 90 ? -0.2 : 0.2), p.z, 0));
      expect(host, `${p.x},${p.z}`).toBeDefined();
      expect(solids.some((s) => pointInFootprint(s, p.x, p.z, 0)), `${p.x},${p.z} inside a wall`).toBe(false);
    }
  });

  it('places R20\'s huts in the farm-ring outside the River Gate, beyond L1\'s wall track', () => {
    for (const h of R20_HUTS) expect(radius(h.x, h.z)).toBeGreaterThan(840);
    // Off the convoy road (the River Gate's bearing line), so an escort or cart on it never paths round a hut.
    const b = (gateBearing(GATE_NAMES.indexOf('river')) * Math.PI) / 180;
    for (const h of R20_HUTS) expect(Math.abs((h.x - CENTER.x) * Math.cos(b) - (h.z - CENTER.z) * Math.sin(b))).toBeGreaterThanOrEqual(10);
  });
});

describe('the Act 4 cast', () => {
  it('has a def, a name and a post for every new NPC, present from Act 4 until the city is Vey\'s', () => {
    const defs = new Set(HARROWMARK_NPC_DEFS.map((d) => d.id));
    for (const d of ACT4_NPC_DEFS) {
      expect(defs.has(d.id)).toBe(true);
      expect(HARROWMARK_NPC_STRINGS_EN[d.nameKey], d.id).toBeTruthy();
      const spec = ACT4_LAYOUT_HM.npcs.find((n) => n.id === d.id);
      expect(spec, d.id).toBeDefined();
      expect(spec!.presentWhen).toBe(A4_FLAG);
      expect(spec!.absentWhen).toBe(OCCUPIED_FLAG);
    }
    expect(ACT4_NPC_DEFS.filter((d) => d.id.startsWith('vey-guard-'))).toHaveLength(CHECKPOINTS.length * 2);
  });

  it('introduces no NPC id twice across the city', () => {
    const ids = HARROWMARK_LAYOUT.npcs.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Act 4 posts', () => {
  const env = (flags: Record<string, FlagValue>, quests: Record<string, QuestState> = {}): ConditionEnv => ({
    state: { getFlag: (k: string) => flags[k] } as never,
    quests: { state: (id: string) => quests[id] ?? 'locked', objectiveDone: () => false } as never,
  });
  const shipped = (() => {
    // The shipped rules alone: strip the Act 4 rows back out.
    const rows = new Set(ACT4_POST_ROWS.flatMap((r) => r.posts));
    return POST_RULES.map((r) => ({ ...r, posts: r.posts.filter((p) => !rows.has(p)) })).filter((r) => r.posts.length > 0 || !ACT4_POST_ROWS.some((x) => x.npcId === r.npcId && x.home === r.home));
  })();

  it('changes no post before Act 4 or after M38', () => {
    for (const flags of [{}, { 'story.gate.a3': true }, { [A4_FLAG]: true, [OCCUPIED_FLAG]: true }] as Record<string, FlagValue>[]) {
      const a = resolvePosts(POST_RULES, env(flags));
      const b = resolvePosts(shipped, env(flags));
      for (const [id, post] of Object.entries(b)) expect(a[id], `${id} ${JSON.stringify(flags)}`).toEqual(post);
    }
  });

  it('moves each named NPC to its Act 4 post in the city, Wystan to the Bastion during R19 and Edric to the chamber during M38', () => {
    const r = resolvePosts(POST_RULES, env({ [A4_FLAG]: true }));
    expect(r.wystan!.anchorId).toBe(postAnchor('wystan'));
    expect(r.merrin!.anchorId).toBe(postAnchor('merrin'));
    expect(r.wenna!.anchorId).toBe(postAnchor('wenna'));
    expect(r.edric!.anchorId).toBe(postAnchor('edric'));
    expect(r['grisel-steward']!.anchorId).toBe(postAnchor('grisel-steward'));
    expect(resolvePosts(POST_RULES, env({ [A4_FLAG]: true }, { r19: 'active' })).wystan!.anchorId).toBe(postAnchor('wystan.bastion'));
    expect(resolvePosts(POST_RULES, env({ [A4_FLAG]: true }, { m38: 'active' })).edric!.anchorId).toBe('harrowmark.a4.chamber.seat.edric');
  });

  it('puts the Act 4 rows first and keeps every shipped row in order; an NPC without a rule gets one', () => {
    const rules = withAct4Posts([{ npcId: 'merrin', home: 'h', posts: [{ when: { flag: 'x' }, anchorId: 'a' }] }]);
    const merrin = rules.find((r) => r.npcId === 'merrin')!;
    expect(merrin.posts.at(-1)).toEqual({ when: { flag: 'x' }, anchorId: 'a' });
    expect(merrin.posts[0]!.when).toBe(ACT4_CITY);
    expect(rules.find((r) => r.npcId === 'wystan')!.home).toBe('npc-post.wystan');
    expect(rules.filter((r) => r.npcId === 'merrin')).toHaveLength(1);
  });

  it('names a defined anchor for every Act 4 post', () => {
    const ids = new Set(HARROWMARK_LAYOUT.anchors.map((a) => a.id));
    for (const row of ACT4_POST_ROWS) for (const p of row.posts) if (!p.anchorId.startsWith('harrowmark.a4.chamber.')) expect(ids.has(p.anchorId), p.anchorId).toBe(true);
    for (const id of Object.keys(ACT4_POSTS)) expect(ids.has(postAnchor(id as keyof typeof ACT4_POSTS))).toBe(true);
  });
});

describe('the ash state', () => {
  const setup = (flag?: boolean) => {
    const fc = createFakeCore();
    if (flag !== undefined) fc.flags.set(A4_FLAG, flag);
    const before = glowRegistry.list().length;
    const ash = buildAshState(fc.ctx, fakeRapier, () => 20);
    return { fc, ash, before };
  };
  const roots = (fc: ReturnType<typeof createFakeCore>) => fc.scene.children.filter((c) => c.name === 'harrowmark-ash-state' || c.name === 'harrowmark-city');

  it('builds nothing before Act 4', () => {
    const { fc, ash } = setup();
    expect(ash.active).toBe(false);
    expect(roots(fc)).toHaveLength(0);
  });

  it('raises the checkpoints, posters and soot when Act 4 opens, with a collider per rail, and registers no light', () => {
    const { fc, ash, before } = setup();
    fc.ctx.state.setFlag(A4_FLAG, true);
    expect(ash.counts()).toEqual({ checkpoints: CHECKPOINTS.length, rails: CHECKPOINTS.length * 2, posters: POSTER_COUNT, soot: SOOT_COUNT });
    expect(fc.colliders.size).toBe(CHECKPOINTS.length * 2);
    expect(glowRegistry.list().length).toBe(before);
    fc.ctx.state.setFlag(A4_FLAG, false);
    expect(ash.active).toBe(false);
    expect(fc.colliders.size).toBe(0);
    expect(roots(fc)).toHaveLength(0);
  });

  it('is built on init for an Act 4 save, re-derives on load either way, and does not stack', () => {
    const { fc, ash } = setup(true);
    expect(ash.active).toBe(true);
    fc.fire('save.loaded');
    fc.ctx.state.setFlag(A4_FLAG, true);
    expect(roots(fc)).toHaveLength(2);
    fc.flags.set(A4_FLAG, false);
    fc.fire('save.loaded');
    expect(ash.active).toBe(false);
    ash.dispose();
    expect(roots(fc)).toHaveLength(0);
  });

  it('builds visuals only (no colliders) without a physics engine', () => {
    const fc = createFakeCore();
    fc.flags.set(A4_FLAG, true);
    const ash = buildAshState(fc.ctx, null, () => 0);
    expect(ash.counts().rails).toBe(0);
    expect(ash.counts().posters).toBe(POSTER_COUNT);
    ash.dispose();
  });
});

describe('R20\'s huts', () => {
  it('reads the look from the flags', () => {
    expect(hutLook(false, 'force')).toBe('none');
    expect(hutLook(true, undefined)).toBe('standing');
    expect(hutLook(true, 'bribe')).toBe('standing');
    expect(hutLook(true, 'stealth')).toBe('standing');
    expect(hutLook(true, 'force')).toBe('burned');
    expect(hutStructures('none')).toEqual([]);
    expect(hutStructures('burned').every((s) => s.height! < 2)).toBe(true);
  });

  it('stands before R20, burns on force, and re-derives on a load either way', () => {
    const fc = createFakeCore();
    const huts = buildR20Huts(fc.ctx, fakeRapier, () => 0);
    expect(huts.look()).toBe('none');
    fc.ctx.state.setFlag(A4_FLAG, true);
    expect(huts.look()).toBe('standing');
    fc.ctx.state.setFlag('story.r20.choice', 'force');
    expect(huts.look()).toBe('burned');
    fc.flags.set('story.r20.choice', 'stealth');
    fc.fire('save.loaded');
    expect(huts.look()).toBe('standing');
    fc.flags.set(A4_FLAG, false);
    fc.fire('save.loaded');
    expect(huts.look()).toBe('none');
    huts.dispose();
    expect(fc.colliders.size).toBe(0);
  });
});

describe('the occupied city: the absent table, the ring polygon and the dark stones', () => {
  it('OCCUPIED_ABSENT is exactly the shipped NPCs whose every post is inside the walls, less vendors, trainers and companions', async () => {
    const { OCCUPIED_ABSENT } = await import('./absent');
    const { VENDORS } = await import('../../economy/stock');
    const { DEFAULT_KITS } = await import('../../classes/kits');
    const { COMPANION_IDS } = await import('../../companions/ids');
    const { insideRingWall } = await import('../noStrand');
    const exempt = new Set<string>([...Object.keys(VENDORS), ...Object.values(DEFAULT_KITS).map((k) => k.trainer.npcId), ...COMPANION_IDS]);
    const at = new Map(HARROWMARK_LAYOUT.anchors.map((x) => [x.id, x]));
    const newCast = new Set(ACT4_LAYOUT_HM.npcs.map((n) => n.id));
    const expected = HARROWMARK_LAYOUT.npcs
      .filter((n) => !newCast.has(n.id) && !exempt.has(n.id))
      .filter((n) => {
        const ids = [n.post, ...POST_RULES.filter((r) => r.npcId === n.id).flatMap((r) => [r.home, ...r.posts.map((p) => p.anchorId)])];
        return ids.every((id) => {
          const p = at.get(id);
          return p !== undefined && insideRingWall(p.x, p.z);
        });
      })
      .map((n) => n.id);
    expect([...OCCUPIED_ABSENT].sort()).toEqual(expected.sort());
    for (const n of HARROWMARK_LAYOUT.npcs) {
      const flags = n.absentWhen === undefined ? [] : ([] as string[]).concat(n.absentWhen);
      expect(flags.includes(OCCUPIED_FLAG), n.id).toBe(OCCUPIED_ABSENT.includes(n.id) || newCast.has(n.id));
    }
  });

  it('withOccupiedAbsent keeps an NPC\'s own absent flag, adds the occupied one once, and leaves others alone', async () => {
    const { withOccupiedAbsent } = await import('./absent');
    const out = withOccupiedAbsent([{ id: 'a', post: 'p', absentWhen: 'x' }, { id: 'b', post: 'p' }, { id: 'c', post: 'p', absentWhen: [OCCUPIED_FLAG] }], ['a', 'c']);
    expect(out[0]!.absentWhen).toEqual(['x', OCCUPIED_FLAG]);
    expect(out[1]!.absentWhen).toBeUndefined();
    expect(out[2]!.absentWhen).toEqual([OCCUPIED_FLAG]);
  });

  it('the ring wall polygon: the passages and the wall\'s outer face are inside; faces, huts, the deep run exit and 760 m are outside', async () => {
    const { insideRingWall } = await import('../noStrand');
    const { insideRingPolygon } = await import('./ringWall');
    const { DEEP_RUN_EXIT } = await import('./sites');
    for (const g of ['south', 'river', 'northwest', 'northeast', 'smelter'] as const) {
      expect(insideRingWall(gatePosition(g, 752).x, gatePosition(g, 752).z), g).toBe(true);
      expect(insideRingWall(gatePosition(g, 765).x, gatePosition(g, 765).z), g).toBe(false);
    }
    // Between chords (a vertex bearing) and on a chord's midpoint.
    for (let k = 0; k < 56; k++) {
      for (const half of [0, 0.5]) {
        const b = ((180 + (k - half) * (360 / 56)) * Math.PI) / 180;
        const p = (r: number) => ({ x: CENTER.x + r * Math.sin(b), z: CENTER.z + r * Math.cos(b) });
        expect(insideRingPolygon(p(755).x, p(755).z)).toBe(true);
        expect(insideRingWall(p(760).x, p(760).z)).toBe(false);
      }
    }
    for (const h of R20_HUTS) expect(insideRingWall(h.x, h.z)).toBe(false);
    expect(insideRingWall(DEEP_RUN_EXIT.x, DEEP_RUN_EXIT.z)).toBe(false);
    expect(insideRingWall(CENTER.x, CENTER.z)).toBe(true);
  });

  it('the city stones go dark from M38 and come back on a load without it (L0\'s rule, my polygon)', async () => {
    const { stoneIsDark } = await import('../noStrand');
    const gate = HARROWMARK_LAYOUT.anchors.find((x) => x.id === 'harrowmark.square.fountain') ?? { x: CENTER.x, z: CENTER.z };
    const flags: Record<string, boolean> = {};
    const r = { getFlag: (k: string) => flags[k] };
    expect(stoneIsDark('harrowmark-gate', undefined, r)).toBe(false);
    expect(stoneIsDark('some-city-stone', gate, r)).toBe(false);
    flags[OCCUPIED_FLAG] = true;
    expect(stoneIsDark('harrowmark-gate', undefined, r)).toBe(true);
    expect(stoneIsDark('some-city-stone', gate, r)).toBe(true);
    expect(stoneIsDark('farm-stone', R20_HUTS[0], r)).toBe(false);
  });
});

describe('the Act 4 cast\'s bodies', () => {
  it('maps every checkpoint guard to the guard body (the townsfolk table names them by checkpoint id)', async () => {
    const { TOWNSFOLK_BODIES } = await import('../../npcs/townsfolkBodies');
    for (const d of ACT4_NPC_DEFS.filter((x) => x.id.startsWith('vey-guard-'))) expect(TOWNSFOLK_BODIES[d.id], d.id).toBe('town-guard-a');
    expect(Object.keys(TOWNSFOLK_BODIES).filter((k) => k.startsWith('vey-guard-'))).toHaveLength(CHECKPOINTS.length * 2);
  });
});
