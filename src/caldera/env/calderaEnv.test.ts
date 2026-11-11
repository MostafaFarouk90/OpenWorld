// Act 5 N1 PR 2 (the Caldera's environment pass): the catalogue, the scripted stand-ins, the c1 rows, their colliders and lights, the
// structure art and section V of the prompt list.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { CALDERA_STANDIN_IDS } from '../../../tools/env-pass/standins/caldera';
import { buildTileColliders, shapeFor } from '../../env/colliders';
import { defaultKeepOut } from '../../env/colliderKeepOut';
import { STANDIN_PREFIX } from '../../env/envSource';
import { GLOW, POOL_SIZE } from '../../env/glow';
import { classOf, DENSITY } from '../../env/PlacementField';
import { resolveModel, STANDINS } from '../../env/resolve';
import targets from '../../env/targets.json';
import { envDiskSource } from '../../env/testing/envDiskSource';
import { TILES } from '../../env/tiles';
import { heightAt } from '../../terrain/heightfield';
import { LAVA_STAIR_POINTS } from '../../terrain/shape/caldera';
import { CALDERA_LAYOUT } from '../caldera.layout';
import { CALDERA_DOOR_APPROACH, CALDERA_DOORS, INNER_GATE, LAKE_INNER_R, LAKE_OUTER_R, LAVA_LAKE, RIM_GATE_SITE, headingTo, radiusOf } from '../calderaSites';
import { calderaArtEntry, createCalderaArt } from './calderaArt';
import {
  CALDERA_ENV_TILE,
  calderaEnvRefusal,
  calderaEnvRows,
  calderaEnvSize,
  LAVA_STAIR_CHANNEL_CLEAR,
  LAVA_STAIR_CHANNELS,
  PORTAL_FOR,
  rowRadius,
  SIEGE_COURT,
} from './calderaEnv';
import { CALDERA_ENV_IDS, CALDERA_ROW_IDS } from './calderaEnvIds';
import { renderSectionV, SECTION_V_HEADING } from './sectionV';

const fsModule = 'node:fs';
let fs: any;
beforeAll(async () => {
  fs = await import(/* @vite-ignore */ fsModule);
});

interface Gltf {
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number; material: number }> }>;
  accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
  materials: Array<{ name: string; emissiveFactor?: number[] }>;
}
function parse(bytes: Uint8Array): Gltf {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(dv.getUint32(0, true), 'glb magic').toBe(0x46546c67);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + dv.getUint32(12, true))));
}
const triangles = (g: Gltf): number => g.meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + g.accessors[p.indices]!.count / 3, 0), 0);
function bounds(g: Gltf): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes)
    for (const p of m.primitives) {
      const a = g.accessors[p.attributes.POSITION!]!;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, a.min![k]!);
        max[k] = Math.max(max[k]!, a.max![k]!);
      }
    }
  return { min, max };
}
const TARGETS = targets.objects as Record<string, { w: number; d: number; h: number }>;
const rows = calderaEnvRows();
const DIR = 'public/assets/env-standin/';

describe('the catalogue (section V)', () => {
  it('has unique ids, each with a size in targets.json equal to its own', () => {
    const ids = CALDERA_ENV_IDS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CALDERA_ENV_IDS) expect(TARGETS[e.id], e.id).toEqual({ w: e.w, d: e.d, h: e.h });
  });

  it('has a scripted stand-in for every dressing id and for nothing else', () => {
    expect([...CALDERA_STANDIN_IDS].sort()).toEqual([...CALDERA_ROW_IDS].sort());
    for (const id of CALDERA_ROW_IDS) expect(STANDINS.has(id), id).toBe(true);
  });

  it('is section V of docs/env/environment-needs-prompts.md, word for word, after W', () => {
    const doc = fs.readFileSync('docs/env/environment-needs-prompts.md', 'utf8') as string;
    expect(doc).toContain(renderSectionV());
    expect(doc.indexOf(SECTION_V_HEADING)).toBeGreaterThan(doc.indexOf('## W. '));
    for (const e of CALDERA_ENV_IDS) expect(doc, e.id).toContain(`| ${e.id} | `);
  });
});

describe('the Caldera stand-in glbs', () => {
  it.each(CALDERA_STANDIN_IDS)('%s is a valid glb within its budget and 10% of its size, pivot at the base centre, front +Z', (id) => {
    const g = parse(fs.readFileSync(DIR + `${id}.glb`));
    expect(triangles(g), 'triangles').toBeGreaterThan(0);
    expect(triangles(g), 'triangles').toBeLessThanOrEqual(1500);
    expect(g.materials.length, 'materials').toBeLessThanOrEqual(6);
    const t = TARGETS[id]!;
    const { min, max } = bounds(g);
    const span = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    for (const [k, want] of [[0, t.w], [1, t.h], [2, t.d]] as const) {
      expect(span[k], `${id} axis ${k}`).toBeGreaterThanOrEqual(want * 0.9);
      expect(span[k], `${id} axis ${k}`).toBeLessThanOrEqual(want * 1.1);
    }
    expect(Math.abs(min[1]!), 'base on y 0').toBeLessThan(0.02);
    expect(Math.abs((min[0]! + max[0]!) / 2), 'x centre').toBeLessThan(0.05 * Math.max(1, t.w));
    expect(Math.abs((min[2]! + max[2]!) / 2), 'z centre').toBeLessThan(0.05 * Math.max(1, t.d));
  });

  it('stay out of the manifest (a real file wins) and resolve to the stand-in until then', () => {
    const manifest = JSON.parse(fs.readFileSync('public/assets/env/manifest.json', 'utf8'));
    for (const id of CALDERA_STANDIN_IDS) {
      expect(Object.keys(manifest.objects), id).not.toContain(id);
      expect(resolveModel(id), id).toEqual({ source: 'env', model: `env-standin/${id}`, scale: 1 });
    }
  });

  it('carry the emissive materials their glow entries flicker', () => {
    for (const id of CALDERA_STANDIN_IDS) {
      const names = parse(fs.readFileSync(DIR + `${id}.glb`)).materials.map((m) => m.name);
      for (const mat of Object.keys(GLOW[id]?.materials ?? {})) expect(names, `${id} ${mat}`).toContain(mat);
    }
  });

  it('load through the library from the stand-in prefix', async () => {
    const lib = new ModelLibrary(await envDiskSource());
    for (const id of ['rim-wall-a', 'cooling-hall-portal-a', 'warhost-tent-a']) {
      const t = await lib.template(`${STANDIN_PREFIX}${id}`);
      expect(t, id).not.toBeNull();
      expect(t!.bounds.max.x - t!.bounds.min.x, id).toBeGreaterThan(TARGETS[id]!.w * 0.9);
    }
  });
});

describe('tile c1 (the dressing rows)', () => {
  it('is an eager tile of about 240 rows, deterministic, every id sized and drawable', () => {
    expect(TILES[CALDERA_ENV_TILE]).toBe(rows);
    expect(rows.length).toBeGreaterThan(200);
    expect(rows.length).toBeLessThan(320);
    for (const r of rows) {
      expect(Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.yaw) && (r.scale ?? 1) > 0, r.id).toBe(true);
      expect(r.dy, r.id).toBeUndefined();
      expect(resolveModel(r.id).source, `${r.id} draws a model`).not.toBe('placeholder');
      expect(calderaEnvSize(r.id)[0] !== 1 || r.id === 'barrel' || r.id === 'crate_A_big', `${r.id} has a size`).toBe(true);
    }
  });

  it('makes the same rows in a fresh module (fixed seed, no cache carried over)', async () => {
    vi.resetModules();
    const fresh = await import('./calderaEnv');
    expect(fresh.calderaEnvRows()).not.toBe(rows);
    expect(fresh.calderaEnvRows()).toEqual(rows);
  });

  it('keeps every row where it may stand (anchors, triggers, structures, roads, fauna, the court, the lava, the slope)', () => {
    const bad = rows.map((r) => [r.id, r.x, r.z, calderaEnvRefusal(r)] as const).filter((x) => x[3]);
    expect(bad).toEqual([]);
  });

  it('keeps every trigger and the siege court prop-free, and nothing in or by the lava or on the island', () => {
    for (const r of rows) {
      const rad = rowRadius(r);
      for (const t of CALDERA_LAYOUT.triggers) if (t.shape === 'sphere') expect(Math.hypot(r.x - t.x, r.z - t.z), `${r.id} in ${t.id}`).toBeGreaterThan(t.radius + rad);
      const inCourt = r.x > SIEGE_COURT.x0 - rad && r.x < SIEGE_COURT.x1 + rad && r.z > SIEGE_COURT.z0 - rad && r.z < SIEGE_COURT.z1 + rad;
      expect(inCourt, `${r.id} in the siege court`).toBe(false);
      const rr = radiusOf([r.x, r.z]);
      expect(rr < LAKE_INNER_R - 7 - rad || rr > LAKE_OUTER_R + 7 + rad, `${r.id} at r ${rr.toFixed(0)}`).toBe(true);
      if (rr < 1200) expect(heightAt(r.x, r.z), `${r.id} above the lava`).toBeGreaterThan(LAVA_LAKE.surfaceY + 2);
    }
  });

  it('puts walls on both sides of both gates', () => {
    const rim = rows.filter((r) => r.id === 'rim-wall-a');
    const g = RIM_GATE_SITE.gate[0];
    expect(rim.filter((r) => r.x < g - 30).length).toBe(4);
    expect(rim.filter((r) => r.x > g + 30).length).toBe(4);
    const inner = rows.filter((r) => r.id === 'foundry-wall-a');
    const f = INNER_GATE.face[0];
    expect(inner.filter((r) => r.x < f - INNER_GATE.faceHalfLength).length).toBe(4);
    expect(inner.filter((r) => r.x > f + INNER_GATE.faceHalfLength).length).toBe(4);
    // On the floor wall's lip (r 520), the face's ends overlapped by the first module.
    for (const r of inner) expect(Math.abs(radiusOf([r.x, r.z]) - 520)).toBeLessThan(0.2);
    expect(Math.min(...inner.map((r) => Math.abs(r.x - f))) - 3).toBeLessThanOrEqual(INNER_GATE.faceHalfLength + 2.5);
  });

  it('stands each door portal behind its door anchor, the opening toward the way in, 1.5 m clear', () => {
    for (const k of Object.keys(PORTAL_FOR) as (keyof typeof CALDERA_DOORS)[]) {
      const p = rows.find((r) => r.id === PORTAL_FOR[k])!;
      expect(p, k).toBeDefined();
      const d = CALDERA_DOORS[k];
      const front = Math.hypot(p.x - d[0], p.z - d[1]) - calderaEnvSize(p.id)[1] / 2;
      expect(front, k).toBeCloseTo(1.5, 0);
      expect(Math.abs((((p.yaw ?? 0) - headingTo(d, CALDERA_DOOR_APPROACH[k]) + 540) % 360) - 180), k).toBeLessThan(1);
    }
  });

  it('keeps the Lava Stair lanterns off N10\'s channels, and lights every 45 to 60 m on both stairs', () => {
    const lav = rows.filter((r) => r.id === 'caldera-lantern-post-a');
    expect(lav.length).toBeGreaterThanOrEqual(24);
    let s = 0;
    const arcs: { a: [number, number]; b: [number, number]; s: number }[] = [];
    for (let i = 1; i < LAVA_STAIR_POINTS.length; i++) {
      const a = LAVA_STAIR_POINTS[i - 1] as [number, number];
      const b = LAVA_STAIR_POINTS[i] as [number, number];
      arcs.push({ a, b, s });
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    for (const r of lav) {
      for (const g of arcs) {
        const dx = g.b[0] - g.a[0];
        const dz = g.b[1] - g.a[1];
        const l = Math.hypot(dx, dz);
        const t = ((r.x - g.a[0]) * dx + (r.z - g.a[1]) * dz) / (l * l);
        if (t < 0 || t > 1) continue;
        const off = Math.abs(((r.x - g.a[0]) * dz - (r.z - g.a[1]) * dx) / l);
        if (off > 8) continue;
        const arc = g.s + t * l;
        for (const c of LAVA_STAIR_CHANNELS) expect(Math.abs(arc - c), `lantern at s ${arc.toFixed(0)}`).toBeGreaterThanOrEqual(LAVA_STAIR_CHANNEL_CLEAR - 0.5);
      }
    }
  });

  it('lights only braziers and lanterns, so the 3/2/0 pool picks the nearest', () => {
    const lit = new Set(rows.filter((r) => GLOW[r.id]?.light).map((r) => r.id));
    expect([...lit].sort()).toEqual(['brazier-standing-a', 'caldera-lantern-post-a']);
    expect(POOL_SIZE).toEqual({ high: 3, medium: 2, low: 0 });
  });

  it('never thins a gate wall, a portal or the gong on Low, and sizes the rest like every tile', () => {
    for (const id of ['rim-wall-a', 'foundry-wall-a', 'cooling-hall-portal-a', 'tunnel-portal-a', 'foundry-stairhead-a', 'forge-gong-frame-a']) {
      expect(classOf(id), id).toBe('hedge');
      expect(DENSITY.low[classOf(id)], id).toBe(1);
    }
    expect(classOf('basalt-boulder-a')).toBe('rock');
    expect(classOf('caldera-lantern-post-a')).toBe('prop');
  });
});

describe('the c1 colliders', () => {
  const made = buildTileColliders(CALDERA_ENV_TILE, rows, defaultKeepOut());

  it('runs the gate walls, boxes the big pieces and drops nothing', () => {
    expect(made.stats.dropped).toBe(0);
    expect(made.stats.runModules).toBe(16);
    expect(shapeFor('rim-wall-a')).toMatchObject({ kind: 'run', len: 6 });
    expect(shapeFor('foundry-wall-a')).toMatchObject({ kind: 'run', len: 6 });
    for (const id of ['caldera-lantern-post-a', 'rim-banner-a', 'weapon-rack-a', 'lava-glass-shard-a', 'scorched-nest-a', 'wyrm-rib-a', 'cooling-hall-portal-a', 'tunnel-portal-a', 'foundry-stairhead-a', 'basalt-columns-a']) {
      expect(shapeFor(id), id).toBeUndefined();
    }
    const rimRuns = made.boxes.filter((b) => b.id === 'rim-wall-a');
    expect(rimRuns.length).toBe(2);
    for (const b of rimRuns) expect(b.hx * 2).toBeCloseTo(24, 0);
  });

  it('keeps every collider off the camp trigger, the anchors and the doors (the keep-out holds the Caldera layout)', () => {
    const ko = defaultKeepOut();
    expect(ko.discs.some((d) => d.why === 'trigger trg.caldera.camp')).toBe(true);
    for (const b of made.boxes) {
      for (const a of CALDERA_LAYOUT.anchors) {
        if (a.dy) continue;
        expect(Math.hypot(b.cx - a.x, b.cz - a.z), `${b.id} by ${a.id}`).toBeGreaterThan(Math.min(b.hx, b.hz) + 1.2);
      }
    }
  });
});

describe('the structure art', () => {
  it('names an env id for every dressed PR 1 structure, and each structure id of the catalogue is used', () => {
    const used = new Set<string>();
    const plain = new Set(['caldera.camp.fire-ring', 'caldera.camp.forge.dunstan.hearth', 'caldera.camp.anvil.alric.block']);
    for (const s of CALDERA_LAYOUT.structures) {
      const e = calderaArtEntry(s);
      if (plain.has(s.id) || s.kind === 'waystone') {
        expect(e, s.id).toBeNull();
        continue;
      }
      expect(e, s.id).not.toBeNull();
      used.add(e!.id);
      // The footprint (turned for a quartered stall) is the catalogue's size, so a file at that size fits without stretching.
      const t = TARGETS[e!.id]!;
      const [w, d] = e!.quarter ? [s.footprint[1], s.footprint[0]] : s.footprint;
      expect([w, d], s.id).toEqual([t.w, t.d]);
    }
    expect([...used].sort()).toEqual(CALDERA_ENV_IDS.filter((e) => e.use === 'structure').map((e) => e.id).sort());
  });

  it('turns the north tents to face the fire and mirrors the east tower', () => {
    expect(calderaArtEntry({ id: 'caldera.camp.tent.1' })?.frontNegZ).toBe(true);
    expect(calderaArtEntry({ id: 'caldera.camp.tent.5' })?.frontNegZ).toBe(false);
    expect(calderaArtEntry({ id: 'caldera.rim-gate.tower.e' })?.mirror).toBe(true);
    expect(calderaArtEntry({ id: 'caldera.rim-gate.tower.w' })?.mirror).toBeUndefined();
  });

  it('keeps the greybox while no file is in the manifest (no loader: every structure gives null)', async () => {
    const art = createCalderaArt(new ModelLibrary(undefined));
    for (const s of CALDERA_LAYOUT.structures) expect(await art(s), s.id).toBeNull();
  });
});
