// The Weeping Bellows cavern (A4 PR 2): a round, flat, open cavern for A9's puzzle, reached by a narrow tunnel from the lift landing.
// Local metres from the landing, yaw 0 faces -Z.
import type { InteriorDef, PropDef, RoomDef } from '../../interiors/types';
import { corridor, MINE_IDS, mineDef, room, torchesAlong } from './kit';

/** The puzzle is placed around this anchor (`BELLOWS.centerAnchor`); its braziers, valves and plaque reach 13 m from it. */
export const BELLOWS_CENTER = { x: 0, z: -60 } as const;
/** Floor kept clear of pillars and props around the centre (A9's layout needs 13 m; 24 m is the plan's promise). */
export const BELLOWS_CLEAR_RADIUS = 24;
/** The rooms approximate a circle of this radius, so the 24 m disc is fully inside them with walls to spare. */
const WALL_RADIUS = 27;
const STRIP = 3;

/** Stacked strips of rooms: each strip is as wide as the circle is at its far edge, so the whole disc is covered. */
function caveStrips(): RoomDef[] {
  const out: RoomDef[] = [];
  for (let d = -WALL_RADIUS; d < WALL_RADIUS; d += STRIP) {
    const far = Math.max(Math.abs(d), Math.abs(d + STRIP));
    const hw = Math.floor(Math.sqrt(WALL_RADIUS * WALL_RADIUS - far * far) * 2) / 2;
    if (hw < 2) continue;
    out.push(room(`cavern.${out.length + 1}`, BELLOWS_CENTER.x - hw, BELLOWS_CENTER.z + d, hw * 2, STRIP, 12));
  }
  return out;
}

const landing = room('landing', -6, -9, 12, 10, 4);
const tunnel = corridor('tunnel', { x: 0, z: -9 }, { x: 0, z: -37 }, 3);
const strips = caveStrips();
const polar = (r: number, deg: number) => ({
  x: Math.round((BELLOWS_CENTER.x + Math.cos((deg * Math.PI) / 180) * r) * 10) / 10,
  z: Math.round((BELLOWS_CENTER.z + Math.sin((deg * Math.PI) / 180) * r) * 10) / 10,
});

// The pipe cluster stands against the west wall, outside the clear disc.
const props: PropDef[] = [{ id: 'pipes.1', rect: { x0: -26.2, z0: BELLOWS_CENTER.z - 4, x1: -25.2, z1: BELLOWS_CENTER.z + 4 }, height: 3 }];

// Crawlers wait on the rim (r 23.5), clear of the tunnel mouth (south) and the pipes (west).
const CRAWLER_DEG = [-150, -110, -70, -30, 30, 150];

export const BELLOWS_CAVERN_DEF: InteriorDef = mineDef('bellows', {
  rooms: [landing, tunnel, ...strips],
  props,
  torches: [
    ...torchesAlong(landing),
    ...torchesAlong(tunnel, 2.2, 7),
    ...Array.from({ length: 16 }, (_, i) => {
      const p = polar(25.6, -i * 22.5);
      return { x: p.x, y: 3, z: p.z };
    }).filter((t) => strips.some((s) => t.x > s.x0 && t.x < s.x1 && t.z >= s.z0 && t.z < s.z1)),
  ],
  anchors: [
    { id: 'oldsmoke.bellows.lift', x: 0, z: -4, yaw: 0 },
    { id: 'oldsmoke.bellows.lift.up', x: -2, z: -4, yaw: 0 },
    { id: 'oldsmoke.bellows.lift.call', x: 2, z: -4, yaw: 0 },
    { id: 'mines.weeping-bellows.center', x: BELLOWS_CENTER.x, z: BELLOWS_CENTER.z, yaw: 0 },
    // Where the player stands to read the plaque A9 hangs 13 m north of the centre.
    { id: 'oldsmoke.bellows.plaque', x: BELLOWS_CENTER.x, z: BELLOWS_CENTER.z - 11.5, facing: { x: BELLOWS_CENTER.x, z: BELLOWS_CENTER.z - 13 } },
    { id: 'oldsmoke.bellows.pipes', x: -24, z: BELLOWS_CENTER.z, facing: { x: -26, z: BELLOWS_CENTER.z } },
    ...CRAWLER_DEG.map((deg, i) => {
      const p = polar(23.5, deg);
      return { id: `oldsmoke.bellows.crawler.${i + 1}`, x: p.x, z: p.z, facing: BELLOWS_CENTER };
    }),
    // Pike waits at the tunnel mouth, off the puzzle floor.
    { id: 'npc-post.pike.bellows', x: 6, z: -40, facing: BELLOWS_CENTER },
    // Pike's apprentice (A13 registers her from the director) stands across the entrance from him.
    { id: 'npc-post.pike-apprentice.bellows', x: -6, z: -40, facing: BELLOWS_CENTER },
  ],
});

export const BELLOWS_CAVERN_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${MINE_IDS.bellows}`]: '{key} Enter the Weeping Bellows',
  [`interior.exit.${MINE_IDS.bellows}`]: '{key} Ride up to the surface',
};
