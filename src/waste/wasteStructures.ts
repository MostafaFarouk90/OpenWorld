// The Waste's greybox structures (Act 4 L1 PR 2, plans/act4-L1.md section 16): tents, pyres, cisterns, the camp gate,
// the chapel shell and its roofless houses, the plaques, the cathedral's shell, the cairns, Rimfoot's tents, the four
// waystones' stones and the points of interest. Greybox only (the env pass dresses them; new objects are on the prompt
// list's section T). Posts, rest points and quest props stay on `open` pieces or clear of solid ones. Plain data.
import type { StructureSpec } from '../region/layoutTypes';
import type { XZ } from '../terrain/shape/waste';
import { CAIRNS, CAMP, CATHEDRAL, CHAPEL, CHAPEL_HEARTHS, CHAPEL_MUSIC_BOX, RIMFOOT_CAMP, SLAG, WASTE_POIS, type WastePoi } from './wasteSites';

const r2 = (n: number) => Math.round(n * 100) / 100;
/** The waystones' stones stand this far north of their anchors (Ashgate's spacing), so the anchor stays reachable. */
export const WASTE_WAYSTONE_STONE_OFFSET = 2.6;

const box = (id: string, kind: string, p: XZ, footprint: [number, number], mode: StructureSpec['mode'], height?: number, yawDeg = 0): StructureSpec => ({
  id,
  kind,
  x: r2(p[0]),
  z: r2(p[1]),
  yawDeg,
  footprint,
  mode,
  ...(height === undefined ? {} : { height }),
});
const stone = (id: string, p: XZ): StructureSpec => box(id, 'waystone', [p[0], p[1] + WASTE_WAYSTONE_STONE_OFFSET], [1.6, 1.6], 'solid', 2.4);

/**
 * A roofless ruin: four walls `h` high round a `w` x `d` box, with a doorway `door` wide in the middle of side `side`.
 * Walls are 0.5 m thick; local yaw 0 (axis-aligned).
 */
export function ruin(id: string, c: XZ, w: number, d: number, side: 'N' | 'S' | 'E' | 'W', door = 2, h = 2.2): StructureSpec[] {
  const t = 0.5;
  const out: StructureSpec[] = [];
  const wall = (suffix: string, x: number, z: number, fw: number, fd: number) => out.push(box(`${id}.${suffix}`, 'wall', [x, z], [r2(fw), r2(fd)], 'solid', h));
  const [cx, cz] = c;
  for (const s of ['N', 'S'] as const) {
    const z = s === 'N' ? cz + d / 2 - t / 2 : cz - d / 2 + t / 2;
    if (side === s) {
      const seg = (w - door) / 2;
      wall(`${s.toLowerCase()}w`, cx - door / 2 - seg / 2, z, seg, t);
      wall(`${s.toLowerCase()}e`, cx + door / 2 + seg / 2, z, seg, t);
    } else wall(s.toLowerCase(), cx, z, w, t);
  }
  for (const s of ['E', 'W'] as const) {
    const x = s === 'E' ? cx + w / 2 - t / 2 : cx - w / 2 + t / 2;
    const inner = d - 2 * t;
    if (side === s) {
      const seg = (inner - door) / 2;
      wall(`${s.toLowerCase()}s`, x, cz - door / 2 - seg / 2, t, seg);
      wall(`${s.toLowerCase()}n`, x, cz + door / 2 + seg / 2, t, seg);
    } else wall(s.toLowerCase(), x, cz, t, inner);
  }
  return out;
}

// ---- the Walker Camp

/** The gate's arch runs across the line from the Crossing (local x across the lane). */
const GATE_YAW = 286.7;
const camp: StructureSpec[] = [
  ...CAMP.tents.map((p, i) => box(`waste.walker-camp.tent.${i + 1}`, 'house', p, [6, 5], 'solid', 3)),
  box('waste.walker-camp.fire', 'well', [CAMP.rest[0], CAMP.rest[1] + 4], [2, 2], 'open', 0.5),
  ...CAMP.pyres.map((p, i) => box(`waste.walker-camp.pyre.${i + 1}.stack`, 'altar', [p[0], p[1] - 2.2], [2.4, 2.4], 'open', 1.2)),
  ...CAMP.cisterns.map((p, i) => box(`waste.walker-camp.cistern.${i + 1}.tank`, 'well', [p[0], p[1] - 2.6], [3, 3], 'solid', 1.2)),
  // The Spear-Dance ring: eight open poles on a 9 m circle.
  ...Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    return box(`waste.walker-camp.ring.${k + 1}`, 'pole', [CAMP.trialRing[0] + Math.sin(a) * 9, CAMP.trialRing[1] + Math.cos(a) * 9], [0.3, 0.3], 'open');
  }),
  box('waste.walker-camp.gate.arch', 'gate', CAMP.gate, [11, 1], 'open', undefined, GATE_YAW),
  stone('waste.walker-camp.waystone.stone', CAMP.waystone),
  // The Storm Walk's guide rope: a pole every 25 m beside the walk (not a rope-line: no storm-safe lane).
  ...Array.from({ length: 13 }, (_, k) => box(`waste.walker-camp.storm-walk.pole.${k + 1}`, 'pole', [CAMP.stormWalkStart[0] - k * 25, CAMP.stormWalkStart[1] + 2.2], [0.3, 0.3], 'open')),
];

// ---- the Cinder Chapel and its village (the houses' doorways face east, toward the line)

const chapel: StructureSpec[] = [
  box('waste.cinder-chapel.shell', 'chapel', CHAPEL.shell, [10, 16], 'solid', 7),
  ...CHAPEL.houses.flatMap((p, i) => ruin(`waste.cinder-chapel.house.${i + 1}.ruin`, p, 8, 6, 'E')),
  ...CHAPEL_HEARTHS.map((p, i) => box(`waste.cinder-chapel.hearth.${i + 1}.stones`, 'altar', [p[0] - 0.4, p[1]], [0.6, 1.2], 'open', 0.5)),
  box('waste.cinder-chapel.music-box', 'crate', CHAPEL_MUSIC_BOX, [0.5, 0.4], 'open', 0.4),
  stone('waste.cinder-chapel.waystone.stone', CHAPEL.waystone),
];

// ---- the Glasslands (the pillars' glass is drawn by the plugin; these are their colliders and the plaques)

const slag: StructureSpec[] = [
  ...SLAG.pillars.map((p, i) => box(`waste.glasslands.pillar.${i + 1}.glass`, 'pole', p, [1, 1], 'solid', 5)),
  ...SLAG.plaques.map((p, i) => box(`waste.glasslands.plaque.${i + 1}.board`, 'board', p, [1.4, 0.3], 'open')),
  stone('waste.glasslands.waystone.stone', SLAG.waystone),
];

// ---- the Husk Cathedral's shell (34 x 48 m north of its door; walls 12 m, a 4 m doorway in the south wall)

const [CW, CD] = CATHEDRAL.shellSize;
const cathedral: StructureSpec[] = [
  ...ruin('waste.husk-cathedral.shell', CATHEDRAL.shell, CW, CD, 'S', 4, 12),
  // Two bell towers flanking the front, just outside the south wall.
  box('waste.husk-cathedral.tower.w', 'tower', [CATHEDRAL.shell[0] - CW / 2 + 3, CATHEDRAL.shell[1] - CD / 2 - 2.2], [4, 4], 'solid', 18),
  box('waste.husk-cathedral.tower.e', 'tower', [CATHEDRAL.shell[0] + CW / 2 - 3, CATHEDRAL.shell[1] - CD / 2 - 2.2], [4, 4], 'solid', 18),
];

// ---- the Cinder Road North's cairns and the Rimfoot camp

const roadNorth: StructureSpec[] = CAIRNS.map((c, i) => box(`waste.cinder-road.cairn.${i + 1}.stones`, 'block', c.stones, [1.6, 1.6], 'solid', 1.6));
const rimfoot: StructureSpec[] = [
  ...RIMFOOT_CAMP.tents.map((p, i) => box(`waste.rimfoot.tent.${i + 1}`, 'house', p, [5, 4], 'solid', 2.6)),
  box('waste.rimfoot.fire-ring', 'well', RIMFOOT_CAMP.fire, [2, 2], 'open', 0.4),
];

// ---- points of interest (templates, site-local offsets rotated by the POI's facing)

const rot = (p: WastePoi, lx: number, lz: number): XZ => {
  const a = (p.facing * Math.PI) / 180;
  // Local +Z is the POI's facing; local +X its right.
  return [p.at[0] + lz * Math.sin(a) + lx * Math.cos(a), p.at[1] + lz * Math.cos(a) - lx * Math.sin(a)];
};
function poiStructures(p: WastePoi): StructureSpec[] {
  const id = `waste.poi.${p.id}`;
  switch (p.template) {
    case 'burned-village':
      return [
        ...ruin(`${id}.house.1`, rot(p, -12, 8), 8, 6, 'S'),
        ...ruin(`${id}.house.2`, rot(p, 10, 9), 7, 6, 'S'),
        ...ruin(`${id}.house.3`, rot(p, 0, -12), 8, 6, 'N'),
        box(`${id}.cart`, 'cart', rot(p, 9, -6), [3, 1.6], 'open', undefined, p.facing),
      ];
    case 'wagon-train':
      return [0, 1, 2].map((k) => box(`${id}.wagon.${k + 1}`, 'cart', rot(p, -9 + k * 9, k % 2 ? 2 : -2), [3, 1.6], 'solid', 1.6, p.facing + (k - 1) * 12));
    case 'walker-cairn':
      return [box(`${id}.stones`, 'block', [p.at[0], p.at[1] + 2.5], [2, 2], 'solid', 2), box(`${id}.lore-stone`, 'board', [p.at[0] + 3, p.at[1] + 1.4], [1.2, 0.3], 'open')];
    case 'glass-vein':
      return [-6, 0, 6].map((x, k) => box(`${id}.shard.${k + 1}`, 'block', rot(p, x, k === 1 ? 3 : 0), [1.4, 1.4], 'solid', 2.4 + k));
    case 'buried-bell':
      return [box(`${id}.crown`, 'altar', [p.at[0], p.at[1] + 2.8], [2.4, 2.4], 'solid', 1.4), box(`${id}.lore-stone`, 'board', [p.at[0] + 3, p.at[1] + 1.4], [1.2, 0.3], 'open')];
    case 'strider-nest':
      return Array.from({ length: 5 }, (_, k) => {
        const a = (k * 2 * Math.PI) / 5;
        return box(`${id}.rib.${k + 1}`, 'block', [p.at[0] + Math.sin(a) * 11, p.at[1] + Math.cos(a) * 11], [1.2, 1.2], 'solid', 3.2);
      });
    case 'rim-vista':
      return [box(`${id}.marker`, 'block', rot(p, 0, -3), [1.2, 1.2], 'solid', 1.8), box(`${id}.pole`, 'pole', rot(p, 2, -2), [0.3, 0.3], 'open')];
    case 'stumps':
      // The grove is drawn by the stump scatter (stumps.ts); its centre keeps one tall broken trunk.
      return [box(`${id}.trunk`, 'block', p.at, [1.6, 1.6], 'solid', 4)];
  }
}

export const WASTE_STRUCTURES: readonly StructureSpec[] = [...camp, ...chapel, ...slag, ...cathedral, ...roadNorth, ...rimfoot, ...WASTE_POIS.flatMap(poiStructures)];
