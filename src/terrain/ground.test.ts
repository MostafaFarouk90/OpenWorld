import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRASS, cellTufts, tuftColor } from '../region/grass';
import { REGION_IDS, engineBox } from '../region/regions';
import { buildChunkData, chunkVertexCount, surfaceColor } from './chunkGeometry';
import { tintGround } from './shape/detailGround';
import { heightAt } from './heightfield';
import {
  ACT2_GROUND_ORIGIN,
    DIP_LATTICE,
  DIP_MAX_CHUNK,
  DRAGONSPINE_GROUND_ORIGIN,
  GREYFEN_GROUND_ORIGIN,
  GROUND_BLEND,
  GROUND_RULES,
  GROUND_ORIGINS,
  SNOW_FULL,
  SNOW_LINE,
  WET_BAND,
  groundOriginFor,
  peatMask,
  snowWeight,
  veinWeight,
  wetWeight,
  ashFogWeight,
  buildDipField,
  chunkGround,
  chunkTouchesGround,
  emberWeight,
  grassRule,
  groundColor,
  groundWeights,
  openGroundMask,
} from './ground';
import {
  EMBER_PULSE_PERIOD,
  GROUND_FRAGMENT_COLOR,
  GROUND_FRAGMENT_DECL,
  GROUND_FRAGMENT_EMISSIVE,
  GROUND_VERTEX_DECL,
  GROUND_VERTEX_MAIN,
  GROUND_TIME_WRAP,
  veinAt,
  createGroundMaterial,
  injectGround,
  seamAt,
  shaderLocal,
  wrapGroundTime,
} from './groundShader';
import { isValidReply } from './workerProtocol';
import { handleChunkMessage } from './workers/terrain.worker';
import { ACT2_PLATEAUS } from './shape/act2';
import { roadLength, roadPoint, type Act2RoadId } from './shape/roadPoint';

const CINDER = engineBox('cinderreach');
const OLD = engineBox('oldsmoke');
const ROADS: Act2RoadId[] = ['cinder-road', 'stonefold-road', 'fellwalker-track', 'hushed-anvil-path', 'scorchhold-road', 'oldsmoke-pass'];

describe('ground weights', () => {
  it('are 1 inside each Act 2 region and 0 for the other rule', () => {
    expect(groundWeights(19000, 1500)).toEqual({ cinderreach: 1, oldsmoke: 0, greyfen: 0, dragonspine: 0 });
    expect(groundWeights(19500, 9500)).toEqual({ cinderreach: 0, oldsmoke: 1, greyfen: 0, dragonspine: 0 });
  });

  it('are 0 everywhere in Brightwater and Harrowmark', () => {
    for (const id of ['brightwater', 'harrowmark'] as const) {
      const b = engineBox(id);
      for (let x = b.x0; x <= b.x1; x += 250) {
        for (let z = b.z0; z <= b.z1; z += 250) expect(groundWeights(x, z)).toEqual({ cinderreach: 0, oldsmoke: 0, greyfen: 0, dragonspine: 0 });
      }
    }
  });

  it('fall smoothly to 0 across the blend band and stay 0 beyond it', () => {
    const z = 2500;
    let prev = 1;
    for (let d = 0; d <= GROUND_BLEND; d += 50) {
      const w = groundWeights(CINDER.x0 - d, z).cinderreach;
      expect(w).toBeLessThanOrEqual(prev + 1e-12);
      prev = w;
    }
    expect(groundWeights(CINDER.x0 - GROUND_BLEND / 2, z).cinderreach).toBeCloseTo(0.5, 5);
    expect(groundWeights(CINDER.x0 - GROUND_BLEND - 1, z).cinderreach).toBe(0);
  });

  it('answer only chunks a rule reaches: no Act 1 chunk, every chunk inside Act 2', () => {
    for (const id of ['brightwater', 'harrowmark'] as const) {
      const b = engineBox(id);
      for (const size of [100, 400, 1600]) {
        for (let x = b.x0 + size / 2; x <= b.x1 - size / 2; x += size) {
          for (let z = b.z0 + size / 2; z <= b.z1 - size / 2; z += size) expect(chunkTouchesGround(x, z, size)).toBe(false);
        }
      }
    }
    expect(chunkTouchesGround(19000, 2500, 100)).toBe(true);
    expect(chunkTouchesGround(CINDER.x0 - GROUND_BLEND - 60, 2500, 100)).toBe(false);
    expect(chunkTouchesGround(CINDER.x0 - GROUND_BLEND - 40, 2500, 100)).toBe(true);
  });
});

describe('the pass between the regions', () => {
  it('cross-fades from Cinderreach to Oldsmoke along the pass, never back to Act 1', () => {
    for (let s = 0; s <= roadLength('oldsmoke-pass'); s += 50) {
      const p = roadPoint('oldsmoke-pass', s);
      const w = groundWeights(p.x, p.z);
      expect(Math.max(w.cinderreach, w.oldsmoke), `s ${s}`).toBeGreaterThan(0.45);
      expect(chunkTouchesGround(p.x, p.z, 100)).toBe(true);
    }
    const mid = groundWeights(20000, (CINDER.z1 + OLD.z0) / 2);
    expect(mid.cinderreach).toBeCloseTo(0.5, 5);
    expect(mid.oldsmoke).toBeCloseTo(0.5, 5);
  });
});

describe('road and plateau mask', () => {
  it('is 0 on every road bed and every plateau, 1 well away from both', () => {
    for (const id of ROADS) {
      const len = roadLength(id);
      for (let s = 0; s <= len; s += 97) {
        const p = roadPoint(id, s);
        expect(openGroundMask(p.x, p.z)).toBe(0);
        expect(emberWeight(p.x, p.z, 1)).toBe(0);
      }
    }
    for (const p of ACT2_PLATEAUS) {
      const cx = (p.box.minX + p.box.maxX) / 2;
      const cz = (p.box.minZ + p.box.maxZ) / 2;
      expect(openGroundMask(cx, cz)).toBe(0);
    }
    expect(openGroundMask(18000, 1000)).toBe(1);
  });

  it('fades in over 10 m beside a road', () => {
    const p = roadPoint('cinder-road', 6000);
    const side = (d: number) => roadPoint('cinder-road', 6000, d);
    expect(openGroundMask(p.x, p.z)).toBe(0);
    const near = side(6 + 4 + 5);
    const m = openGroundMask(near.x, near.z);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
    const far = side(40);
    expect(openGroundMask(far.x, far.z)).toBe(1);
  });
});

describe('ground colour', () => {
  it('leaves the Act 1 colour untouched where no rule reaches', () => {
    const a = new Float32Array(3);
    const b = new Float32Array(3);
    surfaceColor(80, 0.95, a, 0);
    surfaceColor(80, 0.95, b, 0);
    groundColor(3000, 2000, 0.95, b, 0);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('turns Cinderreach black and Oldsmoke rust', () => {
    const c = new Float32Array(3);
    surfaceColor(80, 0.98, c, 0);
    groundColor(18000, 1000, 0.98, c, 0);
    expect(Math.max(c[0], c[1], c[2])).toBeLessThan(0.1);
    surfaceColor(80, 0.98, c, 0);
    groundColor(19500, 9500, 0.98, c, 0);
    expect(c[0]).toBeGreaterThan(c[1]);
    expect(c[0]).toBeGreaterThan(c[2]);
  });
});

describe('dip lattice', () => {
  const bowl = (x: number, z: number) => -30 * Math.exp(-((x - 18000) ** 2 + (z - 1000) ** 2) / 50 ** 2);

  it('is the height itself on flat ground, so flat ground gets no ash-fog', () => {
    const field = buildDipField(18000, 1000, 400, () => 50);
    expect(field.meanAt(18010, 990)).toBeCloseTo(50, 9);
    expect(ashFogWeight(18010, 990, 50, field)).toBe(0);
  });

  it('fogs the bottom of a bowl and not its rim', () => {
    const field = buildDipField(18000, 1000, 400, bowl);
    expect(ashFogWeight(18000, 1000, bowl(18000, 1000), field)).toBeGreaterThan(0);
    expect(ashFogWeight(18190, 1000, bowl(18190, 1000), field)).toBe(0);
  });

  it('agrees exactly on the edge two neighbouring chunks share', () => {
    const left = buildDipField(18000, 1000, 400, bowl);
    const right = buildDipField(18400, 1000, 400, bowl);
    for (let z = 800; z <= 1200; z += 7.3) expect(left.meanAt(18200, z)).toBe(right.meanAt(18200, z));
    // ...and between chunks of different sizes (LOD neighbours).
    const big = buildDipField(18600, 1200, 800, bowl);
    for (let z = 800; z <= 1200; z += 11.1) expect(left.meanAt(18200, z)).toBeCloseTo(big.meanAt(18200, z), 9);
  });

  it('samples heightAt once per lattice node', () => {
    let calls = 0;
    buildDipField(18000, 1000, 800, () => {
      calls++;
      return 0;
    });
    const per = 800 / DIP_LATTICE + 1 + 6 + 1;
    expect(calls).toBeLessThanOrEqual(per * per);
  });
});

describe('per-chunk ground', () => {
  it('matches the standalone functions vertex by vertex', () => {
    for (const [cx, cz, size] of [
      [18500, 1500, 400],
      [21000, 2800, 800],
      [20500, 6200, 400],
      [19500, 9500, 1600],
    ] as const) {
      const cg = chunkGround(cx, cz, size, heightAt)!;
      const field = size <= DIP_MAX_CHUNK ? buildDipField(cx, cz, size, heightAt) : null;
      const a = new Float32Array(3);
      const b = new Float32Array(3);
      const g = new Float32Array(2);
      for (let k = 0; k < 200; k++) {
        const x = cx - size / 2 + ((k * 37) % 101) * (size / 100);
        const z = cz - size / 2 + ((k * 53) % 101) * (size / 100);
        const h = heightAt(x, z);
        const up = 0.8 + (k % 5) * 0.05;
        surfaceColor(h, up, a, 0);
        surfaceColor(h, up, b, 0);
        groundColor(x, z, up, a, 0);
        cg.vertex(x, z, h, up, b, 0, g, 0);
        expect(Array.from(b)).toEqual(Array.from(a));
        expect(g[0]).toBeCloseTo(emberWeight(x, z, up), 6);
        expect(g[1]).toBeCloseTo(field ? ashFogWeight(x, z, h, field) : 0, 6);
      }
    }
  });

  it('is null for Act 1 chunks', () => {
    expect(chunkGround(3000, 2000, 400, heightAt)).toBeNull();
  });
});

describe('chunk data', () => {
  const req = (centerX: number, centerZ: number, size: number) => ({ centerX, centerZ, size, segments: 16, skirtDepth: 4 });

  it('Act 1 chunks carry no ground attribute and Act 1 colours', () => {
    for (const [x, z, size] of [
      [0, 0, 100],
      [3000, 2000, 400],
      [8500, 2000, 1600],
      [12000, 2000, 3200],
    ] as const) {
      const d = buildChunkData(req(x, z, size));
      expect(d.ground).toBeUndefined();
      expect('ground' in d).toBe(false);
      const c = new Float32Array(3);
      const rows = 17 * 17;
      for (let v = 0; v < rows; v++) {
        surfaceColor(d.positions[v * 3 + 1], d.normals[v * 3 + 1], c, 0);
        // Brightwater's B1 tile tints the base colour (shape/detailGround.ts); everywhere else this is the identity.
        tintGround(x - size / 2 + (v % 17) * (size / 16), z - size / 2 + Math.floor(v / 17) * (size / 16), c, 0);
        // The worker colours from float64 heights and normals; these are float32 copies of them.
        for (let k = 0; k < 3; k++) expect(d.colors[v * 3 + k]).toBeCloseTo(c[k], 5);
      }
    }
  });

  it('Act 2 chunks carry ember and ash weights in 0..1, copied onto the skirts', () => {
    const d = buildChunkData(req(18500, 1500, 400));
    expect(d.ground).toBeInstanceOf(Float32Array);
    expect(d.ground!.length).toBe(chunkVertexCount(16) * 2);
    expect(Math.max(...d.ground!)).toBeLessThanOrEqual(1);
    expect(Math.min(...d.ground!)).toBeGreaterThanOrEqual(0);
    let ember = 0;
    for (let v = 0; v < 17 * 17; v++) ember = Math.max(ember, d.ground![v * 2]);
    expect(ember).toBeGreaterThan(0);
    expect(d.ground![17 * 17 * 2]).toBe(d.ground![0]);
  });

  it('big far chunks get no ash-fog (it fades out long before them)', () => {
    const d = buildChunkData(req(19200, 1600, DIP_MAX_CHUNK * 2));
    for (let v = 0; v < d.ground!.length / 2; v++) expect(d.ground![v * 2 + 1]).toBe(0);
  });

  it('the worker transfers the ground buffer and the reply validates', () => {
    const { message, transfer } = handleChunkMessage({ id: 3, request: req(18500, 1500, 100) });
    expect(message.ok).toBe(true);
    expect(transfer).toHaveLength(4);
    expect(isValidReply(message, 16)).toBe(true);
    const act1 = handleChunkMessage({ id: 4, request: req(0, 0, 100) });
    expect(act1.transfer).toHaveLength(3);
  });

  it('the reply check rejects a ground buffer of the wrong length or type', () => {
    const n = chunkVertexCount(4) * 3;
    const data = { positions: new Float32Array(n), normals: new Float32Array(n), colors: new Float32Array(n), minY: 0, maxY: 1 };
    expect(isValidReply({ id: 1, ok: true, data: { ...data, ground: new Float32Array((n / 3) * 2) } }, 4)).toBe(true);
    expect(isValidReply({ id: 1, ok: true, data: { ...data, ground: new Float32Array(n) } }, 4)).toBe(false);
    expect(isValidReply({ id: 1, ok: true, data: { ...data, ground: [0, 0] } }, 4)).toBe(false);
  });
});

describe('grass on Act 2 ground', () => {
  it('keeps Act 1 tufts exactly as before', () => {
    expect(grassRule(3000, 2000)).toEqual({ tint: null, weight: 0, density: 1 });
    expect(tuftColor(60, 0.97, 0.4, 3000, 2000)).toEqual(tuftColor(60, 0.97, 0.4));
  });

  it('turns yellow in Cinderreach and rust in Oldsmoke', () => {
    const [r, g, b] = tuftColor(60, 0.97, 0.4, 18000, 1000);
    expect(r).toBeGreaterThan(b * 2);
    expect(g).toBeGreaterThan(b * 2);
    const [r2, g2, b2] = tuftColor(60, 0.97, 0.4, 19500, 9500);
    expect(r2).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(b2);
  });

  it('grows at 40% in Oldsmoke', () => {
    expect(grassRule(19500, 9500).density).toBeCloseTo(0.4, 9);
    const flat = () => 10;
    const all = () => true;
    const cx = Math.floor(19500 / GRASS.cellSize);
    const cz = Math.floor(9500 / GRASS.cellSize);
    const n = cellTufts(cx, cz, flat, all).length;
    expect(n).toBeLessThanOrEqual(Math.ceil(GRASS.perCell * 0.4));
    expect(n).toBeGreaterThan(0);
    const act1 = cellTufts(Math.floor(3000 / GRASS.cellSize), Math.floor(2000 / GRASS.cellSize), flat, all).length;
    expect(act1).toBe(GRASS.perCell);
  });
});

describe('ground shader', () => {
  it('injects into three’s own standard shader and samples region-local coordinates', () => {
    const lib = THREE.ShaderLib.standard;
    const { vertex, fragment } = injectGround(lib.vertexShader, lib.fragmentShader);
    expect(vertex).toContain('attribute vec2 ground;');
    expect(vertex).toContain('vGroundLocal = modelMatrix[3].xz - uGroundOrigin + position.xz;');
    expect(fragment).toContain('groundSeam(vGroundLocal)');
    // No world-space position reaches the pattern.
    expect(fragment).not.toMatch(/worldPosition/);
    const ours = vertex.slice(vertex.indexOf('vGround = ground;'), vertex.indexOf('vGroundViewDist'));
    expect(ours).not.toMatch(/worldPosition/);
    expect(fragment).toContain('totalEmissiveRadiance +=');
    expect(fragment.indexOf('uniform float uGroundTime')).toBeGreaterThan(fragment.indexOf('#include <common>'));
  });

  it('declares no identifier GLSL reserves (a reserved word fails the compile and the terrain vanishes)', () => {
    const reserved = ['patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'noise', 'half', 'fixed', 'cast', 'namespace', 'using', 'superp', 'resource', 'buffer', 'shared', 'subroutine'];
    const src = [GROUND_VERTEX_DECL, GROUND_VERTEX_MAIN, GROUND_FRAGMENT_DECL, GROUND_FRAGMENT_COLOR, GROUND_FRAGMENT_EMISSIVE].join('\n');
    const declared = [...src.matchAll(/\b(?:float|vec2|vec3|vec4)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(5);
    // The Act 3 vein snippet is in the scanned source, so a reserved name in it fails here, not under SwiftShader.
    expect(declared).toContain('groundVeinStreak');
    expect(declared).toContain('veinPatch');
    for (const name of declared) expect(reserved, name).not.toContain(name);
  });

  it('refuses a shader that lacks an injection point', () => {
    expect(() => injectGround('void main(){}', THREE.ShaderLib.standard.fragmentShader)).toThrow(/missing/);
  });

  it('wires its uniforms through onBeforeCompile with its own program key', () => {
    const { material, uniforms } = createGroundMaterial({ vertexColors: true });
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.uGroundTime).toBe(uniforms.uGroundTime);
    expect(uniforms.uGroundOrigin.value.toArray()).toEqual([ACT2_GROUND_ORIGIN.x, ACT2_GROUND_ORIGIN.z]);
    expect(material.customProgramCacheKey()).toBe('terrain-act2-ground');
    material.dispose();
  });

  it('wraps time to a whole number of pulse periods', () => {
    expect(GROUND_TIME_WRAP % EMBER_PULSE_PERIOD).toBe(0);
    expect(wrapGroundTime(0)).toBe(0);
    expect(wrapGroundTime(GROUND_TIME_WRAP + 1.5)).toBeCloseTo(1.5, 9);
    expect(wrapGroundTime(1e7 + 0.25)).toBeLessThan(GROUND_TIME_WRAP);
    expect(wrapGroundTime(-1)).toBeCloseTo(GROUND_TIME_WRAP - 1, 9);
    expect(wrapGroundTime(Number.NaN)).toBe(0);
    const pulse = (t: number) => Math.sin(wrapGroundTime(t) * ((2 * Math.PI) / EMBER_PULSE_PERIOD));
    expect(pulse(GROUND_TIME_WRAP - 1e-6)).toBeCloseTo(pulse(GROUND_TIME_WRAP), 4);
  });

  it('keeps the pattern smooth at the far corners, where world coordinates would not', () => {
    // Every Act 2 point lies within 10 km of the origin, so float32 local coordinates keep about a millimetre.
    for (const b of [CINDER, OLD]) {
      for (const [x, z] of [
        [b.x0, b.z0],
        [b.x1, b.z1],
        [b.x0, b.z1],
        [b.x1, b.z0],
      ]) {
        expect(Math.hypot(x - ACT2_GROUND_ORIGIN.x, z - ACT2_GROUND_ORIGIN.z)).toBeLessThan(10000);
      }
    }
    // A vertex 3.2 km chunk-centre offset plus a sub-metre step, as the GPU forms it: steps of 5 cm survive.
    const centre = OLD.x1 - 1600;
    const a = shaderLocal(centre, ACT2_GROUND_ORIGIN.x, 1599.9);
    const b = shaderLocal(centre, ACT2_GROUND_ORIGIN.x, 1599.95);
    expect(b - a).toBeGreaterThan(0.04);
    expect(b - a).toBeLessThan(0.06);
    // The float32 pattern matches the exact one closely across a seam cell.
    for (let k = 0; k < 40; k++) {
      const ex = OLD.x1 - ACT2_GROUND_ORIGIN.x - k * 0.37;
      const ez = OLD.z1 - ACT2_GROUND_ORIGIN.z - k * 0.29;
      expect(Math.abs(seamAt(ex, ez) - seamAt(Math.fround(ex), Math.fround(ez)))).toBeLessThan(1e-3);
    }
  });

  it('has a ground key for each Act 2 and Act 3 region and none for the rest', () => {
    for (const id of REGION_IDS) {
      const touches = chunkTouchesGround((engineBox(id).x0 + engineBox(id).x1) / 2, (engineBox(id).z0 + engineBox(id).z1) / 2, 100);
      expect(touches).toBe(['cinderreach', 'oldsmoke', 'greyfen', 'dragonspine'].includes(id));
    }
  });
});

describe('Act 3 ground weights', () => {
  it('are 1 inside Greyfen and Dragonspine, 0 far away, and blend between', () => {
    expect(groundWeights(3000, 12500)).toEqual({ cinderreach: 0, oldsmoke: 0, greyfen: 1, dragonspine: 0 });
    expect(groundWeights(14000, 15000)).toEqual({ cinderreach: 0, oldsmoke: 0, greyfen: 0, dragonspine: 1 });
    expect(groundWeights(9000, 8000)).toEqual({ cinderreach: 0, oldsmoke: 0, greyfen: 0, dragonspine: 0 });
    const gb = engineBox('greyfen');
    expect(groundWeights(gb.x1 + GROUND_BLEND / 2, 12500).greyfen).toBeCloseTo(0.5, 5);
    expect(groundWeights(gb.x1 + GROUND_BLEND + 1, 12500).greyfen).toBe(0);
    const db = engineBox('dragonspine');
    expect(groundWeights(db.x0 - GROUND_BLEND / 2, 15000).dragonspine).toBeCloseTo(0.5, 5);
    expect(groundWeights(db.x0 - GROUND_BLEND - 1, 15000).dragonspine).toBe(0);
  });

  it('leave Act 1 and Act 2 colours and weights unchanged at sample points', () => {
    for (const [x, z] of [[3000, 2000], [19000, 1500], [19500, 9500], [20500, 6200], [8200, 5000]] as const) {
      const w = groundWeights(x, z);
      expect(w.greyfen).toBe(0);
      expect(w.dragonspine).toBe(0);
      const a = new Float32Array([0.2, 0.4, 0.1]);
      const b = new Float32Array(a);
      groundColor(x, z, 0.9, a, 0);
      groundColor(x, z, 0.9, b, 0, 300);
      expect(Array.from(b)).toEqual(Array.from(a));
    }
    expect(grassRule(3000, 2000).tint).toBeNull();
    expect(grassRule(19000, 1500).tint).toEqual(GROUND_RULES.cinderreach.grass);
    expect(grassRule(19500, 9500).tint).toEqual(GROUND_RULES.oldsmoke.grass);
  });

  it('give each region its own grass: silver-green dense in the fen, sparse and pale on the peaks', () => {
    const fen = grassRule(3000, 12500);
    expect(fen.tint).toEqual(GROUND_RULES.greyfen.grass);
    expect(fen.density).toBe(GROUND_RULES.greyfen.grassDensity);
    const peak = grassRule(14000, 15000);
    expect(peak.tint).toEqual(GROUND_RULES.dragonspine.grass);
    expect(peak.density).toBeCloseTo(GROUND_RULES.dragonspine.grassDensity, 9);
    expect(GROUND_RULES.dragonspine.grassDensity).toBeLessThan(0.3);
    const [r, g, b] = GROUND_RULES.greyfen.grass;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});

describe('region-local origins', () => {
  it('keep the local coordinate small at the far corners of both regions', () => {
    const dx = 16500 - DRAGONSPINE_GROUND_ORIGIN.x;
    const dz = 16500 - DRAGONSPINE_GROUND_ORIGIN.z;
    expect(Math.hypot(dx, dz)).toBeLessThan(4000);
    // The Greyfen's west edge, 3.5 km west of its origin: each axis under 4 km (about 4.6 km diagonally, float32 keeps 0.5 mm).
    const gx = -500 - GREYFEN_GROUND_ORIGIN.x;
    const gz = 15500 - GREYFEN_GROUND_ORIGIN.z;
    expect(Math.abs(gx)).toBeLessThan(4000);
    expect(Math.abs(gz)).toBeLessThan(4000);
    expect(Math.hypot(gx, gz)).toBeLessThan(5000);
    // And the float32 form the shader builds keeps sub-millimetre steps there.
    expect(shaderLocal(16500 - 1600, DRAGONSPINE_GROUND_ORIGIN.x, 1599.95) - shaderLocal(16500 - 1600, DRAGONSPINE_GROUND_ORIGIN.x, 1599.9)).toBeGreaterThan(0.04);
  });

  it('are neither Act 2 raw world coordinates nor the Act 2 origin', () => {
    expect(GROUND_ORIGINS.greyfen).not.toEqual(ACT2_GROUND_ORIGIN);
    expect(GROUND_ORIGINS.dragonspine).not.toEqual(ACT2_GROUND_ORIGIN);
    expect(Math.hypot(-500 - ACT2_GROUND_ORIGIN.x, 15500 - ACT2_GROUND_ORIGIN.z)).toBeGreaterThan(10000);
  });

  it('picks each chunk its region origin, and none for Act 1', () => {
    expect(groundOriginFor(3000, 2000, 400)).toBeNull();
    expect(groundOriginFor(3000, 12500, 400)).toBe('greyfen');
    expect(groundOriginFor(1600, 12500, 3200)).toBe('greyfen');
    expect(groundOriginFor(14000, 15000, 400)).toBe('dragonspine');
    expect(groundOriginFor(16400, 16400, 3200)).toBe('dragonspine');
    expect(groundOriginFor(19000, 1500, 400)).toBe('act2');
    expect(groundOriginFor(19500, 9500, 1600)).toBe('act2');
  });

  it('builds one material per origin, each with its own uGroundOrigin', () => {
    const d = createGroundMaterial({ vertexColors: true }, 'dragonspine');
    const g = createGroundMaterial({ vertexColors: true }, 'greyfen');
    expect(d.uniforms.uGroundOrigin.value.toArray()).toEqual([DRAGONSPINE_GROUND_ORIGIN.x, DRAGONSPINE_GROUND_ORIGIN.z]);
    expect(g.uniforms.uGroundOrigin.value.toArray()).toEqual([GREYFEN_GROUND_ORIGIN.x, GREYFEN_GROUND_ORIGIN.z]);
    expect(d.uniforms.uGroundVein.value).toBe(1);
    expect(g.uniforms.uGroundVein.value).toBe(0);
    expect(d.material.customProgramCacheKey()).not.toBe(g.material.customProgramCacheKey());
    d.material.dispose();
    g.material.dispose();
  });
});

describe('Greyfen marsh colour', () => {
  const soil = GROUND_RULES.greyfen.soil;
  it('is silver-green on dry flat ground and darker where the ground sits at the water table', () => {
    // Find a spot with no peat so only the wet darkening differs.
    let spot: [number, number] | null = null;
    for (let x = 1000; x < 2000 && !spot; x += 13) if (peatMask(x, 12000) === 0) spot = [x, 12000];
    expect(spot).not.toBeNull();
    const [x, z] = spot!;
    const dry = new Float32Array([0.3, 0.5, 0.2]);
    const wet = new Float32Array([0.3, 0.5, 0.2]);
    groundColor(x, z, 0.99, dry, 0, 12);
    groundColor(x, z, 0.99, wet, 0, 6);
    expect(dry[0]).toBeCloseTo(soil[0], 5);
    expect(dry[1]).toBeCloseTo(soil[1], 5);
    expect(dry[1]).toBeGreaterThan(dry[0]);
    expect(wet[1]).toBeLessThan(dry[1] * 0.6);
    expect(wetWeight(6)).toBe(1);
    expect(wetWeight(6 + WET_BAND)).toBe(0);
    expect(wetWeight(10)).toBe(0);
  });

  it('has dark peat patches from a low-frequency mask, covering only part of the fen', () => {
    let peat = 0;
    let n = 0;
    for (let x = 0; x < 6000; x += 60) for (let z = 10000; z < 15000; z += 60, n++) if (peatMask(x, z) > 0.5) peat++;
    expect(peat / n).toBeGreaterThan(0.05);
    expect(peat / n).toBeLessThan(0.6);
    let spot: [number, number] | null = null;
    for (let x = 0; x < 6000 && !spot; x += 7) if (peatMask(x, 12000) === 1) spot = [x, 12000];
    const out = new Float32Array([0.3, 0.5, 0.2]);
    groundColor(spot![0], spot![1], 0.99, out, 0, 12);
    expect(out[1]).toBeLessThan(soil[1] * 0.5);
  });
});

describe('Dragonspine snow and veins', () => {
  it('has no snow at 300 m, full snow at 500 m on flat ground, none on a cliff', () => {
    expect(snowWeight(300, 1)).toBe(0);
    expect(snowWeight(SNOW_LINE, 1)).toBe(0);
    expect(snowWeight(500, 1)).toBe(1);
    expect(snowWeight(SNOW_FULL, 1)).toBe(1);
    expect(snowWeight(440, 1)).toBeGreaterThan(0);
    expect(snowWeight(440, 1)).toBeLessThan(1);
    expect(snowWeight(600, Math.cos((41 * Math.PI) / 180))).toBe(0);
    expect(snowWeight(600, 0.2)).toBe(0);
    expect(snowWeight(600, Math.cos((30 * Math.PI) / 180))).toBeGreaterThan(0.9);
  });

  it('paints black rock low, white high, and dark cliffs', () => {
    const low = new Float32Array([0.3, 0.5, 0.2]);
    const high = new Float32Array([0.3, 0.5, 0.2]);
    const cliff = new Float32Array([0.3, 0.5, 0.2]);
    groundColor(14000, 15000, 0.99, low, 0, 300);
    groundColor(14000, 15000, 0.99, high, 0, 520);
    groundColor(14000, 15000, 0.3, cliff, 0, 520);
    expect(Math.max(...low)).toBeLessThan(0.08);
    expect(Math.min(...high)).toBeGreaterThan(0.7);
    expect(Math.max(...cliff)).toBeLessThan(0.08);
  });

  it('weights veins on bare rock only, and writes them to ground.x of a Dragonspine chunk', () => {
    expect(veinWeight(14000, 15000, 300, 0.99)).toBe(1);
    expect(veinWeight(14000, 15000, 520, 0.99)).toBe(0);
    expect(veinWeight(3000, 12500, 300, 0.99)).toBe(0);
    const cg = chunkGround(14000, 15000, 400, heightAt)!;
    const col = new Float32Array(3);
    const g = new Float32Array(2);
    cg.vertex(14000, 15000, 300, 0.99, col, 0, g, 0);
    expect(g[0]).toBe(1);
    expect(g[1]).toBe(0);
    cg.vertex(14000, 15000, 520, 0.99, col, 0, g, 0);
    expect(g[0]).toBe(0);
    // A Greyfen chunk carries no vein or ember weight.
    const fen = chunkGround(3000, 12500, 400, heightAt)!;
    fen.vertex(3000, 12500, 8, 0.99, col, 0, g, 0);
    expect(Array.from(g)).toEqual([0, 0]);
  });

  it('draws veins rarely and thinly, from region-local coordinates', () => {
    let lit = 0;
    let n = 0;
    for (let lx = -2000; lx < 2000; lx += 5) for (let lz = -2000; lz < 2000; lz += 5, n++) if (veinAt(lx, lz) > 0.3) lit++;
    expect(lit / n).toBeGreaterThan(0);
    expect(lit / n).toBeLessThan(0.02);
    const lib = THREE.ShaderLib.standard;
    const { fragment } = injectGround(lib.vertexShader, lib.fragmentShader);
    expect(fragment).toContain('groundVeinStreak(vGroundLocal)');
  });
});
