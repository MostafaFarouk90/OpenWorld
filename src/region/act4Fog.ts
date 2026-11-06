// Act 4 fog faces (contracts v0.8 item 3, plan Part 3.4): conditions and toasts. The shipped `fog.ashen-waste` opens on
// M41; the three shipped never-open Waste faces keep NEVER with a new Act 4 text ("only Ashgate enters"); the new
// `fog.waste-edge` and the four Caldera rim faces are placed in act4/act4World.ts; the occupied city's gate faces are
// rules here, and L2 places and registers them (`cityGateFaceDef`) on its anchors.
import type { FlagCondition } from '../core/flagCondition';
import { ASH_ROAD_OPEN_WHEN, OCCUPIED_FLAG, WASTE_EDGE_OPEN_WHEN } from './act4Containment';
import type { FogWallDef } from './fogWall';
import { GATE_NAMES } from '../harrowmark/city';

const NEVER: FlagCondition = { any: ['region.never'] };

export const FOG_TOAST_ASHGATE_ONLY = 'region.fog.ashgateOnly.toast';
export const FOG_TOAST_WASTE_PHASE_G = 'region.fog.wasteEdge.phaseG.toast';
export const FOG_TOAST_WASTE_HILD = 'region.fog.wasteEdge.hild.toast';
export const FOG_TOAST_CALDERA_RIM = 'region.fog.calderaRim.toast';
export const FOG_TOAST_CITY_HELD = 'region.fog.cityHeld.toast';

export const ACT4_FOG_STRINGS_EN: Record<string, string> = {
  [FOG_TOAST_ASHGATE_ONLY]: "The drifts are too deep this way. The Ashwalkers' road starts at Ashgate.",
  [FOG_TOAST_WASTE_PHASE_G]: "The Ashwalkers' road is next. The way opens in a later update.",
  [FOG_TOAST_WASTE_HILD]: "Hild will not let you onto the rope without Wulfhild's word.",
  [FOG_TOAST_CALDERA_RIM]: "The rim is Act 5's. Rest at Wulfhild's fire.",
  [FOG_TOAST_CITY_HELD]: "Vey's men hold the gate. The city is not yours tonight.",
};

/** From Act 4, the never-open Waste faces say where the way in is. */
export const ASHGATE_ONLY_TOASTS: NonNullable<FogWallDef['toastWhen']> = [{ when: { all: ['story.gate.a4'] }, key: FOG_TOAST_ASHGATE_ONLY }];

/** The rules Act 4 sets on shipped faces (act2World.ts and act3World.ts spread them in). */
export const ACT4_SHIPPED_FACE_RULES = {
  'fog.ashen-waste': { openWhen: ASH_ROAD_OPEN_WHEN },
  'fog.caldera': { toastWhen: ASHGATE_ONLY_TOASTS },
  'fog.wyrmwatch-waste': { toastWhen: ASHGATE_ONLY_TOASTS },
  'fog.fen-waste': { toastWhen: ASHGATE_ONLY_TOASTS },
} as const satisfies Record<string, Partial<Pick<FogWallDef, 'openWhen' | 'toastWhen'>>>;

export type Act4FogFaceId = 'fog.waste-edge' | 'fog.waste-north' | 'fog.caldera-rim.n' | 'fog.caldera-rim.e' | 'fog.caldera-rim.s' | 'fog.caldera-rim.w';
export type Act4FogFace = Pick<FogWallDef, 'openWhen' | 'toastKey' | 'toastWhen'> & { id: Act4FogFaceId };

/** Phase G (M41 done, the hold standing) gives the "later update" text; before that, Hild's. */
const WASTE_EDGE_TOASTS: NonNullable<FogWallDef['toastWhen']> = [
  { when: { any: ['story.m41.complete', 'story.m42.started'], none: ['story.phase.wasteOpen'] }, key: FOG_TOAST_WASTE_PHASE_G },
];

export const ACT4_FOG_FACES: readonly Act4FogFace[] = [
  { id: 'fog.waste-edge', openWhen: WASTE_EDGE_OPEN_WHEN, toastKey: FOG_TOAST_WASTE_HILD, toastWhen: WASTE_EDGE_TOASTS },
  { id: 'fog.waste-north', openWhen: NEVER, toastKey: FOG_TOAST_ASHGATE_ONLY },
  ...(['n', 'e', 's', 'w'] as const).map((d): Act4FogFace => ({ id: `fog.caldera-rim.${d}`, openWhen: NEVER, toastKey: FOG_TOAST_CALDERA_RIM })),
];

export function act4FogFace(id: Act4FogFaceId): Act4FogFace {
  const f = ACT4_FOG_FACES.find((x) => x.id === id);
  if (!f) throw new Error(`act4Fog: unknown face "${id}"`);
  return f;
}

/**
 * The occupied city's gates (Q2): the city's seven (`harrowmark/city.ts` GATE_NAMES). L2 owns the anchors
 * (`harrowmark.a4.gate.<gate>.face`), which gates are working, and the shutters; a face with no anchor is not registered.
 */
export const HARROWMARK_GATES = GATE_NAMES;
export type HarrowmarkGate = (typeof GATE_NAMES)[number];

/** Closed from the betrayal (M38) until Act 5; one face per working gate, on its outside. */
export const CITY_HELD_OPEN_WHEN: FlagCondition = { none: [OCCUPIED_FLAG] };

export interface CityGateFace extends Pick<FogWallDef, 'id' | 'anchorId' | 'openWhen' | 'toastKey'> {
  gate: HarrowmarkGate;
}

/** L2: a held gate's full face from its rules and its placement (L2 registers it with the shipped fog wall builder). */
export function cityGateFaceDef(gate: HarrowmarkGate, placement: Pick<FogWallDef, 'axis' | 'halfLength' | 'blockedSide'> & Partial<Pick<FogWallDef, 'pushBackTo' | 'cullBeyond' | 'pushDepth'>>): FogWallDef {
  const f = HARROWMARK_GATE_FACES.find((x) => x.gate === gate);
  if (!f) throw new Error(`act4Fog: unknown gate "${gate}"`);
  const { gate: _g, ...rules } = f;
  return { ...rules, pushBackTo: 1, ...placement };
}

export const HARROWMARK_GATE_FACES: readonly CityGateFace[] = HARROWMARK_GATES.map((gate) => ({
  id: `fog.harrowmark.gate.${gate}`,
  gate,
  anchorId: `harrowmark.a4.gate.${gate}.face`,
  openWhen: CITY_HELD_OPEN_WHEN,
  toastKey: FOG_TOAST_CITY_HELD,
}));
