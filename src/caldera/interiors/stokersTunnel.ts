// The old stokers' tunnel (Act 5 N2, R27), greybox: a mouth, a straight tunnel 5 m wide and a far gallery behind a seal. The seal
// is closed in the sealed state and open in the open variant (`story.r27.farOpen`, N11 writes it; the plugin owns the blocker so a
// player standing in the gallery is never sealed in). Local metres from the door, rooms run +Z.
import type { InteriorDef } from '../../interiors/types';
import { BLOCKERS, CALDERA_INTERIOR_SITES, DOOR_TUNNEL, INT_ANCHOR, INT_TRIGGER, STOKERS_TUNNEL_DOOR_ID, STOKERS_TUNNEL_ID } from './sites';

const P = `${INT_ANCHOR}.tunnel`;
const T = `${INT_TRIGGER}.tunnel`;
/** The trigger over the far gallery (the plugin's seal guard reads it). */
export const TUNNEL_FAR_TRIGGER = `${T}.far`;
/** The entry anchor's local z (the origin is the door) and where the far gallery starts (the plugin's occupancy check). */
export const TUNNEL_ENTRY_Z = 2;
export const TUNNEL_GALLERY_Z0 = 54;

export const STOKERS_TUNNEL_DEF: InteriorDef = {
  id: STOKERS_TUNNEL_ID,
  site: { ...CALDERA_INTERIOR_SITES[STOKERS_TUNNEL_ID] },
  rooms: [
    { id: 'mouth', x0: -4, z0: -1.5, x1: 4, z1: 6, height: 5 },
    { id: 'tunnel', x0: -2.5, z0: 6, x1: 2.5, z1: 54, height: 5 },
    { id: 'far-gallery', x0: -6, z0: 54, x1: 6, z1: 80, height: 6 },
  ],
  pillars: [],
  props: [],
  blockers: [{ id: BLOCKERS.tunnelSeal, rect: { x0: -2.5, z0: 53, x1: 2.5, z1: 54 }, height: 5, startClosed: true }],
  torches: [
    { x: -3.9, y: 3, z: 3 },
    { x: 3.9, y: 3, z: 3 },
    ...[16, 32, 46].flatMap((z) => [
      { x: -2.4, y: 3, z },
      { x: 2.4, y: 3, z },
    ]),
    { x: -5.9, y: 3, z: 70 },
    { x: 5.9, y: 3, z: 70 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: TUNNEL_ENTRY_Z, yaw: 180 },
    { id: `${P}.exit`, x: 0, z: -0.8, yaw: 0 },
    { id: `${P}.checkpoint`, x: 0, z: 3, yaw: 180 },
    // Shoring props (R27: prop it), lamps (light it) and the charges at the far shoring, all on the near side of the seal.
    ...[18, 28, 38].map((z, i) => ({ id: `${P}.prop.${i + 1}`, x: 0, z, facing: { x: 0, z: 54 } })),
    ...[14, 22, 30, 38].map((z, i) => ({ id: `${P}.lamp.${i + 1}`, x: i % 2 ? 1.5 : -1.5, z, facing: { x: i % 2 ? 1.5 : -1.5, z: z + 8 } })),
    ...[44, 47, 50].map((z, i) => ({ id: `${P}.charge.${i + 1}`, x: (i - 1) * 1.5, z, facing: { x: (i - 1) * 1.5, z: 54 } })),
    // The garrison posts on the mouth side and N4's defence line (the wave barricade), the foes press from z 48..52.
    ...[10, 14, 18, 22].flatMap((z, i) => [
      { id: `${P}.post.${i * 2 + 1}`, x: -1.5, z, facing: { x: 0, z: 48 } },
      { id: `${P}.post.${i * 2 + 2}`, x: 1.5, z, facing: { x: 0, z: 48 } },
    ]),
    { id: `${P}.line.1`, x: -2, z: 41, facing: { x: 0, z: 54 } },
    { id: `${P}.line.2`, x: 2, z: 41, facing: { x: 0, z: 54 } },
    ...[48, 51].flatMap((z, r) => [-1.5, 0, 1.5].map((x, c) => ({ id: `${P}.spawn.${r * 3 + c + 1}`, x, z, facing: { x: 0, z: 0 } }))),
    ...[66, 70].flatMap((z, r) => [-3, 3].map((x, c) => ({ id: `${P}.far.spawn.${r * 2 + c + 1}`, x, z, facing: { x: 0, z: 54 } }))),
  ],
  triggers: [
    { id: `${T}.hold`, center: { x: 0, y: 2, z: 30 }, half: { x: 2.5, y: 2, z: 24 } },
    { id: TUNNEL_FAR_TRIGGER, center: { x: 0, y: 2, z: 67 }, half: { x: 6, y: 3, z: 13 } },
  ],
  doors: [{ doorId: STOKERS_TUNNEL_DOOR_ID, outside: DOOR_TUNNEL, inside: `${P}.entry`, exit: `${P}.exit` }],
  environment: {
    fogColor: 0x14100c,
    fogNear: 8,
    fogFar: 44,
    skyColor: 0x6a5c50,
    groundColor: 0x16110d,
    ambientIntensity: 0.42,
    lightColor: 0xffb878,
    lightIntensity: 11,
    lightDistance: 16,
  },
};
