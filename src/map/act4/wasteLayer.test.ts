import { describe, expect, it } from 'vitest';
import { ACT4_PLACES } from '../../region/act4/act4Places';
import { ROPE_LINE_GEOMS, SHELTER_SPOTS } from '../../region/act4/ropeLines';
import { MAP_ACT4_STRINGS_EN } from './strings.en';
import { WASTE_LABEL_PLACES, placeDiscoveredFlag, wasteLabels, wasteLines, wasteShelters, type WastePorts } from './wasteLayer';

const WASTE = ['harrowmark', 'ashen-waste'];
const ports = (over: Partial<WastePorts> = {}): WastePorts => ({
  open: WASTE,
  isRevealed: () => true,
  flag: () => false,
  t: (k) => MAP_ACT4_STRINGS_EN[k] ?? k,
  ...over,
});

describe('wasteLines', () => {
  it('nothing while the Waste is shut (Phase G), every line whole once open and revealed', () => {
    expect(wasteLines(ports({ open: ['harrowmark'] }))).toEqual([]);
    const lines = wasteLines(ports());
    expect(lines).toHaveLength(ROPE_LINE_GEOMS.length);
    for (const l of lines) expect(l.style).toBe('rope');
    // Each whole line runs from its first point to its last.
    const first = ROPE_LINE_GEOMS[0]!;
    const drawn = lines.find((l) => l.id.startsWith(`${first.id}#`))!;
    expect(drawn.points[0]).toEqual({ x: first.points[0]![0], z: first.points[0]![1] });
    const end = first.points.at(-1)!;
    expect(Math.hypot(drawn.points.at(-1)!.x - end[0], drawn.points.at(-1)!.z - end[1])).toBeLessThan(1e-6);
  });

  it('only revealed stretches are drawn: half a map revealed cuts lines into runs; nothing revealed draws nothing', () => {
    expect(wasteLines(ports({ isRevealed: () => false }))).toEqual([]);
    const midX = ROPE_LINE_GEOMS.flatMap((l) => l.points.map((p) => p[0])).reduce((a, b) => a + b, 0) / ROPE_LINE_GEOMS.flatMap((l) => l.points).length;
    const half = wasteLines(ports({ isRevealed: (x) => x < midX }));
    expect(half.length).toBeGreaterThan(0);
    for (const l of half) for (const p of l.points) expect(p.x).toBeLessThan(midX);
  });

  it('a throwing reveal test hides rather than throws', () => {
    expect(wasteLines(ports({ isRevealed: () => { throw new Error('x'); } }))).toEqual([]);
  });
});

describe('wasteLabels', () => {
  it('Waste places only while the Waste is open; Ashgate (outside the edge) whenever revealed', () => {
    const shut = wasteLabels(ports({ open: ['harrowmark'] }));
    expect(shut.map((l) => l.id)).toEqual(['place.ashgate']);
    const open = wasteLabels(ports());
    expect(open.map((l) => l.text)).toEqual(['Ashgate', 'The Crossing', 'Walker Camp', 'Cinder Chapel', 'The Glasslands', 'Husk Cathedral', 'Rimfoot']);
    expect(open[0]).toMatchObject({ x: ACT4_PLACES.ashgate.x, z: ACT4_PLACES.ashgate.z });
  });

  it('a place shows when revealed or discovered, not otherwise', () => {
    expect(wasteLabels(ports({ isRevealed: () => false }))).toEqual([]);
    const found = wasteLabels(ports({ isRevealed: () => false, flag: (k) => k === placeDiscoveredFlag('walker-camp') }));
    expect(found.map((l) => l.id)).toEqual(['place.walker-camp']);
    // The cathedral and Rimfoot have no waystone: only the fog shows them.
    expect(placeDiscoveredFlag('husk-cathedral')).toBeNull();
    expect(wasteLabels(ports({ isRevealed: () => false, flag: () => true })).map((l) => l.id)).toEqual(['place.ashgate', 'place.walker-camp', 'place.cinder-chapel', 'place.glasslands']);
  });

  it('every place has a string', () => {
    for (const w of WASTE_LABEL_PLACES) expect(MAP_ACT4_STRINGS_EN[`map.place.${w.id}`]).toBeTruthy();
  });
});

describe('wasteShelters', () => {
  it('revealed shelters only, only with the Waste open, named "Storm shelter"', () => {
    expect(wasteShelters(ports({ open: ['harrowmark'] }))).toEqual([]);
    const all = wasteShelters(ports());
    expect(all).toHaveLength(SHELTER_SPOTS.length);
    expect(all[0]!.label).toBe('Storm shelter');
    const s = SHELTER_SPOTS[0]!;
    expect(wasteShelters(ports({ isRevealed: (x, z) => x === s.at.x && z === s.at.z })).map((x) => x.id)).toEqual([`waste.${s.id}`]);
  });
});
