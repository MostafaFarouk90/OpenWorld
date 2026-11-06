// The Cinder Chapel's interior (Act 4 L1 PR 2, plans/act4-L1.md section 16 item 4), greybox: Ebba's chapel, a small nave
// with an altar and one lore note. Local metres from the door, running along +Z; it floats 150 m over its own plateau.
import type { InteriorDef, LocalRect } from '../../interiors/types';
import { CHAPEL } from '../wasteSites';

export const CINDER_CHAPEL_ID = 'cinder-chapel';
export const CINDER_CHAPEL_DOOR_ID = 'cinder-chapel';
/** The door's outside anchor, on the chapel shell's south face. */
export const CINDER_CHAPEL_OUTSIDE = 'waste.cinder-chapel.door';

const P = 'waste.cinder-chapel.inside';
const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });

export const CINDER_CHAPEL_DEF: InteriorDef = {
  id: CINDER_CHAPEL_ID,
  site: { x: CHAPEL.shell[0], z: CHAPEL.shell[1] },
  rooms: [{ id: 'nave', x0: -5, z0: -1.5, x1: 5, z1: 14.5, height: 7 }],
  pillars: [],
  props: [
    { id: 'altar', rect: rect(-1.5, 12.5, 1.5, 13.6), height: 1 },
    { id: 'pew.w1', rect: rect(-4, 4, -1.5, 4.6), height: 0.4, walkable: true },
    { id: 'pew.e1', rect: rect(1.5, 4, 4, 4.6), height: 0.4, walkable: true },
    { id: 'pew.w2', rect: rect(-4, 7, -1.5, 7.6), height: 0.4, walkable: true },
    { id: 'pew.e2', rect: rect(1.5, 7, 4, 7.6), height: 0.4, walkable: true },
  ],
  blockers: [],
  torches: [
    { x: -4.9, y: 2.4, z: 3 },
    { x: 4.9, y: 2.4, z: 3 },
    { x: -4.9, y: 2.4, z: 11 },
    { x: 4.9, y: 2.4, z: 11 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: 1.2, yaw: 180 },
    { id: `${P}.exit`, x: 0, z: -0.8, yaw: 0 },
    { id: `${P}.altar`, x: 0, z: 11.6, facing: { x: 0, z: 13 } },
    // The chapel's lore note (the families' names), on its own spot by the east wall.
    { id: `${P}.note`, x: 4, z: 10, facing: { x: 5, z: 10 } },
  ],
  triggers: [],
  doors: [{ doorId: CINDER_CHAPEL_DOOR_ID, outside: CINDER_CHAPEL_OUTSIDE, inside: `${P}.entry`, exit: `${P}.exit` }],
  environment: {
    fogColor: 0x1e1814,
    fogNear: 8,
    fogFar: 30,
    skyColor: 0xb59a7a,
    groundColor: 0x2a2018,
    ambientIntensity: 0.55,
    lightColor: 0xffc890,
    lightIntensity: 9,
    lightDistance: 14,
  },
};
