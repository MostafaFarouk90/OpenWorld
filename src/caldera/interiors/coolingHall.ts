// The Cooling Hall (Act 5 N2, M50), greybox: an entry, three channel chambers in series (each a raised slag-water flume, three
// sluice wheels, a heat gauge and the stokers' chart), passages with gates, and the forge. Local metres from the door, rooms run +Z.
import type { InteriorDef, LocalRect } from '../../interiors/types';
import { BLOCKERS, COOLING_CHANNELS, COOLING_HALL_DOOR_ID, COOLING_HALL_ID, CALDERA_INTERIOR_SITES, DOOR_COOLING_HALL, INT_ANCHOR, INT_TRIGGER, rectOf as rect } from './sites';

const P = `${INT_ANCHOR}.cooling`;
const T = `${INT_TRIGGER}.cooling`;
const PASSAGES = [
  { id: 'pass-0', z0: 6, z1: 10 },
  { id: 'pass-1', z0: 30, z1: 34 },
  { id: 'pass-2', z0: 54, z1: 58 },
  { id: 'pass-3', z0: 78, z1: 82 },
] as const;
/** A gate across a passage's middle (0.5 m thick). */
const gate = (id: string, z0: number): InteriorDef['blockers'][number] => ({ id, rect: rect(-2, z0 + 1.75, 2, z0 + 2.25), height: 5, startClosed: true });

export const COOLING_HALL_DEF: InteriorDef = {
  id: COOLING_HALL_ID,
  site: { ...CALDERA_INTERIOR_SITES[COOLING_HALL_ID] },
  rooms: [
    { id: 'entry', x0: -4, z0: -1.5, x1: 4, z1: 6, height: 6 },
    ...PASSAGES.map((p) => ({ id: p.id, x0: -2, z0: p.z0, x1: 2, z1: p.z1, height: 5 })),
    ...COOLING_CHANNELS.map((c) => ({ id: `chan-${c.n}`, x0: -14, z0: c.z0, x1: 14, z1: c.z1, height: 10 })),
    { id: 'forge', x0: -10, z0: 82, x1: 10, z1: 100, height: 8 },
  ],
  pillars: [],
  // The slag-water flumes: raised stone troughs, solid (no pit to fall into). The east lane beside each is 4 m clear.
  props: COOLING_CHANNELS.map((c) => ({ id: `flume.${c.n}`, rect: rect(6, c.z0 + 1, 10, c.z1 - 1), height: 1 })),
  blockers: [gate(BLOCKERS.coolingGate2, 30), gate(BLOCKERS.coolingGate3, 54), gate(BLOCKERS.coolingForge, 78)],
  torches: [
    { x: -3.9, y: 3, z: 3 },
    { x: 3.9, y: 3, z: 3 },
    ...COOLING_CHANNELS.flatMap((c) => [
      { x: -13.9, y: 5, z: c.z0 + 5 },
      { x: -13.9, y: 5, z: c.z1 - 5 },
      { x: 13.9, y: 5, z: c.z0 + 5 },
      { x: 13.9, y: 5, z: c.z1 - 5 },
    ]),
    { x: -9.9, y: 4, z: 90 },
    { x: 9.9, y: 4, z: 90 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: 2, yaw: 180 },
    { id: `${P}.exit`, x: 0, z: -0.8, yaw: 0 },
    { id: `${P}.alric`, x: 2.5, z: 3.5, facing: { x: 0, z: 2 } },
    ...COOLING_CHANNELS.flatMap((c) => [
      // Three sluice wheels on the west wall, 6 m apart, facing the wall.
      ...[1, 2, 3].map((w) => ({ id: `${P}.wheel.${c.n}.${w}`, x: -12.5, z: c.z0 + 4 + (w - 1) * 6, facing: { x: -14, z: c.z0 + 4 + (w - 1) * 6 } })),
      { id: `${P}.gauge.${c.n}`, x: 0, z: c.z1 - 2.5, facing: { x: 0, z: c.z1 } },
      { id: `${P}.chart.${c.n}`, x: -8, z: c.z0 + 2, facing: { x: -8, z: c.z0 } },
      { id: `${P}.checkpoint.${c.n}`, x: 0, z: c.z0 + 2.5, yaw: 180 },
    ]),
    // Dormant golems on plinths along the flumes of channels 2 and 3 and in the forge; N10 wakes them between channels.
    ...[2, 3].flatMap((n) => {
      const c = COOLING_CHANNELS[n - 1]!;
      return [1, 2].map((k) => ({ id: `${P}.golem.${n}.${k}`, x: 3, z: c.z0 + 4 + (k - 1) * 8, facing: { x: 0, z: c.z0 } }));
    }),
    ...[1, 2].map((k) => ({ id: `${P}.golem.4.${k}`, x: -6 + (k - 1) * 12, z: 88, facing: { x: 0, z: 82 } })),
    { id: `${P}.forge`, x: 0, z: 94, facing: { x: 0, z: 100 } },
    { id: `${P}.reward`, x: -6.5, z: 94, facing: { x: -10, z: 94 } },
  ],
  triggers: COOLING_CHANNELS.map((c) => ({ id: `${T}.chan.${c.n}`, center: { x: 0, y: 3, z: (c.z0 + c.z1) / 2 }, half: { x: 14, y: 3, z: 10 } })),
  doors: [{ doorId: COOLING_HALL_DOOR_ID, outside: DOOR_COOLING_HALL, inside: `${P}.entry`, exit: `${P}.exit` }],
  environment: {
    fogColor: 0x1a1410,
    fogNear: 12,
    fogFar: 60,
    skyColor: 0x7a6a60,
    groundColor: 0x1c1410,
    ambientIntensity: 0.5,
    lightColor: 0xffb070,
    lightIntensity: 12,
    lightDistance: 18,
  },
};
export type { LocalRect };
