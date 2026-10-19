import { describe, expect, it } from 'vitest';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { pointInFootprint } from '../region/geometry';
import { resolveLayout } from '../region/resolveLayout';
import { heightAt } from '../terrain/heightfield';
import { MOUNT_TUNING as T } from './tuning';

/** Half a horse's length plus a stride: nothing solid may be this close to where the horse waits. */
const HORSE_CLEARANCE = 2;

describe('the stables anchor the horse waits at', () => {
  it('is defined by the Harrowmark layout, outdoors, with room for the horse', () => {
    const spec = HARROWMARK_LAYOUT.anchors.find((a) => a.id === T.stablesAnchor);
    expect(spec).toBeDefined();
    expect(spec!.tags ?? []).not.toContain('elevated');
    const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode !== 'open');
    expect(solids.filter((s) => pointInFootprint(s, spec!.x, spec!.z, HORSE_CLEARANCE)).map((s) => s.id)).toEqual([]);
  });

  it('resolves to the ground', () => {
    const anchor = resolveLayout(HARROWMARK_LAYOUT, heightAt).anchors.find((a) => a.id === T.stablesAnchor)!;
    expect(anchor.position.y).toBeCloseTo(heightAt(anchor.position.x, anchor.position.z), 1);
  });
});
