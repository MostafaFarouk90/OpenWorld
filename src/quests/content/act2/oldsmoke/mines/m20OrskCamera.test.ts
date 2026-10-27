// The Orsk set piece's camera has an anchor of its own: never a steward post or note anchor, and framing Orsk from the hall floor.
import { describe, expect, it } from 'vitest';
import { LOWER_GALLERIES_DEF as DEF } from '../../../../../oldsmoke/mines/lowerGalleries';
import { M20_CAMERA_ANCHOR, M20_ROOF_ANCHOR } from './m20d04.director';
import { M20D04_NOTE_LIST, M20D04_SPAWNERS } from './m20d04.data';

const at = (id: string) => {
  const a = DEF.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};

describe('the Orsk camera anchor', () => {
  it('is distinct from every spawn and note anchor', () => {
    const used = new Set<string>([
      ...M20D04_NOTE_LIST.map((n) => n.anchorId),
      ...M20D04_SPAWNERS.flatMap((s) => [s.anchor, ...(s.memberAnchors ?? [])]),
    ]);
    expect(used.has(M20_CAMERA_ANCHOR)).toBe(false);
    expect(M20_CAMERA_ANCHOR).not.toBe('oldsmoke.m20.post.1');
  });

  it('stands 6 to 12 m from Orsk, in front of him, and 2.5 m from every other anchor', () => {
    const cam = at(M20_CAMERA_ANCHOR);
    const orsk = at(M20_ROOF_ANCHOR);
    const d = Math.hypot(cam.x - orsk.x, cam.z - orsk.z);
    expect(d).toBeGreaterThanOrEqual(6);
    expect(d).toBeLessThanOrEqual(12);
    // Orsk faces -Z at yaw 0, so "in front" is the -Z side of him
    expect(cam.z).toBeLessThan(orsk.z);
    for (const o of DEF.anchors) {
      if (o.id === M20_CAMERA_ANCHOR) continue;
      expect(Math.hypot(cam.x - o.x, cam.z - o.z), o.id).toBeGreaterThanOrEqual(2.5);
    }
  });
});
