import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../../inventory/items';
import '../../../economy/items.act3';
import { hasEnvModel } from '../../../env/envStructureArt';
import { ACT3_POI_PLACED } from './place';
import { A3_BUILDERS, ISLET_TIERS, LEDGE_HEIGHT, buildA3Piece } from './templates';
import { A3_POI_TEMPLATES, A3_TEMPLATES } from './types';
import { a3LootFor } from './content';

describe('Act 3 templates', () => {
  it('ten POI templates plus the road cache, each with a builder', () => {
    expect(A3_POI_TEMPLATES).toHaveLength(10);
    expect(A3_TEMPLATES).toHaveLength(11);
    for (const t of A3_TEMPLATES) expect(typeof A3_BUILDERS[t], t).toBe('function');
  });

  it.each(A3_TEMPLATES)('%s builds the same piece twice from the same id, and a main anchor', (t) => {
    const a = buildA3Piece('same', t, { ledge: true });
    const b = buildA3Piece('same', t, { ledge: true });
    expect(a).toEqual(b);
    expect(a.anchors.some((x) => x.id === 'main')).toBe(true);
    expect(new Set(a.anchors.map((x) => x.id)).size).toBe(a.anchors.length);
    expect(a.parts.length).toBeGreaterThan(2);
  });

  it('seeds decoration from the id', () => {
    const a = buildA3Piece('one', 'stilt-camp');
    const b = buildA3Piece('two', 'stilt-camp');
    expect(a.parts.map((p) => p.x)).not.toEqual(b.parts.map((p) => p.x));
  });

  it('a Leap variant carries the ledge, its launch 5.5 m to local -Z and a cache; others carry none', () => {
    for (const t of ['drowned-church', 'stilt-camp', 'hawk-nest', 'frozen-camp', 'glass-vein', 'leap-cache'] as const) {
      const p = buildA3Piece('lp', t, { ledge: true });
      expect(p.leap, t).toBe(true);
      const ledge = p.anchors.find((a) => a.id === 'ledge')!;
      const launch = p.anchors.find((a) => a.id === 'ledge.launch')!;
      expect(ledge.dy).toBe(LEDGE_HEIGHT);
      expect(ledge.z - launch.z).toBeCloseTo(5.5, 5);
      expect(p.interactables.find((i) => i.prop === 'cache')?.id).toBe('use:poi-a3-lp-ledge');
      expect(p.structures.filter((s) => s.role === 'ledge')).toHaveLength(1);
    }
    for (const t of ['peat-cutting', 'reed-island', 'song-stone', 'hunter-cairn', 'vista'] as const) {
      const p = buildA3Piece('lp', t, { ledge: true });
      expect(p.leap, t).toBe(false);
      expect(p.anchors.some((a) => a.id === 'ledge'), t).toBe(false);
    }
  });

  it('a rubbing adds a stone and a rubbing interactable; a bad rubbing id throws', () => {
    const p = buildA3Piece('hn', 'hawk-nest', { rubbing: 'spine-1' });
    expect(p.interactables.find((i) => i.kind === 'rubbing')?.id).toBe('use:poi-a3-rubbing-spine-1');
    expect(p.anchors.some((a) => a.id === 'rubbing')).toBe(true);
    expect(p.parts.some((x) => x.asset === 'env/dragonspine-carving-stone')).toBe(true);
    expect(() => buildA3Piece('hn', 'hawk-nest', { rubbing: 'anvil-1' })).toThrow(/rubbing/);
    expect(() => buildA3Piece('lc', 'leap-cache', { rubbing: 'spine-9' })).toThrow(/rubbing/);
  });

  it('refuses a bad id or an unknown template', () => {
    expect(() => buildA3Piece('Bad.Id', 'vista')).toThrow(/bad site id/);
    expect(() => buildA3Piece('ok', 'castle' as never)).toThrow(/unknown template/);
  });

  it('the reed islet steps up in tiers a plain jump climbs (each under 1.05 m), its top above the 6 m water table from the 5.2 m wade floor', () => {
    let prev = 0;
    for (const t of ISLET_TIERS) {
      expect(t.height - prev).toBeLessThan(1.05);
      prev = t.height;
    }
    expect(5.2 + ISLET_TIERS[ISLET_TIERS.length - 1].height).toBeGreaterThan(6);
  });

  it('names only generated objects that are ingested, and kit or proc parts otherwise', () => {
    for (const t of A3_TEMPLATES) {
      for (const p of buildA3Piece('ids', t, { ledge: true, rubbing: t === 'leap-cache' || t === 'hawk-nest' ? 'spine-2' : undefined }).parts) {
        if (p.asset.startsWith('env/')) expect(hasEnvModel(p.asset.slice(4)), p.asset).toBe(true);
        else expect(/^(hex|dun|hal)\/|^proc:/.test(p.asset), p.asset).toBe(true);
      }
    }
  });

  it('loot names live items', () => {
    for (const p of ACT3_POI_PLACED) for (const s of a3LootFor(p)) expect(ITEMS[s.itemId], s.itemId).toBeTruthy();
  });
});
