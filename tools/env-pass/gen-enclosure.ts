// B1 village enclosure: stone wall runs from each gate round the Kettlewick footprint, with gaps only at the Kettlewick gate and the lane
// (the T07 fence at z=90 already closes the lane's south side), plus short wings at the lane gate. Scenery rows, no colliders.
// `npx vite-node tools/env-pass/gen-enclosure.ts` writes src/env/b1.enclosure.json. Rows near anchors or inside footprints are dropped, as in build-tile-rows.ts.
import { writeFileSync } from 'node:fs';
import { BRIGHTWATER_LAYOUT as L } from '../../src/region/brightwater.layout';
import { pointInFootprint } from '../../src/region/geometry';

/** KayKit fence_stone_straight is 6.35 m long (local z) at 1.48 m high; stonewall-wing fits it to 1.0 m, stonewall-high to 1.5 m. */
const MODULE = { 'stonewall-wing': 6.35 / 1.48, 'stonewall-high': (6.35 / 1.48) * 1.5 } as const;
type P = [number, number];
type Run = { id: keyof typeof MODULE; pts: P[] };
const village = (...pts: P[]): Run => ({ id: 'stonewall-high', pts });
const wing = (...pts: P[]): Run => ({ id: 'stonewall-wing', pts });
const RUNS: Run[] = [
  village([-64, 165], [-51, 165]), // north-west, up to the mill (its footprint is the wall)
  village([-39, 165], [-26.5, 165]), // mill to house-06
  village([-17.5, 165], [-5.5, 165]), // house-06 to the Kettlewick gate
  village([5.5, 165], [17.5, 165]), // gate to house-07
  village([26.5, 165], [42, 165]), // house-07 to the north-east corner
  village([42, 165], [42, 90]), // east side
  village([42, 90], [16.5, 90]), // south-east, to the T07 fence
  village([-16.5, 90], [-64, 90]), // south-west, from the T07 fence
  village([-64, 90], [-64, 165]), // west side
  wing([-5.5, 25], [-14, 25]), // lane gate wings
  wing([5.5, 25], [14, 25]),
];
const solids = L.structures.filter((s) => s.mode !== 'open');
const rows: Array<{ id: string; x: number; z: number; yaw: number }> = [];
let dropped = 0;
for (const { id, pts: [a, b] } of RUNS) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / MODULE[id]));
  const yaw = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = +(a[0] + (b[0] - a[0]) * t).toFixed(2);
    const z = +(a[1] + (b[1] - a[1]) * t).toFixed(2);
    const blocked = solids.some((s) => pointInFootprint(s, x, z, 0.4)) || L.anchors.some((an) => Math.hypot(x - an.x, z - an.z) < 1.2);
    if (blocked) dropped++;
    else rows.push({ id, x, z, yaw: +(((yaw % 180) + 180) % 180).toFixed(1) });
  }
}
writeFileSync(new URL('../../src/env/b1.enclosure.json', import.meta.url), JSON.stringify(rows));
console.log(`${rows.length} wall modules, ${dropped} dropped`);
