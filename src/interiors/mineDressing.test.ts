import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SWAP_ASSETS } from '../assets/swap/swapModels';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { diskSource } from '../assets/swap/testing/diskSource';
import { MINE_DEFS } from '../oldsmoke/mines';
import { HUNTER_HARPOONER, HUNTER_SPEARMAN } from '../enemies/hunters/def';
import { buildInterior } from './build';
import { dressInterior, interiorModelIds, planInterior, planTorches } from './interiorArt';
import { layoutInterior } from './layout';

/** Static collider counts of the mine layouts before the dressing pass (one cuboid per solid box; the dressing adds none). */
const COLLIDERS_BEFORE: Record<string, number> = {};

let lib: ModelLibrary;
beforeAll(async () => {
  lib = new ModelLibrary(await diskSource());
  await lib.preload(interiorModelIds());
});
const tpl = (id: string) => lib.peek(id);
const fakePhysics = () => {
  let n = 0;
  return {
    count: () => n,
    physics: { rapier: { ColliderDesc: { cuboid: () => ({ setTranslation: () => ({}) }) } }, addStaticCollider: () => ({ setEnabled() {}, n: n++ }), removeCollider() {} } as never,
  };
};
const propIds = () => [...new Set(MINE_DEFS.flatMap((d) => layoutInterior(d, () => 0).boxes.filter((b) => b.kind === 'prop' && b.propId).map((b) => b.propId!)))];

describe('mine interior dressing', () => {
  it('maps every mine prop id class to a model that is in the manifest and on disk, except nests, pools and lava', () => {
    const ids = propIds();
    expect(ids.length).toBeGreaterThan(20);
    const dressed = new Set<string>();
    for (const d of MINE_DEFS) {
      const layout = layoutInterior(d, () => 0);
      const plan = planInterior(d.id, layout.boxes, tpl);
      for (const p of plan.dressedProps) dressed.add(p);
      for (const p of plan.pieces) expect(SWAP_ASSETS[p.model], p.model).toBeDefined();
    }
    for (const id of ids) expect(dressed.has(id), id).toBe(!/^(nest|pool|lava)\./.test(id));
    for (const id of interiorModelIds()) expect(tpl(id), id).not.toBeNull();
    for (const cls of ['cart', 'crate', 'rack', 'pump', 'rubble', 'collapse', 'chainpost', 'pipes']) expect(ids.some((i) => i.startsWith(`${cls}.`)), cls).toBe(true);
  });

  it('gives mines a dirt floor and broken or cracked wall variants', () => {
    const old = MINE_DEFS.find((d) => d.id === 'mine-old-galleries')!;
    const models = new Set(planInterior(old.id, layoutInterior(old, () => 0).boxes, tpl).pieces.map((p) => p.model));
    expect(models.has('dun/floor_dirt_large')).toBe(true);
    expect(models.has('dun/floor_tile_large')).toBe(false);
    expect(models.has('dun/wall_cracked') && models.has('dun/wall_broken')).toBe(true);
    const shaft = MINE_DEFS.find((d) => d.id === 'mine-deepgate-shaft')!;
    const kept = new Set(planInterior(shaft.id, layoutInterior(shaft, () => 0).boxes, tpl).pieces.map((p) => p.model));
    expect(kept.has('dun/wall_broken')).toBe(false);
  });

  it('keeps every mine collider count, box list and door unchanged by dressing', async () => {
    for (const d of MINE_DEFS) {
      const layout = layoutInterior(d, () => 0);
      const { physics, count } = fakePhysics();
      const built = buildInterior(layout, physics);
      const before = count();
      const boxes = JSON.stringify(layout.boxes);
      const doors = JSON.stringify(d.doors);
      expect(before, d.id).toBe(layout.boxes.length);
      expect(await dressInterior(lib, built)).toBeGreaterThan(0);
      expect(count(), d.id).toBe(before);
      expect(JSON.stringify(layout.boxes), d.id).toBe(boxes);
      expect(JSON.stringify(d.doors), d.id).toBe(doors);
      COLLIDERS_BEFORE[d.id] = before;
      built.dispose();
    }
    expect(Object.keys(COLLIDERS_BEFORE)).toHaveLength(5);
  });

  it('mounts a torch model on a wall for nearly every torch, and the emissive head still glows', async () => {
    let total = 0;
    for (const d of MINE_DEFS) {
      const layout = layoutInterior(d, () => 0);
      const { pieces } = planTorches(d.id, layout.boxes, layout.torches, tpl);
      total += layout.torches.length;
      expect(pieces.length, d.id).toBeGreaterThanOrEqual(Math.floor(layout.torches.length * 0.85)); // a torch with no wall within 0.6 m keeps its bare head
      expect(pieces.every((p) => p.model === 'dun/torch_mounted')).toBe(true);
    }
    expect(total).toBeGreaterThan(20);
    const built = buildInterior(layoutInterior(MINE_DEFS[1], () => 0), null);
    await dressInterior(lib, built);
    const heads = built.layout.torches.map((_, i) => built.root.getObjectByName(`${built.root.name}-torch-${i}`) as THREE.Mesh);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) {
      expect(h.visible).toBe(true);
      expect((h.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(1);
    }
    built.dispose();
  });

  it('leaves non-mine interiors without mounted torches', () => {
    const layout = layoutInterior(MINE_DEFS[0], () => 0);
    expect(planTorches('tilted-anvil', layout.boxes, layout.torches, tpl).pieces).toEqual([]);
  });

  it('falls back to the greybox boxes when the models fail to load', async () => {
    const built = buildInterior(layoutInterior(MINE_DEFS[2], () => 0), null);
    const headBefore = built.root.getObjectByName(`${built.root.name}-torch-0`)!.position.clone();
    expect(await dressInterior(new ModelLibrary(undefined), built)).toBe(0);
    for (const k of ['floor', 'wall', 'prop']) expect((built.root.getObjectByName(`${built.root.name}-${k}`) as THREE.Mesh).visible, k).toBe(true);
    expect(built.root.getObjectByName(`${built.root.name}-torch-0`)!.position.equals(headBefore)).toBe(true);
    built.dispose();
    // Only some models missing: those props keep their boxes, the rest is still dressed.
    const layout = layoutInterior(MINE_DEFS[1], () => 0);
    const noProps = planInterior(MINE_DEFS[1].id, layout.boxes, (id) => (['dun/crates_stacked', 'dun/rubble_large'].includes(id) ? null : tpl(id)));
    expect([...noProps.dressedProps].some((p) => /^(cart|rubble)\./.test(p))).toBe(false);
    expect(noProps.covers.has('floor')).toBe(true);
    expect(planTorches(MINE_DEFS[1].id, layout.boxes, layout.torches, () => null).pieces).toEqual([]);
  });
});

describe('hunter weapons', () => {
  it('resolve to Adventurers weapons that exist, with the move hitboxes unchanged', () => {
    const props = [...(HUNTER_SPEARMAN.model.props ?? []), ...(HUNTER_HARPOONER.model.props ?? [])];
    expect(props.map((p) => p.id)).toEqual(['wpn/staff', 'wpn/crossbow_2handed']);
    for (const p of props) {
      expect(SWAP_ASSETS[p.id], p.id).toBeDefined();
      expect(p.bone).toBe('handslotr');
    }
    const strip = (m: (typeof HUNTER_SPEARMAN.moves)[number]) => ({ w: m.windup, r: m.range, c: m.cooldown, rec: m.recover, d: m.damage, p: m.poise, wp: m.weapon, ranged: m.ranged });
    expect(HUNTER_SPEARMAN.moves.map(strip)).toEqual([
      { w: 0.5, r: [0, 1.9], c: 1.6, rec: 0.8, d: 16, p: 18, wp: 'right', ranged: undefined },
      { w: 0.6, r: [5, 14], c: 7, rec: 1.0, d: 4, p: 5, wp: 'right', ranged: { shape: 'net', speed: 16, maxRange: 16, radius: 0.5, originHeight: 1.4, root: 2 } },
    ]);
    expect(HUNTER_HARPOONER.moves.map(strip)[1]).toEqual({ w: 0.9, r: [4, 16], c: 8, rec: 1.2, d: 10, p: 10, wp: 'right', ranged: { shape: 'harpoon', speed: 30, maxRange: 18, radius: 0.35, originHeight: 1.4, pull: 4 } });
  });
});
