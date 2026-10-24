// Places structures on a plateau at the nearest free spot to where the layout wants them: inside the bounds, clear of the road
// and of what is already placed. Deterministic (a spiral of 2 m steps), so the same inputs give the same layout.
import { footprintCorners, footprintsOverlap } from '../region/geometry';
import type { StructureSpec } from '../region/layoutTypes';
import type { Rect, XZ } from './inputs';
import type { Road } from './road';

const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface PlaceOpts {
  yawDeg?: number;
  mode?: StructureSpec['mode'];
  height?: number;
  /** Extra clearance from other structures. */
  margin?: number;
  /** Ignore the road (small decoration beside it). */
  ignoreRoad?: boolean;
}

export class Placer {
  readonly specs: StructureSpec[] = [];
  private readonly reserved: Array<XZ & { r: number }> = [];

  constructor(
    private readonly bounds: Rect,
    private readonly road: Road | null,
    private readonly roadClear: number,
  ) {}

  reserve(x: number, z: number, r: number): void {
    this.reserved.push({ x, z, r });
  }

  /** Registers a structure placed by hand (walls, towers): it blocks the spiral but is not moved. */
  add(spec: StructureSpec): StructureSpec {
    this.specs.push(spec);
    return spec;
  }

  private fits(spec: StructureSpec, margin: number, ignoreRoad: boolean): boolean {
    const corners = footprintCorners(spec);
    for (const [x, z] of corners) {
      if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) return false;
    }
    const big: StructureSpec = { ...spec, footprint: [spec.footprint[0] + 2 * margin, spec.footprint[1] + 2 * margin] };
    for (const o of this.specs) if (o.mode !== 'open' || spec.mode !== 'open') if (footprintsOverlap(big, o)) return false;
    const reach = Math.hypot(spec.footprint[0], spec.footprint[1]) / 2;
    for (const r of this.reserved) if (Math.hypot(spec.x - r.x, spec.z - r.z) < r.r + reach) return false;
    if (this.road && !ignoreRoad) {
      const pts: Array<[number, number]> = [...corners, [spec.x, spec.z]];
      for (let i = 0; i < corners.length; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % corners.length]!;
        pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
      for (const [x, z] of pts) if (this.road.nearest(x, z).d < this.roadClear) return false;
    }
    return true;
  }

  place(id: string, kind: StructureSpec['kind'], want: XZ, w: number, d: number, o: PlaceOpts = {}): StructureSpec {
    const margin = o.margin ?? 1;
    for (let r = 0; r <= 90; r += 2) {
      const n = Math.max(1, Math.ceil((2 * Math.PI * r) / 2));
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2;
        const spec: StructureSpec = {
          id,
          kind,
          x: r2(want.x + Math.cos(ang) * r),
          z: r2(want.z + Math.sin(ang) * r),
          yawDeg: o.yawDeg ?? 0,
          footprint: [w, d],
          mode: o.mode ?? 'solid',
          ...(o.height === undefined ? {} : { height: o.height }),
        };
        if (this.fits(spec, margin, o.ignoreRoad ?? false)) {
          this.specs.push(spec);
          return spec;
        }
      }
    }
    throw new Error(`dragonspine: no room for "${id}" near (${r2(want.x)}, ${r2(want.z)})`);
  }
}
