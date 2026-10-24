import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Containment, DEAD_ROAD_CORRIDOR } from '../region/containment';
import { ACT2_CORRIDORS } from '../region/act2/act2World';
import { STACK_RADIUS } from '../region/act2/oldsmokeStacks';
import { footprintCorners, pointInFootprint } from '../region/geometry';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { DEEPGATE_PLATEAU, OLDSMOKE_PASS_POINTS, OLDSMOKE_STACKS } from '../terrain/shape/oldsmokePass';
import { roadLength, roadPoint } from '../terrain/shape/roadPoint';
import { footprintSpread } from '../cinderreach/siteFit';
import { furnaceCentre } from './furnaces';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';
import { BOX, EDGE, GATE, GATE_W, HALL_DOOR, MARKET, OLDSMOKE_KEEP_OUT, SHAFT } from './sites';
import { DEEPGATE_KINDS, registerOldsmokeKinds } from './structureKinds';

const anchor = (id: string) => OLDSMOKE_LAYOUT.anchors.find((x) => x.id === id);
const structure = (id: string) => OLDSMOKE_LAYOUT.structures.find((x) => x.id === id);

let unregister: () => void;
beforeAll(() => {
  unregister = registerOldsmokeKinds();
});
afterAll(() => unregister());

describe('the Oldsmoke layout', () => {
  it('validates with no errors', () => {
    expect(validateLayout(OLDSMOKE_LAYOUT, heightAt, { spawnId: null })).toEqual([]);
  });

  it('has unique ids and keeps off A1 and Act 1 ids', () => {
    const ids = [...OLDSMOKE_LAYOUT.anchors, ...OLDSMOKE_LAYOUT.triggers, ...OLDSMOKE_LAYOUT.structures].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/^(cinderroad|cinderreach|harrowmark|brightwater)\./);
  });

  it('names every anchor and trigger inside the prefixes the contracts give A4', () => {
    for (const a of OLDSMOKE_LAYOUT.anchors) expect(a.id, a.id).toMatch(/^(oldsmoke\.|waystone\.|npc-post\.)/);
    for (const t of OLDSMOKE_LAYOUT.triggers) expect(t.id, t.id).toMatch(/^trg\.oldsmoke\./);
  });

  it('defines the contract names A13, A9 and A6b build against', () => {
    for (const id of [
      'waystone.deepgate', 'waystone.weeping-bellows', 'oldsmoke.gate', 'oldsmoke.gate.guard.1', 'oldsmoke.gate.guard.2',
      'oldsmoke.market.centre', 'npc-post.slagg.market', 'npc-post.slagg.shaft', 'npc-post.pike.shaft', 'oldsmoke.hall.door', 'oldsmoke.hall.court',
      'oldsmoke.shaft.head', 'oldsmoke.shaft.lift.top', 'oldsmoke.shaft.door', 'oldsmoke.shaft.winch', 'oldsmoke.r10.hall.miners', 'oldsmoke.r10.hall.stewards',
      ...[1, 2, 3, 4].flatMap((n) => [`oldsmoke.pass.ambush.${n}`, `oldsmoke.market.guard.${n}`]),
      ...[1, 2, 3].flatMap((n) => [`oldsmoke.pass.search.${n}`, `oldsmoke.m16.brazier.${n}`, `oldsmoke.market.nest.${n}`, `oldsmoke.market.chest.${n}`, `oldsmoke.market.office.${n}`, `oldsmoke.shaft.winch.part.${n}`, `oldsmoke.furnace.${n}`]),
      ...[1, 2, 3, 4, 5, 6].map((n) => `oldsmoke.market.stall.${n}`),
    ]) expect(anchor(id), id).toBeTruthy();
    for (const id of ['trg.oldsmoke.gate', 'trg.oldsmoke.market', 'trg.oldsmoke.hall.forecourt', 'trg.oldsmoke.shaft']) {
      expect(OLDSMOKE_LAYOUT.triggers.find((t) => t.id === id), id).toBeTruthy();
    }
  });

  it('tags both waystones and nothing else with the waystone tag (the M16 brazier is not a waystone)', () => {
    const tagged = OLDSMOKE_LAYOUT.anchors.filter((a) => a.tags?.includes('waystone')).map((a) => a.id).sort();
    expect(tagged).toEqual(['waystone.deepgate', 'waystone.weeping-bellows']);
    for (const n of [1, 2, 3]) expect(anchor(`oldsmoke.m16.brazier.${n}`)!.tags).not.toContain('waystone');
    expect(anchor('waystone.grisel-brazier')).toBeUndefined();
  });

  it('puts every NPC post on an anchor and no NPC id twice', () => {
    for (const n of OLDSMOKE_LAYOUT.npcs) expect(anchor(n.post), n.id).toBeTruthy();
    const ids = OLDSMOKE_LAYOUT.npcs.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every anchor, trigger and structure inside the plateau box, on its flat ground', () => {
    const inside = (x: number, z: number) => x >= BOX.minX && x <= BOX.maxX && z >= BOX.minZ && z <= BOX.maxZ;
    for (const a of OLDSMOKE_LAYOUT.anchors) {
      if (a.id.startsWith('oldsmoke.pass.')) continue; // on the road
      expect(inside(a.x, a.z), a.id).toBe(true);
      expect(Math.abs(heightAt(a.x, a.z) - DEEPGATE_PLATEAU.height), a.id).toBeLessThan(0.6);
    }
    for (const t of OLDSMOKE_LAYOUT.triggers) expect(inside(t.x, t.z), t.id).toBe(true);
    for (const s of OLDSMOKE_LAYOUT.structures) {
      for (const [x, z] of footprintCorners(s)) expect(inside(x, z), s.id).toBe(true);
      expect(footprintSpread(heightAt, s.x, s.z, s.footprint[0], s.footprint[1]), s.id).toBeLessThanOrEqual(0.5);
    }
  });

  it('puts the gate on the road\'s last point, with the opening between the south wall runs', () => {
    const end = OLDSMOKE_PASS_POINTS[OLDSMOKE_PASS_POINTS.length - 1];
    expect(GATE.x).toBe(end[0]);
    const s1 = structure('oldsmoke-wall-s1')!;
    const s2 = structure('oldsmoke-wall-s2')!;
    expect(s1.x + s1.footprint[0] / 2).toBeCloseTo(GATE.x - GATE_W / 2, 6);
    expect(s2.x - s2.footprint[0] / 2).toBeCloseTo(GATE.x + GATE_W / 2, 6);
    expect(MARKET.x).toBe(GATE.x);
  });

  it('sets the hall door 3 m in front of the hall\'s south face and the shaft head inside the walls', () => {
    const hall = structure('oldsmoke-hall')!;
    expect(HALL_DOOR.z).toBeCloseTo(hall.z - hall.footprint[1] / 2 - 3, 6);
    expect(HALL_DOOR.x).toBe(hall.x);
    expect(SHAFT.x).toBeGreaterThan(EDGE.w);
    expect(SHAFT.z).toBeLessThan(EDGE.n);
  });

  it('puts the keep-out circles inside the plateau', () => {
    for (const k of OLDSMOKE_KEEP_OUT) expect(Math.hypot(k.x - (BOX.minX + BOX.maxX) / 2, k.z - (BOX.minZ + BOX.maxZ) / 2)).toBeLessThan(260);
  });
});

describe('A1\'s smoke stacks stay A1\'s', () => {
  it('draws no stack and no smoke: no structure kind or anchor names one', () => {
    for (const s of OLDSMOKE_LAYOUT.structures) expect(s.kind, s.id).not.toMatch(/stack|smoke|plume|chimney/i);
    for (const kind of Object.keys(DEEPGATE_KINDS)) expect(kind).not.toMatch(/stack|smoke|plume/i);
  });

  it('builds one furnace house at the foot of each of A1\'s three stacks', () => {
    const furnaces = OLDSMOKE_LAYOUT.structures.filter((s) => s.kind === 'deepgate-furnace');
    expect(furnaces).toHaveLength(OLDSMOKE_STACKS.length);
    OLDSMOKE_STACKS.forEach((st, i) => {
      expect(furnaces[i].x).toBe(furnaceCentre(i).x);
      const d = Math.hypot(furnaces[i].x - st.x, furnaces[i].z - st.z);
      expect(d).toBeGreaterThan(STACK_RADIUS + 5);
      expect(d).toBeLessThan(30);
    });
  });

  it('keeps every other blocking structure at least STACK_RADIUS + 2 from every stack, walls included', () => {
    for (const st of OLDSMOKE_STACKS) {
      for (const s of OLDSMOKE_LAYOUT.structures.filter((x) => x.mode !== 'open')) {
        expect(pointInFootprint(s, st.x, st.z, STACK_RADIUS + 2), `${s.id} near stack at ${st.x},${st.z}`).toBe(false);
      }
    }
  });

  it('puts the east wall clear of stack 3 (the corner the first plan put through it)', () => {
    const east = structure('oldsmoke-wall-e')!;
    const inner = east.x - east.footprint[0] / 2;
    const stack3 = OLDSMOKE_STACKS[2];
    expect(inner - stack3.x).toBeGreaterThanOrEqual(STACK_RADIUS + 2);
    expect(stack3.x).toBeLessThan(inner);
  });
});

describe('Deepgate containment', () => {
  const state = (d03: boolean) => ({ getFlag: (k: string) => (k === 'story.gate.a2' || (d03 && k === 'story.d03.complete') ? true : undefined) }) as never;
  const open = new Containment(state(true), [DEAD_ROAD_CORRIDOR, ...ACT2_CORRIDORS]);

  it('has every anchor, trigger and structure centre in the open area once D03 is done', () => {
    for (const a of OLDSMOKE_LAYOUT.anchors) expect(open.isOpen(a.x, a.z), a.id).toBe(true);
    for (const t of OLDSMOKE_LAYOUT.triggers) expect(open.isOpen(t.x, t.z), t.id).toBe(true);
    for (const k of OLDSMOKE_KEEP_OUT) expect(open.isOpen(k.x, k.z), k.id).toBe(true);
  });

  it('keeps Deepgate shut before D03 is done', () => {
    const shut = new Containment(state(false), [DEAD_ROAD_CORRIDOR, ...ACT2_CORRIDORS]);
    expect(shut.isOpen(GATE.x, GATE.z + 20)).toBe(false);
    expect(shut.isOpen(SHAFT.x, SHAFT.z)).toBe(false);
  });

  it('keeps the whole pass road from Cinderford to the gate open', () => {
    for (let s = 0; s <= roadLength('oldsmoke-pass'); s += 50) {
      const p = roadPoint('oldsmoke-pass', s, 0);
      expect(open.isOpen(p.x, p.z), `pass ${s}`).toBe(true);
    }
  });

  it('puts both waystones 15 m clear of the open area\'s edge, so a safe teleport keeps them', () => {
    for (const id of ['waystone.deepgate', 'waystone.weeping-bellows']) {
      const a = anchor(id)!;
      for (const [dx, dz] of [[15, 0], [-15, 0], [0, 15], [0, -15]]) expect(open.isOpen(a.x + dx, a.z + dz), id).toBe(true);
    }
  });
});
