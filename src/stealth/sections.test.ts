import { describe, expect, it } from 'vitest';
import type { Anchor } from '../layout/AnchorRegistry';
import { SECTIONS, type StealthSectionDef, insideSection, insideVolume, validateSection } from './sections';

const anchorMap = (list: [string, number, number, number?][]) => {
  const m = new Map<string, Anchor>(list.map(([id, x, z, yaw]) => [id, { id, position: { x, y: 0, z }, yaw: yaw ?? 0 }]));
  return (id: string) => m.get(id);
};

describe('sections data', () => {
  it('ids are unique; hide ids follow kind:name without dots; checkpoint ids are unique per section', () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) {
      for (const h of s.hideSpots) expect(h.id).toMatch(/^hide:[a-z0-9-]+$/);
      expect(new Set(s.checkpoints.map((c) => c.id)).size).toBe(s.checkpoints.length);
      expect(s.checkpoints.length).toBeGreaterThan(0);
    }
  });

  it('uses the settled ids (M06 gate.inside, quest-derived liveness, M09 bounds are the interior)', () => {
    const m06 = SECTIONS.find((s) => s.id === 'm06.south-gate')!;
    expect(m06.checkpoints.map((c) => c.id)).toContain('gate.inside');
    expect(m06.quest).toEqual({ id: 'm06', liveFrom: 'o2', liveUntil: 'o2' });
    expect(m06.checkpoints.map((c) => c.anchor)).toEqual(['stealth.m06.start', 'stealth.m06.cp.inside']);
    const m09 = SECTIONS.find((s) => s.id === 'm09.counting-house')!;
    expect(m09.bounds).toEqual({ interior: 'counting-house' });
    expect(m09.quest.exitArmedAfter).toEqual(['o3']);
    expect(m09.quest.liveUntil).toBe('o4'); // thread 6 PR 2: invoices are one objective (o3), the exit is o4
    expect(m09.guardGroups).toEqual(['stealth.m09.hall', 'stealth.m09.stacks', 'stealth.m09.clerk']);
  });
});

describe('insideVolume', () => {
  it('turns with the anchor yaw and its offset', () => {
    const find = anchorMap([['a.b', 10, 0, Math.PI / 2]]);
    const vol = { anchor: 'a.b', half: { x: 1, y: 2, z: 4 } };
    // Yaw PI/2: the box's long (z) axis now runs along world x.
    expect(insideVolume(vol, find, { x: 13, y: 0, z: 0 })).toBe(true);
    expect(insideVolume(vol, find, { x: 10, y: 0, z: 3 })).toBe(false);
    expect(insideVolume({ ...vol, offset: { x: 0, y: 0, z: -3 } }, find, { x: 7, y: 0, z: 0 })).toBe(true);
    expect(insideVolume(vol, find, { x: 10, y: 3, z: 0 })).toBe(false);
  });

  it('is false for a missing anchor or NaN position', () => {
    const find = anchorMap([['a.b', 0, 0]]);
    expect(insideVolume({ anchor: 'x.y', half: { x: 9, y: 9, z: 9 } }, find, { x: 0, y: 0, z: 0 })).toBe(false);
    expect(insideVolume({ anchor: 'a.b', half: { x: 9, y: 9, z: 9 } }, find, { x: NaN, y: 0, z: 0 })).toBe(false);
  });

  it('interior bounds ask interiorAt', () => {
    const m09 = SECTIONS.find((s) => s.id === 'm09.counting-house')!;
    expect(insideSection(m09, () => undefined, () => 'counting-house', { x: 0, y: 0, z: 0 })).toBe(true);
    expect(insideSection(m09, () => undefined, () => null, { x: 0, y: 0, z: 0 })).toBe(false);
  });
});

describe('validateSection', () => {
  const def: StealthSectionDef = {
    id: 't',
    quest: { id: 'q', liveFrom: 'o1', liveUntil: 'o1' },
    bounds: { anchor: 's.c', half: { x: 20, y: 5, z: 20 } },
    checkpoints: [{ id: 'a', anchor: 's.a', volume: { anchor: 's.a', half: { x: 1, y: 1, z: 1 } } }],
    exit: { anchor: 's.e', half: { x: 1, y: 1, z: 1 } },
    guardGroups: [],
    hideSpots: [{ id: 'hide:t-1', anchor: 's.h' }],
  };

  it('passes a good layout', () => {
    const find = anchorMap([['s.c', 0, 0], ['s.a', -10, 0], ['s.e', 10, 0], ['s.h', 0, 10]]);
    expect(validateSection(def, find, [[{ x: -10, y: 0, z: -5 }, { x: 10, y: 0, z: -5 }]])).toEqual([]);
  });

  it('reports missing anchors, an outside checkpoint and a hide spot near a patrol segment (not just nodes)', () => {
    expect(validateSection(def, anchorMap([['s.c', 0, 0]])).map((p) => p.problem)).toEqual(['missing anchor s.a', 'missing anchor s.a', 'missing anchor s.e', 'missing anchor s.h']);
    const find = anchorMap([['s.c', 0, 0], ['s.a', -30, 0], ['s.e', 10, 0], ['s.h', 0, 10]]);
    const problems = validateSection(def, find, [[{ x: -20, y: 0, z: 11 }, { x: 20, y: 0, z: 11 }]]).map((p) => p.problem);
    expect(problems).toEqual(['checkpoint a outside the section', 'hide spot hide:t-1 within 3 m of a patrol segment']);
  });
});
