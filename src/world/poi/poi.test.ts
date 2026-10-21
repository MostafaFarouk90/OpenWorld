import { describe, expect, it } from 'vitest';
import { readFileSync } from '../../region/testing/nodeFs';
import { parseInteractableId } from '../../interaction/ids';
import { isKnownStructureKind } from '../../region/structureKinds';
import { validateLayout } from '../../region/validateLayout';
import { registerPoiKinds } from './kinds';
import { ACT2_POI_GOLD, ACT2_POI_GOLD_CAP, POI_LOOT, lootFor, setPoiGold, validateLoot } from './loot';
import { FOX_FIRE_RADIUS, foxFireReveals } from './foxFire';
import { anchorId, placePiece, toWorld } from './place';
import { makeRng } from './rng';
import { buildPiece, POI_STRUCTURE_KINDS } from './templates';
import { POI_TEMPLATES, type PoiParams, type PoiTemplate } from './types';

const VARIANTS: Array<[PoiTemplate, PoiParams]> = [
  ['camp', { tint: 'traveller', chest: true }],
  ['camp', { tint: 'hunter', size: 1 }],
  ['camp', { tint: 'ash-cultist', size: 0 }],
  ['cave', {}],
  ['cave', { ledge: true }],
  ['ruin', { amount: 0.1 }],
  ['ruin', { amount: 1, ledge: true }],
  ['lore-stone', {}],
  ['lore-stone', { ledge: true }],
  ['wyrm-nest', { amount: 0.2 }],
  ['wyrm-nest', { amount: 1, ledge: true }],
  ['hunter-pen', { amount: 1 }],
  ['vista', { amount: 0 }],
];

const ROOT = 'public/assets';
const exists = (f: string): boolean => {
  try {
    readFileSync(f);
    return true;
  } catch {
    return false;
  }
};
function assetPath(id: string): string | null {
  const [pack, name] = id.split('/');
  if (pack === 'hex') return `${ROOT}/kaykit-medieval-hexagon/${name}.gltf`;
  if (pack === 'hal') return `${ROOT}/kaykit-halloween/${name}.gltf`;
  if (pack === 'dun') return [`${ROOT}/kaykit-dungeon-remastered/${name}.gltf.glb`, `${ROOT}/kaykit-dungeon-remastered/${name}.glb`].find(exists) ?? null;
  return null;
}

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = makeRng('x');
    const b = makeRng('x');
    const seq = (r: ReturnType<typeof makeRng>) => Array.from({ length: 8 }, () => r.next());
    expect(seq(a)).toEqual(seq(b));
    expect(seq(makeRng('x'))).not.toEqual(seq(makeRng('y')));
  });
  it('pick on an empty list throws and int stays in range', () => {
    expect(() => makeRng('z').pick([])).toThrow();
    const r = makeRng('range');
    for (let i = 0; i < 200; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('templates', () => {
  it.each(VARIANTS)('%s %j builds a sane piece', (template, params) => {
    const piece = buildPiece('site-1', template, params);
    expect(piece.template).toBe(template);
    expect(piece.parts.length).toBeGreaterThan(0);
    for (const p of piece.parts) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.scale)).toBe(true);
      expect(p.scale).toBeGreaterThan(0);
    }
    const ids = piece.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('main');
    for (const i of piece.interactables) {
      expect(() => parseInteractableId(i.id)).not.toThrow();
      expect(parseInteractableId(i.id).kind).toBe(i.kind);
      expect(ids).toContain(i.anchor);
    }
    for (const s of piece.structures) expect(s.id.startsWith('poi-a2-site-1-')).toBe(true);
  });

  it('covers all seven templates', () => {
    expect(new Set(VARIANTS.map(([t]) => t))).toEqual(new Set(POI_TEMPLATES));
  });

  it('is deterministic: same id and params deep-equal; different id differs', () => {
    for (const [t, p] of VARIANTS) {
      expect(buildPiece('a-1', t, p)).toEqual(buildPiece('a-1', t, p));
    }
    expect(buildPiece('a-1', 'camp', {})).not.toEqual(buildPiece('a-2', 'camp', {}));
  });

  it('Leap variants carry a ledge, a launch anchor 2 to 4 m from the edge and leap-gated tags', () => {
    for (const [t, p] of VARIANTS.filter(([, p]) => p.ledge)) {
      const piece = buildPiece('lp', t, p);
      expect(piece.leap).toBe(true);
      const ledge = piece.structures.find((s) => s.role === 'ledge')!;
      expect(ledge.height).toBeGreaterThanOrEqual(1.7);
      expect(ledge.height).toBeLessThanOrEqual(1.9);
      expect(ledge.footprint[1]).toBeGreaterThanOrEqual(3);
      const launch = piece.anchors.find((a) => a.id === 'ledge.launch')!;
      const top = piece.anchors.find((a) => a.id === 'ledge')!;
      expect(top.tags).toContain('leap-gated');
      const edge = ledge.z - ledge.footprint[1] / 2;
      expect(edge - launch.z).toBeGreaterThanOrEqual(2);
      expect(edge - launch.z).toBeLessThanOrEqual(4);
    }
  });

  it('non-Leap pieces have no ledge', () => {
    expect(buildPiece('n', 'camp', {}).leap).toBe(false);
    expect(buildPiece('n', 'camp', {}).structures.some((s) => s.role === 'ledge')).toBe(false);
  });

  it('references only assets that exist in public/assets (or procedural parts)', () => {
    const missing = new Set<string>();
    for (const [t, p] of VARIANTS) {
      for (const part of buildPiece('assets', t, p).parts) {
        if (part.asset.startsWith('proc:')) continue;
        const f = assetPath(part.asset);
        if (!f || !exists(f)) missing.add(part.asset);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('rejects a bad id and an unknown template', () => {
    expect(() => buildPiece('Bad Id', 'camp')).toThrow();
    expect(() => buildPiece('ok', 'castle' as PoiTemplate)).toThrow();
  });

  it('golden: template output is stable (change shows in review)', () => {
    const sig = (t: PoiTemplate, p: PoiParams) => {
      const piece = buildPiece('golden', t, p);
      return `${piece.parts.length}/${piece.anchors.length}/${piece.structures.length}/${piece.interactables.length}`;
    };
    expect(VARIANTS.map(([t, p]) => sig(t, p))).toMatchSnapshot();
  });
});

describe('kinds', () => {
  it('registers once, is refcounted, and releases on the last undo', () => {
    const a = registerPoiKinds();
    const b = registerPoiKinds();
    for (const k of POI_STRUCTURE_KINDS) expect(isKnownStructureKind(k)).toBe(true);
    a();
    a();
    for (const k of POI_STRUCTURE_KINDS) expect(isKnownStructureKind(k)).toBe(true);
    b();
    for (const k of POI_STRUCTURE_KINDS) expect(isKnownStructureKind(k)).toBe(false);
  });
  it('only uses poi- prefixed new kinds', () => {
    for (const k of POI_STRUCTURE_KINDS) expect(k.startsWith('poi-')).toBe(true);
  });
});

describe('place', () => {
  it('rotates local points: yaw 0 keeps them, yaw 90 faces -X', () => {
    expect(toWorld({ x: 10, z: 20, yawDeg: 0 }, 0, -5)).toEqual({ x: 10, z: 15 });
    const w = toWorld({ x: 10, z: 20, yawDeg: 90 }, 0, -5);
    expect(w.x).toBeCloseTo(5);
    expect(w.z).toBeCloseTo(20);
  });
  it('prefixes ids and keeps ledge launch distance under rotation', () => {
    const placed = placePiece({ id: 'nest-1', template: 'wyrm-nest', params: { ledge: true } }, { x: 1000, z: 500, yawDeg: 37 });
    for (const a of placed.layout.anchors) expect(a.id.startsWith('poi.a2.nest-1.')).toBe(true);
    for (const t of placed.layout.triggers) expect(t.id.startsWith('trg.poi.a2.nest-1.')).toBe(true);
    const top = placed.layout.anchors.find((a) => a.id === anchorId('nest-1', 'ledge'))!;
    const launch = placed.layout.anchors.find((a) => a.id === anchorId('nest-1', 'ledge.launch'))!;
    const local = placed.piece.anchors;
    const lt = local.find((a) => a.id === 'ledge')!;
    const ll = local.find((a) => a.id === 'ledge.launch')!;
    expect(Math.hypot(top.x - launch.x, top.z - launch.z)).toBeCloseTo(Math.hypot(lt.x - ll.x, lt.z - ll.z));
  });
  it('throws on a non-finite pose and an unknown template', () => {
    expect(() => placePiece({ id: 'a', template: 'camp' }, { x: NaN, z: 0, yawDeg: 0 })).toThrow();
    expect(() => placePiece({ id: 'a', template: 'castle' as PoiTemplate }, { x: 0, z: 0, yawDeg: 0 })).toThrow();
  });
  it('places far from the origin without precision loss in anchor spacing', () => {
    const a = placePiece({ id: 'far', template: 'camp' }, { x: 22000, z: 3000, yawDeg: 123 });
    const local = a.piece.anchors.find((x) => x.id === 'spawn.1')!;
    const w = a.layout.anchors.find((x) => x.id === anchorId('far', 'spawn.1'))!;
    expect(Math.hypot(w.x - 22000, w.z - 3000)).toBeCloseTo(Math.hypot(local.x, local.z), 6);
  });
  it('produces a layout the validator accepts on flat ground (structures, no overlap with itself)', () => {
    const release = registerPoiKinds();
    try {
      const placed = placePiece({ id: 'v-1', template: 'camp' }, { x: 300, z: 300, yawDeg: 0 });
      const errs = validateLayout(placed.layout, () => 0, { spawnId: null });
      expect(errs).toEqual([]);
    } finally {
      release();
    }
  });
});

describe('loot', () => {
  it('has well-formed loot and a gold table within the cap', () => {
    expect(validateLoot()).toEqual([]);
  });
  it('lootFor returns a copy and falls back to common', () => {
    const a = lootFor('cave');
    a[0].count = 99;
    expect(POI_LOOT.cave[0].count).not.toBe(99);
    expect(lootFor('nope')).toEqual(POI_LOOT.common);
  });
  it('rejects bad gold and loot, and an over-cap total', () => {
    setPoiGold({ a: -1 });
    expect(validateLoot().length).toBeGreaterThan(0);
    setPoiGold({ a: ACT2_POI_GOLD_CAP + 1 });
    expect(validateLoot().join()).toContain('exceeds');
    setPoiGold({});
    POI_LOOT.bad = [{ itemId: 'x', count: 0 }];
    expect(validateLoot().join()).toContain('bad stack');
    delete POI_LOOT.bad;
    expect(Object.keys(ACT2_POI_GOLD)).toEqual([]);
  });
});

describe('foxFire', () => {
  it('reveals only with the buff on and within 20 m', () => {
    expect(foxFireReveals(false, 1, 1)).toBe(false);
    expect(foxFireReveals(true, 19.9, 0)).toBe(true);
    expect(foxFireReveals(true, FOX_FIRE_RADIUS, 0)).toBe(true);
    expect(foxFireReveals(true, 20.1, 0)).toBe(false);
    expect(foxFireReveals(true, 15, 15)).toBe(false);
    expect(foxFireReveals(true, NaN, 0)).toBe(false);
  });
});
