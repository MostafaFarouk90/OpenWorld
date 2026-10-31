// The summit (PR 2) on stand-in ground: the places are on their plateaus with the plan's ids, south of z 16900 and inside the
// summit box where they belong, the launch runs are clear, the walker catch's rules (both sides, the stand-down), the readers,
// and the failure paths (a missing K1 export, a too-small pad).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Act3GlideLedgeId } from '../region/act3/act3Glide';
import { ACT3_WORLD_LAYOUT } from '../region/act3/act3World.layout';
import { SUMMIT_BOX, areaAt } from '../region/areas';
import { footprintCorners } from '../region/geometry';
import { validateLayout } from '../region/validateLayout';
import { isKnownStructureKind } from '../region/structureKinds';
import { AERIE_GATE_W } from './aerie';
import { CATCH_ABOVE, CATCH_AERIE_ANCHOR, CATCH_BACK, busyElsewhere, onAerieOf, returnPoint, volumeCorners, CATCH_FADE_IN, CATCH_FADE_OUT, CATCH_HOLD, CATCH_LIP_ANCHOR, WalkerCatch, catchTarget, catchVolumes, inAnyVolume, standsDown, type CatchPorts } from './chasmCatch';
import { buildKeepDef } from './frostfangKeep';
import { DECK, STAND_BACK } from './glideLedges';
import { padFromRecord } from './inputs';
import { buildDragonspine, type DragonspineBuild } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { GLIDE_LEDGE_IDS, RUN_HALF_WIDTH, segDist } from './summitSites';
import { shiftedInputs, stubInputs } from './testing/fixture';
import { shownToggles, type FlagReader } from './worldChanges';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const inp = stubInputs();
const b: DragonspineBuild = buildDragonspine(inp);
const anchor = (id: string) => {
  const a = b.layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const plateau = (id: string) => inp.plateaus.find((p) => p.id === id)!.box;
const inBox = (box: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, pad = 0) => x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const summitSpecs = () => [...b.gate.specs, ...b.hearth.specs, ...b.roost.specs, ...b.skyhold.specs, ...b.aerie.specs, ...b.glide.specs];

/** The ids the plan's PR 2 section names (and K7, K8, K9, K13 build against). */
const TABLE: string[] = [
  'dragonspine.summit-gate', 'dragonspine.summit-gate.eadgyth',
  'dragonspine.hearth.shrine', 'waystone.wyrms-hearth', 'dragonspine.hearth.keeper-stone', 'dragonspine.hearth.hoard', 'dragonspine.hearth.axe',
  ...range(3).map((n) => `dragonspine.hearth.hoard.search.${n}`), ...range(4).map((n) => `dragonspine.hearth.carving.${n}`), ...range(2).map((n) => `dragonspine.hearth.glide-marker.${n}`),
  'dragonspine.hearth.ysmeryth.perch', 'dragonspine.hearth.ysmeryth.land', 'dragonspine.hearth.ysmeryth.reveal', 'dragonspine.hearth.ysmeryth.oath', 'dragonspine.hearth.eadgyth', ...range(3).map((n) => `dragonspine.hearth.companion.${n}`),
  'dragonspine.roost.trailhead', 'dragonspine.roost.arena.centre', ...range(3).map((n) => `dragonspine.roost.leap.${n}`), ...range(3).map((n) => `dragonspine.roost.leap.${n}.launch`),
  'dragonspine.roost.claw-ledge', 'dragonspine.roost.horn', 'dragonspine.roost.scale', 'dragonspine.roost.ysmeryth.land', ...range(4).map((n) => `dragonspine.spawn.roost.hawk-${n}`),
  'dragonspine.skyhold.camp', ...range(5).map((n) => `dragonspine.skyhold.search.${n}`), ...range(6).map((n) => `dragonspine.skyhold.net-anchor.${n}`),
  ...range(4).map((n) => `dragonspine.spawn.skyhold.pack-a-${n}`), ...range(4).map((n) => `dragonspine.spawn.skyhold.pack-b-${n}`), 'dragonspine.skyhold.flight.escape', 'dragonspine.skyhold.thorgar',
  'waystone.frostfang-aerie', 'dragonspine.aerie.landing', 'dragonspine.aerie.gate', 'dragonspine.aerie.gate.winch', 'dragonspine.aerie.keep.door', 'dragonspine.aerie.arena.centre',
  ...range(4).map((n) => `dragonspine.aerie.arena.edge.${n}`), ...range(4).map((n) => `dragonspine.aerie.arena.wall.${n}`), 'dragonspine.aerie.hawk-cage', 'dragonspine.aerie.chain-post', 'dragonspine.aerie.search.1', 'dragonspine.aerie.search.2',
  ...range(8).map((n) => `dragonspine.spawn.aerie.hunter-${n}`), ...range(4).map((n) => `dragonspine.spawn.aerie.harpooner-${n}`),
  ...GLIDE_LEDGE_IDS.flatMap((id) => [`dragonspine.glide.${id}.launch`, `dragonspine.glide.${id}.landing`]),
  ...range(6).map((n) => `npc-post.lodge-hunter-${n}.out`), 'dragonspine.lodge.banner',
];

describe('the summit on stand-in ground', () => {
  it('validates with the lower slopes, every id once', () => {
    expect(validateLayout(b.layout, inp.heightAt, { spawnId: null })).toEqual([]);
    const ids = b.layout.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defines every id the plan names, with owned prefixes, and none of K1\'s', () => {
    const have = new Set(b.layout.anchors.map((a) => a.id));
    expect(TABLE.filter((id) => !have.has(id))).toEqual([]);
    const k1 = new Set([...ACT3_WORLD_LAYOUT.anchors, ...ACT3_WORLD_LAYOUT.triggers, ...ACT3_WORLD_LAYOUT.structures].map((x) => x.id));
    for (const id of TABLE) {
      expect(/^(dragonspine\.|waystone\.|npc-post\.)/.test(id), id).toBe(true);
      expect(k1.has(id), id).toBe(false);
    }
    for (const v of b.catchVolumes) expect(v.id.startsWith('trg.dragonspine.catch.'), v.id).toBe(true);
    for (const t of b.toggles) expect(t.spec.id.startsWith('dragonspine-'), t.spec.id).toBe(true);
  });

  it('uses exactly K1\'s six glide ledge ids, launch facing K1\'s heading, on a deck whose top is a flat stand about 3 m deep behind the lip', () => {
    const ids = b.layout.anchors.filter((a) => a.id.startsWith('dragonspine.glide.') && a.id.endsWith('.launch')).map((a) => a.id.split('.')[2]);
    expect(ids.sort()).toEqual([...(Object.keys(inp.glideLedges) as Act3GlideLedgeId[])].sort());
    for (const id of GLIDE_LEDGE_IDS) {
      const l = inp.glideLedges[id]!;
      const a = anchor(`dragonspine.glide.${id}.launch`);
      expect([a.x, a.z]).toEqual([l.ledge.x, l.ledge.z]);
      // Anchor yaw (degrees, 0 faces -Z) is K1's heading.
      const d = (((a.yawDeg - (l.heading * 180) / Math.PI) % 360) + 540) % 360 - 180;
      expect(Math.abs(d), id).toBeLessThan(0.01);
      const deck = b.layout.structures.find((s) => s.id === `dragonspine-glide-${id}-deck`)!;
      expect(a.onStructure).toBe(deck.id);
      expect(DECK.d - DECK.past).toBeGreaterThanOrEqual(STAND_BACK);
      // The lip is on the deck and the deck runs STAND_BACK behind it.
      const f = { x: -Math.sin(l.heading), z: -Math.cos(l.heading) };
      const back = { x: l.ledge.x - f.x * STAND_BACK, z: l.ledge.z - f.z * STAND_BACK };
      const inDeck = (p: { x: number; z: number }) => {
        const c = footprintCorners(deck);
        const xs = c.map((q) => q[0]);
        const zs = c.map((q) => q[1]);
        return p.x >= Math.min(...xs) - 0.01 && p.x <= Math.max(...xs) + 0.01 && p.z >= Math.min(...zs) - 0.01 && p.z <= Math.max(...zs) + 0.01;
      };
      expect(inDeck(back), id).toBe(true);
      expect(b.glide.deckTop[id]).toBeGreaterThanOrEqual(inp.heightAt(l.ledge.x, l.ledge.z));
      const land = l.landingAreas[0]!;
      const la = anchor(`dragonspine.glide.${id}.landing`);
      expect(la.x >= land.x0 && la.x <= land.x1 && la.z >= land.z0 && la.z <= land.z1, id).toBe(true);
    }
  });

  it('keeps every structure of the folder (layout and toggles) out of K1\'s 60 m launch runs', () => {
    expect(inp.launchRun).toBe(60);
    const all = [...b.layout.structures.filter((s) => !s.id.endsWith('-deck')), ...b.toggles.map((t) => t.spec)];
    for (const run of b.summit.runs) {
      expect(Math.hypot(run.to.x - run.from.x, run.to.z - run.from.z)).toBeCloseTo(60, 6);
      for (const s of all) {
        const pts = [[s.x, s.z] as [number, number], ...footprintCorners(s)];
        for (const [x, z] of pts) expect(segDist({ x, z }, run.from, run.to), `${s.id} in the ${run.id} run`).toBeGreaterThanOrEqual(RUN_HALF_WIDTH - 0.01);
      }
    }
  });

  it('puts every place on its plateau', () => {
    const on = (prefix: string, id: string, pad = 0) => {
      const hits = b.layout.anchors.filter((x) => x.id.startsWith(prefix));
      expect(hits.length, prefix).toBeGreaterThan(0);
      for (const a of hits) expect(inBox(plateau(id), a.x, a.z, pad), a.id).toBe(true);
    };
    on('dragonspine.summit-gate', 'summit-gate');
    on('dragonspine.hearth.', 'wyrms-hearth');
    on('waystone.wyrms-hearth', 'wyrms-hearth');
    on('dragonspine.roost.arena', 'dragon-roost');
    on('dragonspine.roost.scale', 'dragon-roost');
    on('dragonspine.roost.trailhead', 'wyrms-hearth');
    on('dragonspine.skyhold.camp', 'skyhold-top');
    on('dragonspine.skyhold.search.', 'skyhold-top');
    on('dragonspine.aerie.', 'frostfang-aerie');
    on('waystone.frostfang-aerie', 'frostfang-aerie');
    for (const s of b.gate.specs) expect(inBox(plateau('summit-gate'), s.x, s.z), s.id).toBe(true);
    for (const s of b.aerie.specs) for (const [x, z] of footprintCorners(s)) expect(inBox(plateau('frostfang-aerie'), x, z, 4), s.id).toBe(true);
    expect(anchor('dragonspine.roost.arena.centre')).toMatchObject({ x: (plateau('dragon-roost').minX + plateau('dragon-roost').maxX) / 2, z: (plateau('dragon-roost').minZ + plateau('dragon-roost').maxZ) / 2 });
    expect(anchor('dragonspine.hearth.shrine')).toMatchObject({ x: b.summit.hearth.cx, z: b.summit.hearth.cz });
    expect(anchor('waystone.frostfang-aerie')).toMatchObject({ x: inp.aerieWaystone.x, z: inp.aerieWaystone.z });
  });

  it('keeps the summit and the Aerie south of z 16900 and, past the gate, inside SUMMIT_BOX (area dragonspine-summit)', () => {
    const summitIds = (id: string) => /^(dragonspine\.(hearth|roost|skyhold|aerie)|waystone\.(wyrms-hearth|frostfang-aerie)|dragonspine\.spawn\.(roost|skyhold|aerie))/.test(id);
    for (const a of b.layout.anchors) expect(a.z, a.id).toBeLessThan(16900);
    for (const s of [...summitSpecs(), ...b.toggles.map((t) => t.spec)]) expect(s.z, s.id).toBeLessThan(16900);
    for (const a of b.layout.anchors.filter((x) => summitIds(x.id))) {
      expect(a.x >= SUMMIT_BOX.x0 && a.x < SUMMIT_BOX.x1 && a.z >= SUMMIT_BOX.z0 && a.z < SUMMIT_BOX.z1, a.id).toBe(true);
      expect(areaAt(a.x, a.z), a.id).toBe('dragonspine-summit');
    }
    // The summit gate stands on the open side of K1's fog face, so its arch is the face's dressing and the face is the blocker.
    expect(b.gate.arch.z).toBeLessThan(inp.summitFace.z);
    for (const s of b.gate.specs) expect(s.z, s.id).toBeLessThan(SUMMIT_BOX.z0);
  });

  it('keeps the summit gate dressing only: the arch is open, the pillars and stubs leave the pass and the spur clear', () => {
    const arch = b.gate.specs.find((s) => s.kind === 'dragonspine-gate-arch')!;
    expect(arch.mode).toBe('open');
    for (const s of b.gate.specs.filter((x) => x.mode === 'solid')) {
      for (const [x, z] of [...footprintCorners(s), [s.x, s.z] as [number, number]]) {
        expect(b.sites.road.nearest(x, z).d, s.id).toBeGreaterThanOrEqual(b.sites.roadHalf);
        expect(b.summit.spur.nearest(x, z).d, s.id).toBeGreaterThanOrEqual(inp.spurHalfWidth);
      }
    }
    expect(b.toggles.some((t) => t.spec.id.startsWith('dragonspine-summit-gate'))).toBe(false);
  });

  it('builds the roost on K1\'s pad: arena centre, three ledges on the route, about 800 m from the rim, four hawks', () => {
    expect(Math.abs(b.roost.climbLength - 800)).toBeLessThanOrEqual(800 * 0.15);
    const first = b.roost.climb[0]!;
    const last = b.roost.climb[b.roost.climb.length - 1]!;
    expect(first).toEqual(b.roost.trailhead);
    expect(last).toEqual(b.roost.centre);
    expect(b.roost.leaps).toHaveLength(3);
    expect(b.layout.anchors.filter((a) => a.id.startsWith('dragonspine.spawn.roost.hawk-'))).toHaveLength(4);
    // The trailhead is on the Hearth's north rim.
    expect(b.roost.trailhead.z).toBeGreaterThan(b.summit.hearth.maxZ - 10);
  });

  it('hangs one net section per anchor over the cliff, outward of its anchor', () => {
    expect(b.skyhold.anchors).toHaveLength(6);
    expect(b.skyhold.sections.map((s) => s.n)).toEqual(range(6));
    for (const s of b.skyhold.sections) {
      expect(s.spec.mode).toBe('open');
      expect(isKnownStructureKind(s.spec.kind)).toBe(true);
      const a = b.skyhold.anchors[s.n - 1]!;
      expect(Math.hypot(s.spec.x - a.x, s.spec.z - a.z)).toBeLessThan(5);
      expect(s.spec.x, `section ${s.n} is west of (outward from) its anchor`).toBeLessThan(a.x + 1);
    }
  });

  it('builds the Aerie: the gate in the west wall facing the landing shelf, the winch and the waystone outside, the keep door and arena inside', () => {
    const A = b.aerie;
    expect(A.gateSpec.footprint[1]).toBe(AERIE_GATE_W);
    expect(A.winch.x).toBeLessThan(A.edge.w);
    expect(A.landing.x).toBeLessThan(A.edge.w);
    expect(A.waystone.z).toBeLessThan(A.edge.s);
    for (const p of [A.arena, A.keepDoor]) expect(inBox({ minX: A.edge.w, maxX: A.edge.e, minZ: A.edge.s, maxZ: A.edge.n }, p.x, p.z)).toBe(true);
    expect(b.layout.anchors.filter((a) => a.id.startsWith('dragonspine.spawn.aerie.hunter-'))).toHaveLength(8);
    const harpooners = b.layout.anchors.filter((a) => a.id.startsWith('dragonspine.spawn.aerie.harpooner-'));
    expect(harpooners).toHaveLength(4);
    for (const h of harpooners) expect(h.tags).toContain('elevated');
    // The gate blocker is a toggle, not a layout structure (the validator floods the courtyard through the gap).
    expect(b.layout.structures.some((s) => s.id === A.gateSpec.id)).toBe(false);
    expect(b.toggles.find((t) => t.id === 'aerie-gate')!.spec).toBe(A.gateSpec);
  });

  it('builds the keep interior on K1\'s pad and throws when the pad is too small', () => {
    const pad = inp.pads.find((p) => p.id === 'frostfang-keep')!;
    const def = buildKeepDef(pad);
    expect(def.doors[0]!.outside).toBe('dragonspine.aerie.keep.door');
    for (const r of def.rooms) {
      expect(def.site.x + r.x0 - 1).toBeGreaterThanOrEqual(pad.footprint.minX);
      expect(def.site.x + r.x1 + 1).toBeLessThanOrEqual(pad.footprint.maxX);
      expect(def.site.z + r.z0 - 1).toBeGreaterThanOrEqual(pad.footprint.minZ);
      expect(def.site.z + r.z1 + 1).toBeLessThanOrEqual(pad.footprint.maxZ);
    }
    const c = { x: (pad.footprint.minX + pad.footprint.maxX) / 2, z: (pad.footprint.minZ + pad.footprint.maxZ) / 2 };
    expect(() => buildKeepDef(padFromRecord('frostfang-keep', { ...c, w: 24, d: 50 }))).toThrow(/too small/);
    expect(() => buildKeepDef(padFromRecord('frostfang-keep', { ...c, w: 40, d: 24 }))).toThrow(/too small/);
  });
});

describe('the summit\'s failure paths', () => {
  it('throws on a missing K1 export: a summit plateau, a glide ledge, the troughs, the keep pad', () => {
    for (const id of ['dragon-roost', 'wyrms-hearth', 'skyhold-top', 'frostfang-aerie', 'summit-gate']) {
      expect(() => buildDragonspine({ ...stubInputs(), plateaus: inp.plateaus.filter((p) => p.id !== id) }), id).toThrow(new RegExp(id));
    }
    const ledges = { ...inp.glideLedges };
    delete ledges['summit-aerie'];
    expect(() => buildDragonspine({ ...stubInputs(), glideLedges: ledges })).toThrow(/glide ledge "summit-aerie" is missing/);
    expect(() => buildDragonspine({ ...stubInputs(), troughs: [] })).toThrow(/troughs are missing/);
    expect(() => buildDragonspine({ ...stubInputs(), pads: inp.pads.filter((p) => p.id !== 'frostfang-keep') })).toThrow(/frostfang-keep/);
  });

  it('throws on a roost pad too small for M31\'s trial (no built-platform fallback)', () => {
    const small = inp.plateaus.map((p) => (p.id === 'dragon-roost' ? { ...p, box: { minX: p.box.minX + 10, maxX: p.box.maxX - 10, minZ: p.box.minZ + 10, maxZ: p.box.maxZ - 10 } } : p));
    expect(() => buildDragonspine({ ...stubInputs(), plateaus: small })).toThrow(/dragon-roost pad is too small/);
  });

  it('moves the Hearth, the roost and Skyhold with their plateaus', () => {
    for (const [id, probe] of [
      ['wyrms-hearth', 'dragonspine.hearth.shrine'],
      ['dragon-roost', 'dragonspine.roost.arena.centre'],
      ['skyhold-top', 'dragonspine.skyhold.camp'],
    ] as const) {
      const m = buildDragonspine(shiftedInputs([id], 12, -8));
      const now = m.layout.anchors.find((a) => a.id === probe)!;
      expect(now.x - anchor(probe).x, id).toBeCloseTo(12, 0);
      expect(now.z - anchor(probe).z, id).toBeCloseTo(-8, 0);
    }
  });
});

describe('the walker catch', () => {
  const volumes = b.catchVolumes;
  it('has a box over every stretch of both troughs, reaching CATCH_ABOVE over the higher floor', () => {
    const stretches = inp.troughs.reduce((n, t) => n + t.points.length - 1, 0);
    expect(volumes.filter((v) => !v.id.endsWith('.cap'))).toHaveLength(stretches);
    expect(new Set(volumes.map((v) => v.id)).size).toBe(volumes.length);
    for (const t of inp.troughs) {
      const highest = Math.max(...t.points.map((p) => p.floor));
      for (let i = 1; i < t.points.length; i++) {
        const p = t.points[i - 1]!;
        const q = t.points[i]!;
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const x = p.x + (q.x - p.x) * f;
          const z = p.z + (q.z - p.z) * f;
          const floor = p.floor + (q.floor - p.floor) * f;
          // Past the summit box (K1's chasm runs on to z 17000) the catch is clipped off.
          if (z > SUMMIT_BOX.z1) continue;
          expect(inAnyVolume(volumes, { x, y: floor + 0.5, z }), `${t.id} ${i} ${f}`).toBe(true);
          expect(inAnyVolume(volumes, { x, y: highest + CATCH_ABOVE + 5, z }), `${t.id} ${i} ${f} high`).toBe(false);
        }
      }
    }
    // A rebuild from the same troughs is the same set.
    expect(catchVolumes(inp.troughs, inp.heightAt, SUMMIT_BOX)).toEqual(volumes);
  });

  it('picks the ledge: the summit-aerie lip, or the Aerie landing shelf when last grounded on the Aerie', () => {
    expect(catchTarget(false)).toBe(CATCH_LIP_ANCHOR);
    expect(catchTarget(true)).toBe(CATCH_AERIE_ANCHOR);
    expect(CATCH_LIP_ANCHOR).toBe('dragonspine.glide.summit-aerie.launch');
    expect(b.layout.anchors.some((a) => a.id === CATCH_AERIE_ANCHOR)).toBe(true);
  });

  it('stands down while gliding or while K7\'s lane catch is armed; a missing glide service reads false', () => {
    expect(standsDown('glide', undefined)).toBe(true);
    expect(standsDown('walk', { catchArmed: true })).toBe(true);
    expect(standsDown('walk', { catchArmed: false })).toBe(false);
    expect(standsDown('walk', undefined)).toBe(false);
    expect(standsDown(undefined, undefined)).toBe(false);
    expect(standsDown('haul', {})).toBe(false);
  });

  /** A walker on fake ports: `feet` is moved by the test; the catch teleports it to the named anchor. */
  function rig(opts: { onAerie?: (p: { x: number; z: number }) => boolean; missing?: boolean } = {}) {
    const feet = { x: 0, y: 10, z: 0 };
    let mode = 'walk';
    let armed: boolean | undefined;
    const fades: number[] = [];
    const teleports: string[] = [];
    let frozen = 0;
    let warns = 0;
    const anchors: Record<string, { x: number; y: number; z: number }> = { [CATCH_LIP_ANCHOR]: { x: -100, y: 50, z: 0 }, [CATCH_AERIE_ANCHOR]: { x: 100, y: 50, z: 0 } };
    const ports: CatchPorts = {
      feet: () => feet,
      heightAt: () => 0,
      standDown: () => standsDown(mode, armed === undefined ? undefined : { catchArmed: armed }),
      inCatch: (p) => p.y < 5 && Math.abs(p.x) < 20,
      onAerie: opts.onAerie ?? ((p) => p.x > 50),
      anchor: (id) => (!opts.missing && anchors[id] ? { position: anchors[id]!, yaw: 0 } : undefined),
      fade: (o) => fades.push(o),
      teleport: (p) => {
        // Yaw 0 faces -Z, so the return point is CATCH_BACK to +Z of the anchor, level with it.
        teleports.push(Object.keys(anchors).find((k) => anchors[k]!.x === p.x && anchors[k]!.y === p.y && Math.abs(anchors[k]!.z + CATCH_BACK - p.z) < 1e-9)!);
        Object.assign(feet, p);
      },
      freeze: () => {
        frozen++;
        return () => frozen--;
      },
      warn: () => warns++,
    };
    const w = new WalkerCatch(ports);
    const run = (secs: number) => {
      for (let t = 0; t < secs; t += 1 / 60) w.update(1 / 60);
    };
    return { w, feet, run, fades, teleports, setMode: (m: string) => (mode = m), arm: (v: boolean | undefined) => (armed = v), frozen: () => frozen, warns: () => warns };
  }

  it('returns a walker who fell in from the summit side to the lip, with a fade and a freeze that both lift', () => {
    const r = rig();
    Object.assign(r.feet, { x: -60, y: 0, z: 0 });
    r.run(0.2);
    Object.assign(r.feet, { x: 0, y: 1, z: 0 });
    r.run(CATCH_HOLD - 0.1);
    expect(r.w.catches).toBe(0);
    r.run(0.2 + CATCH_FADE_OUT + CATCH_FADE_IN + 0.1);
    expect(r.w.catches).toBe(1);
    expect(r.teleports).toEqual([CATCH_LIP_ANCHOR]);
    expect(r.fades).toEqual([1, 0]);
    expect(r.frozen()).toBe(0);
    expect(r.w.busy).toBe(false);
  });

  it('returns a walker last grounded on the Aerie to the landing shelf', () => {
    const r = rig();
    Object.assign(r.feet, { x: 80, y: 0, z: 0 });
    r.run(0.2);
    expect(r.w.lastOnAerie).toBe(true);
    Object.assign(r.feet, { x: 5, y: 1, z: 0 });
    r.run(CATCH_HOLD + CATCH_FADE_OUT + CATCH_FADE_IN + 0.2);
    expect(r.teleports).toEqual([CATCH_AERIE_ANCHOR]);
  });

  it('does not change sides while airborne: only grounded points count', () => {
    const r = rig();
    Object.assign(r.feet, { x: 80, y: 0, z: 0 });
    r.run(0.1);
    // Over the summit side but 30 m up (a fall or a leap): still last grounded on the Aerie.
    Object.assign(r.feet, { x: -60, y: 30, z: 0 });
    r.run(0.1);
    expect(r.w.lastOnAerie).toBe(true);
  });

  it('stands down in glide mode and while K7\'s catch is armed, then catches once walking again', () => {
    const r = rig();
    Object.assign(r.feet, { x: 0, y: 1, z: 0 });
    r.setMode('glide');
    r.run(2);
    expect(r.w.catches).toBe(0);
    r.setMode('walk');
    r.arm(true);
    r.run(2);
    expect(r.w.catches).toBe(0);
    r.arm(undefined);
    r.run(CATCH_HOLD + 0.1);
    expect(r.w.catches).toBe(1);
  });

  it('never fires outside the volumes, and fires once per fall', () => {
    const r = rig();
    Object.assign(r.feet, { x: 0, y: 8, z: 0 });
    r.run(3);
    expect(r.w.catches).toBe(0);
    Object.assign(r.feet, { x: 0, y: 1, z: 0 });
    r.run(CATCH_HOLD + CATCH_FADE_OUT + CATCH_FADE_IN + 0.2);
    expect(r.w.catches).toBe(1);
    // Put back on the lip (outside the volume): no second catch.
    r.run(2);
    expect(r.w.catches).toBe(1);
  });

  it('lifts the fade and the freeze if torn down mid-catch', () => {
    const r = rig();
    Object.assign(r.feet, { x: 0, y: 1, z: 0 });
    r.run(CATCH_HOLD + 0.05);
    expect(r.w.busy).toBe(true);
    r.w.dispose();
    expect(r.frozen()).toBe(0);
    expect(r.fades[r.fades.length - 1]).toBe(0);
  });

  it('warns once and turns itself off when its return anchor is missing (no fade loop)', () => {
    const r = rig({ missing: true });
    Object.assign(r.feet, { x: 0, y: 1, z: 0 });
    r.run(5);
    expect(r.w.catches).toBe(1);
    expect(r.w.broken).toBe(true);
    expect(r.warns()).toBe(1);
    expect(r.frozen()).toBe(0);
    expect(r.fades[r.fades.length - 1]).toBe(0);
  });

  it('returns the player CATCH_BACK behind the anchor, against its facing, level with it', () => {
    expect(CATCH_BACK).toBeGreaterThanOrEqual(2);
    expect(CATCH_BACK).toBeLessThanOrEqual(3);
    // Facing east (yaw -90 degrees faces +X): behind is west.
    const p = returnPoint({ x: 10, y: 5, z: 20 }, -Math.PI / 2);
    expect(p.x).toBeCloseTo(10 - CATCH_BACK, 9);
    expect(p.z).toBeCloseTo(20, 9);
    expect(p.y).toBe(5);
    // On the stand-in summit, the lip's return point is on its deck, inside the flat stand behind the lip.
    const lip = anchor(CATCH_LIP_ANCHOR);
    const back = returnPoint({ x: lip.x, y: 0, z: lip.z }, (lip.yawDeg * Math.PI) / 180);
    const deck = b.layout.structures.find((x) => x.id === lip.onStructure)!;
    const c = footprintCorners(deck);
    const inside = (q: { x: number; z: number }) => {
      // Point in a convex quad: the same side of each edge.
      const s = c.map(([x0, z0], i) => {
        const [x1, z1] = c[(i + 1) % 4]!;
        return Math.sign((x1 - x0) * (q.z - z0) - (z1 - z0) * (q.x - x0));
      });
      return s.every((v) => v >= 0) || s.every((v) => v <= 0);
    };
    expect(inside(back)).toBe(true);
    expect(inAnyVolume(volumes, { x: back.x, y: inp.heightAt(back.x, back.z) + 0.5, z: back.z })).toBe(false);
  });

  it("counts K1's summit-aerie landing area as the Aerie side, as well as the plateau", () => {
    const aerie = plateau('frostfang-aerie');
    const areas = inp.glideLedges['summit-aerie']!.landingAreas;
    const on = onAerieOf(aerie, areas);
    expect(on({ x: (aerie.minX + aerie.maxX) / 2, z: (aerie.minZ + aerie.maxZ) / 2 })).toBe(true);
    const a0 = areas[0]!;
    const west = { x: a0.x0 + 1, z: (a0.z0 + a0.z1) / 2 };
    expect(on(west)).toBe(true);
    expect(onAerieOf(aerie)(west), 'the probe point is outside the plateau, so only the landing area counts it').toBe(false);
    expect(on(anchor(CATCH_LIP_ANCHOR))).toBe(false);
  });

  it('stands down like the containment push: in an interior, while a save loads, during waystone travel, while dead', () => {
    const ctx = (svc: Record<string, unknown>, dead = false) => ({ services: { get: (k: string) => svc[k] }, player: { actor: { dead } } }) as unknown as Parameters<typeof busyElsewhere>[0];
    expect(busyElsewhere(ctx({}))).toBe(false);
    expect(busyElsewhere(ctx({ interiors: { current: 'frostfang-keep' } }))).toBe(true);
    expect(busyElsewhere(ctx({ interiors: { current: null } }))).toBe(false);
    expect(busyElsewhere(ctx({ save: { loading: true } }))).toBe(true);
    expect(busyElsewhere(ctx({ waystones: { travelling: true } }))).toBe(true);
    expect(busyElsewhere(ctx({}, true))).toBe(true);
  });

  it("keeps every volume inside SUMMIT_BOX (south of z 16900), with the chasm band reaching the box's north edge", () => {
    for (const v of volumes) {
      for (const c of volumeCorners(v)) {
        expect(c.x, v.id).toBeGreaterThanOrEqual(SUMMIT_BOX.x0 - 1e-6);
        expect(c.x, v.id).toBeLessThanOrEqual(SUMMIT_BOX.x1 + 1e-6);
        expect(c.z, v.id).toBeGreaterThanOrEqual(SUMMIT_BOX.z0 - 1e-6);
        expect(c.z, v.id).toBeLessThanOrEqual(SUMMIT_BOX.z1 + 1e-6);
      }
    }
    // N6: the band over the chasm's last stretch runs right up to z 16900, so no gap opens between the two lowlands.
    const north = Math.max(...volumes.filter((v) => v.trough === 'frostfang-chasm').flatMap((v) => volumeCorners(v).map((c) => c.z)));
    expect(north).toBeCloseTo(SUMMIT_BOX.z1, 6);
    const last = inp.troughs.find((t) => t.id === 'frostfang-chasm')!.points.at(-2)!;
    expect(inAnyVolume(volumes, { x: last.x, y: last.floor + 1, z: SUMMIT_BOX.z1 - 0.5 })).toBe(true);
  });
});

describe('the readers (flag-driven pieces)', () => {
  const state = (flags: Record<string, unknown>): FlagReader => (k) => flags[k];
  const shown = (flags: Record<string, unknown>) => new Set(shownToggles(b.toggles, state(flags)));

  it('lists every reader once with its keys', () => {
    expect(b.toggles.map((t) => t.id)).toEqual(['aerie-gate', ...range(6).map((n) => `net-${n}`), 'hoard-axe', 'lodge-fire', 'skarl-banner-burned', 'drake-roost']);
    for (const t of b.toggles) {
      expect(t.keys.length, t.id).toBeGreaterThan(0);
      expect(isKnownStructureKind(t.spec.kind), t.id).toBe(true);
    }
  });

  it('closes the aerie gate until story.d06.gateOpen, and again on a state without it', () => {
    expect(shown({}).has('aerie-gate')).toBe(true);
    expect(shown({ 'story.d06.gateOpen': true }).has('aerie-gate')).toBe(false);
    expect(b.toggles.find((t) => t.id === 'aerie-gate')!.spec.mode).toBe('solid');
  });

  it('drops one net section per anchor flag and shows none once all six are set', () => {
    expect([...shown({})].filter((id) => id.startsWith('net-'))).toHaveLength(6);
    for (const n of range(6)) {
      const s = shown({ [`story.m33.anchor${n}`]: true });
      expect(s.has(`net-${n}`), `anchor ${n}`).toBe(false);
      expect([...s].filter((id) => id.startsWith('net-')), `anchor ${n}`).toHaveLength(5);
    }
    expect([...shown(Object.fromEntries(range(6).map((n) => [`story.m33.anchor${n}`, true])))].filter((id) => id.startsWith('net-'))).toEqual([]);
  });

  it('shows the axe on the hoard only with give and M32 complete', () => {
    expect(shown({}).has('hoard-axe')).toBe(false);
    expect(shown({ 'story.r16.choice': 'give' }).has('hoard-axe')).toBe(false);
    expect(shown({ 'story.m32.complete': true }).has('hoard-axe')).toBe(false);
    expect(shown({ 'story.r16.choice': 'keep', 'story.m32.complete': true }).has('hoard-axe')).toBe(false);
    expect(shown({ 'story.r16.choice': 'give', 'story.m32.complete': true }).has('hoard-axe')).toBe(true);
  });

  it('lights the lodge fire on story.m34.complete, round K1\'s camp hearth', () => {
    expect(shown({}).has('lodge-fire')).toBe(false);
    expect(shown({ 'story.m34.complete': true }).has('lodge-fire')).toBe(true);
    const fire = b.toggles.find((t) => t.id === 'lodge-fire')!.spec;
    expect([fire.x, fire.z]).toEqual([inp.hearth.x, inp.hearth.z]);
  });

  it('burns Skarl\'s banner only on defeated, not spared', () => {
    expect(shown({}).has('skarl-banner-burned')).toBe(false);
    expect(shown({ 'boss.corvin-skarl.outcome': 'spared' }).has('skarl-banner-burned')).toBe(false);
    expect(shown({ 'boss.corvin-skarl.outcome': 'defeated' }).has('skarl-banner-burned')).toBe(true);
    const banner = b.toggles.find((t) => t.id === 'skarl-banner-burned')!.spec;
    const e = b.lodge.edge;
    expect(inBox({ minX: e.w, maxX: e.e, minZ: e.s, maxZ: e.n }, banner.x, banner.z)).toBe(true);
  });

  it('puts the drake\'s roost on the Aerie\'s north-east tower top after story.d06.complete', () => {
    expect(shown({}).has('drake-roost')).toBe(false);
    expect(shown({ 'story.d06.complete': true }).has('drake-roost')).toBe(true);
    const t = b.toggles.find((x) => x.id === 'drake-roost')!;
    expect([t.spec.x, t.spec.z]).toEqual([b.aerie.roostTower.x, b.aerie.roostTower.z]);
    expect(t.lift).toBe(b.aerie.roostTower.height);
  });
});
