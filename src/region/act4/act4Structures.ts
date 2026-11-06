// Act 4 thread L1 (plans/act4-L1.md sections 6 and 7): the greybox structures of Ashgate and its refuge, and the
// lean-to of every rope-line shelter. Greybox only (PR 2 and the env pass dress them); the stalls, fire, anvil, arch
// and poles are `open` (no collider) so no post, shop or rest point is ever blocked. Plain data, worker-safe.
import type { StructureSpec } from '../layoutTypes';
import { ASHGATE_ARCH, ASHGATE_HORSE_POST, ASHGATE_WAYSTONE, REFUGE_ANVIL, REFUGE_CASKS, REFUGE_POSTS, REFUGE_REST, REFUGE_VENDORS } from './act4Places';
import { pointAt, ropeLine, SHELTER_SPOTS } from './ropeLines';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A tent: a low solid box, behind the rows so it never stands between a post and the fire. */
const tent = (id: string, x: number, z: number): StructureSpec => ({ id, kind: 'house', x, z, yawDeg: 0, footprint: [6, 5], mode: 'solid', height: 3 });

/** The waystone stands this far north of its anchor (the Brightwater stones' spacing), so the anchor stays reachable. */
export const ASHGATE_WAYSTONE_STONE_OFFSET = 2.6;

export const REFUGE_STRUCTURES: readonly StructureSpec[] = [
  // A stall behind each moved vendor's post, centred between the post and its shop point.
  ...REFUGE_VENDORS.map((v): StructureSpec => ({ id: `ashgate.refuge.stall.${v}`, kind: 'stall', x: REFUGE_POSTS[v][0] + 0.8, z: REFUGE_POSTS[v][1] + 4, yawDeg: 0, footprint: [3, 2], mode: 'open' })),
  // The camp fire just north of the rest point.
  { id: 'ashgate.refuge.fire', kind: 'well', x: REFUGE_REST[0], z: REFUGE_REST[1] + 4, yawDeg: 0, footprint: [2, 2], mode: 'open', height: 0.5 },
  { id: 'ashgate.refuge.anvil-block', kind: 'altar', x: REFUGE_ANVIL[0], z: REFUGE_ANVIL[1] + 1.5, yawDeg: 0, footprint: [1.2, 0.6], mode: 'open', height: 0.8 },
  { id: 'ashgate.refuge.cask-stack', kind: 'crate', x: REFUGE_CASKS[0], z: REFUGE_CASKS[1] + 2, yawDeg: 0, footprint: [2, 1.2], mode: 'open' },
  // Tents: the north row behind the banners, the south row behind the trainers and the benched companions.
  ...[9600, 9660, 9720, 9780].map((x, i) => tent(`ashgate.refuge.tent.n${i + 1}`, x, 4458)),
  ...[9620, 9760, 9860].map((x, i) => tent(`ashgate.refuge.tent.s${i + 1}`, x, 4365)),
  // Ashgate itself.
  { id: 'ashgate.arch.frame', kind: 'gate', x: ASHGATE_ARCH[0], z: ASHGATE_ARCH[1], yawDeg: 0, footprint: [10, 1.5], mode: 'open' },
  { id: 'ashgate.waystone.stone', kind: 'waystone', x: ASHGATE_WAYSTONE[0], z: ASHGATE_WAYSTONE[1] + ASHGATE_WAYSTONE_STONE_OFFSET, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
  { id: 'ashgate.horse-post.pole', kind: 'pole', x: ASHGATE_HORSE_POST[0], z: ASHGATE_HORSE_POST[1] + 1.5, yawDeg: 0, footprint: [0.4, 0.4], mode: 'open' },
];

/** A shelter's lean-to: a solid back wall on the far side from its line and an open roof over the shelter's centre. */
export const SHELTER_BACK_OFFSET = 4;

export const SHELTER_STRUCTURES: readonly StructureSpec[] = SHELTER_SPOTS.flatMap((s): StructureSpec[] => {
  const p = pointAt(ropeLine(s.lineId).points, s.arc);
  // Unit vector from the line toward the shelter (the shelter stands off to one side).
  let nx = s.at.x - p.x;
  let nz = s.at.z - p.z;
  const n = Math.hypot(nx, nz) || 1;
  nx /= n;
  nz /= n;
  // yawDeg for a box whose local x runs along the line: local x is world (cos yaw, -sin yaw).
  const yawDeg = r2((((Math.atan2(-p.dz, p.dx) * 180) / Math.PI) % 360 + 360) % 360);
  return [
    { id: `${s.id}.back`, kind: 'wall', x: r2(s.at.x + nx * SHELTER_BACK_OFFSET), z: r2(s.at.z + nz * SHELTER_BACK_OFFSET), yawDeg, footprint: [5, 0.5], mode: 'solid', height: 2.4 },
    { id: `${s.id}.roof`, kind: 'stall', x: s.at.x, z: s.at.z, yawDeg, footprint: [5, 3.5], mode: 'open' },
  ];
});

export const ACT4_STRUCTURES: readonly StructureSpec[] = [...REFUGE_STRUCTURES, ...SHELTER_STRUCTURES];
