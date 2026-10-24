import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SWAP_ASSETS } from '../assets/swap/swapModels';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { diskSource } from '../assets/swap/testing/diskSource';
import { MINE_DEFS } from '../oldsmoke/mines';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ACT2_INTERIORS } from './act2';
import { HARROWMARK_INTERIORS } from './harrowmark';
import { buildInterior } from './build';
import { dressInterior, interiorModelIds, planInterior, planTorches, type InteriorPiece } from './interiorArt';
import { layoutInterior, type SolidBox } from './layout';
import { UNDERWAYS_DEF } from './underways/generate';
import { VAULT_DEF } from './vaultDef';
import { COVER_HEIGHT, MAX_ASPECT, MIN_COVERAGE, heightGrid, planProp } from './propFit';

/** Piece counts per non-mine interior, as planned before the mine dressing existed (d2cfc38); the mine work must not move them. */
const NON_MINE_PIECES: Record<string, Record<string, number>> = {
  'chapel-vault': { 'wall:dun/wall': 79, 'floor:dun/floor_tile_large': 60, 'wall:dun/wall_window_open': 5, 'pillar:dun/pillar': 4 },
  'tilted-anvil': { 'wall:dun/wall': 21, 'floor:dun/floor_wood_large': 15, 'wall:dun/wall_window_open': 2, 'prop:dun/table_long': 1, 'prop:dun/table_medium': 5, 'prop:fur/bed_single_A': 1 },
  'keep-hall': { 'wall:dun/wall': 48, 'floor:dun/floor_tile_large': 32, 'pillar:dun/pillar': 8 },
  'counting-house': { 'wall:dun/wall': 39, 'wall:dun/wall_window_open': 6, 'floor:dun/floor_wood_large': 35, 'prop:fur/table_medium_long': 7, 'prop:fur/cabinet_medium': 1, 'prop:dun/shelves': 4 },
  'archive': { 'wall:dun/wall': 60, 'floor:dun/floor_wood_large': 28, 'prop:fur/table_small': 1, 'prop:dun/table_medium': 4, 'prop:dun/shelves': 5 },
  'underways': { 'wall:dun/wall_broken': 79, 'wall:dun/wall': 181, 'floor:dun/floor_tile_large': 213, 'wall:dun/wall_cracked': 84 },
  'scorchhold-keep': { 'wall:dun/wall': 74, 'floor:dun/floor_tile_large': 69, 'pillar:dun/pillar': 4, 'prop:fur/table_medium_long': 4 },
  'grisel-hall': { 'wall:dun/wall': 97, 'wall:dun/wall_window_open': 16, 'floor:dun/floor_tile_large': 104, 'pillar:dun/pillar': 4, 'prop:dun/table_medium': 2, 'prop:fur/table_medium_long': 1, 'prop:fur/cabinet_medium': 1, 'prop:dun/shelves': 3 },
};

let lib: ModelLibrary;
let physics: PhysicsWorld;
beforeAll(async () => {
  lib = new ModelLibrary(await diskSource());
  await lib.preload(interiorModelIds());
  physics = new PhysicsWorld();
  await physics.init();
});
afterAll(() => physics.dispose());
const tpl = (id: string) => lib.peek(id);
const layouts = () => MINE_DEFS.map((d) => ({ d, layout: layoutInterior(d, () => 0) }));
const propBoxes = (boxes: readonly SolidBox[]) => boxes.filter((b) => b.kind === 'prop' && b.propId);
const propIds = () => [...new Set(layouts().flatMap(({ layout }) => propBoxes(layout.boxes).map((b) => b.propId!)))];
const triangles = (pieces: readonly InteriorPiece[]) =>
  pieces.reduce((n, p) => n + tpl(p.model)!.parts.reduce((a, part) => a + (part.geometry.getIndex() ? part.geometry.getIndex()!.count : part.geometry.getAttribute('position').count) / 3, 0), 0);
const scaleOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixScale(m);

describe('mine interior dressing', () => {
  it('dresses carts, crates, pumps, rubble, collapses, chain posts and pipes with models in the manifest; nests, pools and lava keep boxes', () => {
    const dressed = new Set<string>();
    for (const { d, layout } of layouts()) {
      const plan = planInterior(d.id, layout.boxes, tpl);
      for (const p of plan.dressedProps) dressed.add(p);
      for (const p of plan.pieces) expect(SWAP_ASSETS[p.model], p.model).toBeDefined();
    }
    for (const id of propIds()) if (/^(nest|pool|lava)\./.test(id)) expect(dressed.has(id), id).toBe(false);
    for (const id of interiorModelIds()) expect(tpl(id), id).not.toBeNull();
    for (const cls of ['cart', 'crate', 'pump.body', 'pump.crate', 'rubble', 'collapse', 'chainpost', 'pipes']) {
      expect([...dressed].some((i) => i === cls || i.startsWith(`${cls}.`)), cls).toBe(true);
    }
  });

  it('matches whole id segments: pump.crate is a crate stack, not a pump barrel', () => {
    const { d, layout } = layouts().find(({ d }) => d.id === 'mine-old-galleries')!;
    const { pieces } = planInterior(d.id, layout.boxes, tpl);
    const models = (id: string) => new Set(pieces.filter((p) => p.propId === id).map((p) => p.model));
    expect([...models('pump.crate')]).toContain('dun/crates_stacked');
    expect([...models('pump.crate')].some((m) => /barrel|keg/.test(m))).toBe(false);
    expect([...models('pump.body')].every((m) => /barrel|keg/.test(m))).toBe(true);
  });

  it('uses a dirt floor laid flush (local y 0 on the slab top) and only plain or cracked walls, never the see-through broken one', () => {
    for (const { d, layout } of layouts()) {
      const { pieces } = planInterior(d.id, layout.boxes, tpl);
      const models = new Set(pieces.map((p) => p.model));
      expect(models.has('dun/floor_dirt_large'), d.id).toBe(true);
      expect(models.has('dun/floor_tile_large'), d.id).toBe(false);
      expect(models.has('dun/wall_broken'), d.id).toBe(false);
      expect(models.has('dun/wall_cracked'), d.id).toBe(true);
      const slabTops = layout.boxes.filter((b) => b.kind === 'floor').map((b) => b.max.y);
      for (const p of pieces.filter((x) => x.kind === 'floor')) {
        const y = new THREE.Vector3(0, 0, 0).applyMatrix4(p.matrix).y;
        expect(Math.min(...slabTops.map((t) => Math.abs(y - t))), d.id).toBeLessThan(0.03);
      }
    }
  });

  it('adds no colliders: the physics world holds exactly the layout boxes before and after dressing, boxes and doors untouched', async () => {
    for (const { d, layout } of layouts()) {
      const built = buildInterior(layout, physics);
      const live = physics.world.colliders.len();
      const boxes = JSON.stringify(layout.boxes);
      const doors = JSON.stringify(d.doors);
      expect(await dressInterior(lib, built)).toBeGreaterThan(0);
      expect(physics.world.colliders.len(), d.id).toBe(live);
      expect(JSON.stringify(layout.boxes), d.id).toBe(boxes);
      expect(JSON.stringify(d.doors), d.id).toBe(doors);
      built.dispose();
      expect(physics.world.colliders.len(), d.id).toBe(live - layout.boxes.length);
    }
  });

  it('never stretches a dressed prop out of shape: per-axis scale ratio within MAX_ASPECT for every mine prop piece', () => {
    let pieces = 0;
    for (const { d, layout } of layouts()) {
      for (const p of planInterior(d.id, layout.boxes, tpl).pieces.filter((x) => x.kind === 'prop')) {
        const s = scaleOf(p.matrix);
        const ratio = Math.max(s.x, s.y, s.z) / Math.min(s.x, s.y, s.z);
        expect(ratio, `${d.id} ${p.propId} ${p.model}`).toBeLessThanOrEqual(MAX_ASPECT + 1e-6);
        pieces++;
      }
    }
    expect(pieces).toBeGreaterThan(40);
  });

  it('keeps the visible model over the collider: at least 80 percent of every dressed prop footprint is covered (model or skirt)', () => {
    const CELL = 0.25;
    let skirts = 0;
    for (const { d, layout } of layouts()) {
      const plan = planInterior(d.id, layout.boxes, tpl);
      skirts += plan.pieces.filter((p) => p.kind === 'skirt').length;
      for (const b of propBoxes(layout.boxes).filter((x) => plan.dressedProps.has(x.propId!))) {
        const h = b.max.y - b.min.y;
        const nx = Math.ceil((b.max.x - b.min.x) / CELL);
        const nz = Math.ceil((b.max.z - b.min.z) / CELL);
        const covered = new Set<number>();
        for (const p of plan.pieces.filter((x) => x.propId === b.propId)) {
          if (p.kind === 'skirt') {
            // The thin dirt base lies over the whole footprint (the floor model's own extent, scaled to the box).
            const sx = scaleOf(p.matrix);
            const t = tpl(p.model)!;
            expect(sx.x * (t.bounds.max.x - t.bounds.min.x), `${d.id} ${b.propId} skirt`).toBeCloseTo(b.max.x - b.min.x, 3);
            expect(sx.z * (t.bounds.max.z - t.bounds.min.z), `${d.id} ${b.propId} skirt`).toBeCloseTo(b.max.z - b.min.z, 3);
            for (let ci = 0; ci < nx; ci++) for (let cj = 0; cj < nz; cj++) covered.add(ci * nz + cj);
            continue;
          }
          const t = tpl(p.model)!;
          const grid = heightGrid(t);
          const n = Math.sqrt(grid.length);
          const sy = scaleOf(p.matrix).y;
          const size = { x: t.bounds.max.x - t.bounds.min.x, z: t.bounds.max.z - t.bounds.min.z };
          // Sample each model raster cell centre in world space (4 sub-samples per cell) and mark the footprint cell it lands in.
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              if (grid[i * n + j] * sy < COVER_HEIGHT * h) continue;
              for (const [fx, fz] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                const v = new THREE.Vector3(t.bounds.min.x + ((i + fx) / n) * size.x, 0, t.bounds.min.z + ((j + fz) / n) * size.z).applyMatrix4(p.matrix);
                const ci = Math.floor((v.x - b.min.x) / CELL);
                const cj = Math.floor((v.z - b.min.z) / CELL);
                if (ci >= 0 && ci < nx && cj >= 0 && cj < nz) covered.add(ci * nz + cj);
              }
            }
          }
        }
        expect(covered.size / (nx * nz), `${d.id} ${b.propId}`).toBeGreaterThanOrEqual(MIN_COVERAGE - 0.05);
      }
    }
    expect(skirts).toBeGreaterThan(0);
  });

  it('keeps the greybox for a prop no model fits within the aspect rule instead of stretching one', () => {
    const lower = layouts().find(({ d }) => d.id === 'mine-lower-galleries')!;
    const plan = planInterior(lower.d.id, lower.layout.boxes, tpl);
    expect(plan.dressedProps.has('chainpost.1')).toBe(true);
    const long = { kind: 'prop', propId: 'crate.long', min: { x: 0, y: 0, z: 0 }, max: { x: 0.4, y: 3, z: 12 } } as SolidBox;
    expect(planInterior('mine-old-galleries', [long], tpl).dressedProps.size).toBe(0);
  });

  it('dresses the lower-galleries rack as two back-to-back rows of four shelves instead of a brown box', () => {
    const lower = layouts().find(({ d }) => d.id === 'mine-lower-galleries')!;
    const { pieces, dressedProps } = planInterior(lower.d.id, lower.layout.boxes, tpl);
    expect(dressedProps.has('rack.1')).toBe(true);
    const rack = pieces.filter((p) => p.propId === 'rack.1');
    expect(rack).toHaveLength(8);
    expect(rack.every((p) => p.model === 'dun/shelves' && p.kind === 'prop')).toBe(true);
    expect(new Set(rack.map((p) => new THREE.Vector3().setFromMatrixPosition(p.matrix).x.toFixed(2))).size).toBe(2);
  });

  it('draws rubble and collapses about 15 percent wider than their box on a thin dirt base, not a stone plinth', () => {
    const old = layouts().find(({ d }) => d.id === 'mine-old-galleries')!;
    const { pieces } = planInterior(old.d.id, old.layout.boxes, tpl);
    const box = old.layout.boxes.find((b) => b.propId === 'collapse.heap')!;
    const rubble = pieces.filter((p) => p.propId === 'collapse.heap' && p.kind === 'prop');
    expect(rubble.length).toBeGreaterThan(0);
    // Each pile instance is 15 percent past the cell the plain fit gives it, in x and z only.
    const plain = planProp(box, [tpl(rubble[0].model)!])!.placements[0];
    const grown = scaleOf(rubble[0].matrix);
    expect(grown.x / plain.sx).toBeCloseTo(1.15, 2);
    expect(grown.z / plain.sz).toBeCloseTo(1.15, 2);
    expect(grown.y / plain.sy).toBeCloseTo(1, 2);
    const skirts = pieces.filter((p) => p.kind === 'skirt');
    expect(skirts.length).toBeGreaterThan(0);
    for (const sk of skirts) {
      expect(sk.model).toBe('dun/floor_dirt_large');
      // Thin: no taller than the dirt floor's own lumps.
      expect(scaleOf(sk.matrix).y).toBeLessThanOrEqual(1.0001);
    }
  });

  it('does not draw models over a visible greybox when the skirt template is missing: those props keep the box and get no pieces', () => {
    for (const { d, layout } of layouts()) {
      const noSkirt = (id: string) => (id === 'dun/floor_dirt_large' ? null : tpl(id));
      const full = planInterior(d.id, layout.boxes, tpl);
      const plan = planInterior(d.id, layout.boxes, noSkirt);
      const skirted = new Set(full.pieces.filter((p) => p.kind === 'skirt').map((p) => p.propId!));
      expect(plan.pieces.some((p) => p.kind === 'skirt'), d.id).toBe(false);
      for (const id of skirted) {
        expect(plan.dressedProps.has(id), `${d.id} ${id}`).toBe(false);
        expect(plan.pieces.some((p) => p.propId === id), `${d.id} ${id}`).toBe(false);
      }
      for (const p of plan.pieces.filter((x) => x.kind === 'prop')) expect(plan.dressedProps.has(p.propId!), `${d.id} ${p.propId}`).toBe(true);
    }
  });

  it('keeps every mine under the Underways triangle count (worn walls are mostly plain)', () => {
    const underways = triangles(planInterior(UNDERWAYS_DEF.id, layoutInterior(UNDERWAYS_DEF, () => 0).boxes, tpl).pieces);
    expect(underways).toBeGreaterThan(300_000);
    for (const { d, layout } of layouts()) {
      const dressed = triangles([...planInterior(d.id, layout.boxes, tpl).pieces, ...planTorches(d.id, layout.boxes, layout.torches, tpl).pieces]);
      expect(dressed, d.id).toBeLessThanOrEqual(underways);
    }
  });

  it('plans the same pieces as before for every non-mine interior (piece counts by kind and model)', () => {
    const counts = (id: string, boxes: readonly SolidBox[]) => {
      const c: Record<string, number> = {};
      for (const p of planInterior(id, boxes, tpl).pieces) c[`${p.kind}:${p.model}`] = (c[`${p.kind}:${p.model}`] ?? 0) + 1;
      return c;
    };
    const defs = [VAULT_DEF, ...HARROWMARK_INTERIORS, UNDERWAYS_DEF, ...ACT2_INTERIORS].filter((d) => !d.id.startsWith('mine-'));
    const got = Object.fromEntries(defs.map((d) => [d.id, counts(d.id, layoutInterior(d, () => 0).boxes)]));
    expect(got).toEqual(NON_MINE_PIECES);
  });

  it('preloads the mine models only for mine interiors', () => {
    expect(interiorModelIds('mine-deepdelve')).toContain('dun/crates_stacked');
    expect(interiorModelIds('tilted-anvil')).not.toContain('dun/crates_stacked');
    expect(interiorModelIds('tilted-anvil')).not.toContain('dun/torch_mounted');
    expect(interiorModelIds()).toContain('dun/rubble_large');
  });

  it('only dresses props of mine interiors: a crate. id elsewhere is untouched', () => {
    const box = (propId: string): SolidBox => ({ kind: 'prop', propId, min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 2 } }) as SolidBox;
    const boxes = ['crate.1', 'cart.1', 'rack.1', 'rubble.1', 'pump.body', 'pipes.1'].map(box);
    for (const id of ['tilted-anvil', 'underways', 'counting-house', ...HARROWMARK_INTERIORS.map((d) => d.id)]) {
      const plan = planInterior(id, boxes, tpl);
      expect(plan.dressedProps.size, id).toBe(0);
      expect(plan.pieces.filter((p) => p.kind === 'prop' || p.kind === 'skirt'), id).toEqual([]);
    }
    expect(planInterior('mine-old-galleries', boxes, tpl).dressedProps.has('crate.1')).toBe(true);
  });

  describe('torches', () => {
    it('mounts a torch model on a wall for nearly every torch, none for non-mine ids', () => {
      let total = 0;
      for (const { d, layout } of layouts()) {
        const { pieces } = planTorches(d.id, layout.boxes, layout.torches, tpl);
        total += layout.torches.length;
        expect(pieces.length, d.id).toBeGreaterThanOrEqual(Math.floor(layout.torches.length * 0.85));
        expect(pieces.every((p: InteriorPiece) => p.model === 'dun/torch_mounted')).toBe(true);
      }
      expect(total).toBeGreaterThan(20);
      const { layout } = layouts()[0];
      expect(planTorches('tilted-anvil', layout.boxes, layout.torches, tpl).pieces).toEqual([]);
    });

    it('keeps the glowing head at least as bright as the bare one, on the bracket tip', async () => {
      for (const { d, layout } of layouts()) {
        const built = buildInterior(layout, null);
        const plan = planTorches(d.id, layout.boxes, layout.torches, tpl);
        const bare = built.layout.torches.map((_, i) => (built.root.getObjectByName(`${built.root.name}-torch-${i}`) as THREE.Mesh).position.clone());
        await dressInterior(lib, built);
        const heads = built.layout.torches.map((_, i) => built.root.getObjectByName(`${built.root.name}-torch-${i}`) as THREE.Mesh);
        for (const h of heads) {
          const m = h.material as THREE.MeshStandardMaterial;
          expect(h.visible).toBe(true);
          // Emissive area (head scale squared) times intensity is the bare head's or more.
          expect(h.scale.x * h.scale.x * m.emissiveIntensity, d.id).toBeGreaterThanOrEqual(2.5 - 1e-9);
        }
        const walls = layout.boxes.filter((b) => b.kind === 'wall');
        for (const n of plan.normals) {
          const head = heads[n.index].position;
          // Distance from the wall face along the normal equals the bracket's reach, whatever the torch's own offset was.
          const wallX = bare[n.index].x - n.nx * n.d;
          const wallZ = bare[n.index].z - n.nz * n.d;
          expect((head.x - wallX) * n.nx + (head.z - wallZ) * n.nz, `${d.id} torch ${n.index}`).toBeCloseTo(0.35, 2);
          expect(walls.length).toBeGreaterThan(0);
        }
        built.dispose();
      }
    });
  });

  it('falls back to the greybox boxes when the models fail to load', async () => {
    const built = buildInterior(layoutInterior(MINE_DEFS[2], () => 0), null);
    const headBefore = built.root.getObjectByName(`${built.root.name}-torch-0`)!.position.clone();
    expect(await dressInterior(new ModelLibrary(undefined, () => undefined), built)).toBe(0);
    for (const k of ['floor', 'wall', 'prop']) expect((built.root.getObjectByName(`${built.root.name}-${k}`) as THREE.Mesh).visible, k).toBe(true);
    expect(built.root.getObjectByName(`${built.root.name}-torch-0`)!.position.equals(headBefore)).toBe(true);
    built.dispose();
    // Only some models missing: those props keep their boxes, the rest is still dressed.
    const layout = layoutInterior(MINE_DEFS[1], () => 0);
    const noProps = planInterior(MINE_DEFS[1].id, layout.boxes, (id) => (['dun/crates_stacked', 'dun/box_large', 'dun/rubble_large', 'dun/rubble_half'].includes(id) ? null : tpl(id)));
    expect([...noProps.dressedProps].some((p) => /^(cart|rubble)\./.test(p))).toBe(false);
    expect(noProps.covers.has('floor')).toBe(true);
    expect(planTorches(MINE_DEFS[1].id, layout.boxes, layout.torches, () => null).pieces).toEqual([]);
  });
});
